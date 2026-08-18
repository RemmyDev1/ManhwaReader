/**
 * AudioQueueService: Strict single-stream blocking audio queue & playback manager
 * Prevents multiple TTS audio streams from overlapping or talking concurrently in Book & Manhwa modes.
 */

type AudioEndedCallback = () => void;

interface PlayOptions {
  engine: 'omnivoice' | 'gemini_ai' | 'webspeech' | 'pyttsx3';
  omniVoiceUrl?: string;
  omniVoiceReferenceClip?: string;
  omniVoiceReferenceText?: string;
  omniVoiceLanguage?: string;
  voiceName?: string;
  rate?: number;
  volume?: number;
}

class AudioQueueService {
  private isPlaying = false;
  private currentSessionId = 0;
  private activeAudioElement: HTMLAudioElement | null = null;
  private activeAudioContext: AudioContext | null = null;
  private activeSourceNode: AudioBufferSourceNode | null = null;
  private statusListeners: Set<(isBusy: boolean, currentText?: string) => void> = new Set();
  private currentText = '';

  public subscribeStatus(listener: (isBusy: boolean, currentText?: string) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.isPlaying, this.currentText);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatus(busy: boolean, text = '') {
    this.isPlaying = busy;
    this.currentText = text;
    this.statusListeners.forEach((fn) => fn(busy, text));
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Stop all active audio streams immediately and invalidate callbacks
   */
  public stopAll(): void {
    this.currentSessionId++; // Invalidate any pending session
    this.notifyStatus(false, '');

    // 1. Cancel browser SpeechSynthesis
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
    }

    // 2. Stop HTML5 Audio Element if playing
    if (this.activeAudioElement) {
      try {
        this.activeAudioElement.pause();
        this.activeAudioElement.currentTime = 0;
        this.activeAudioElement.src = '';
      } catch (e) {
        // ignore
      }
      this.activeAudioElement = null;
    }

    // 3. Stop Web Audio Source Node
    if (this.activeSourceNode) {
      try {
        this.activeSourceNode.stop();
        this.activeSourceNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.activeSourceNode = null;
    }

    if (this.activeAudioContext && this.activeAudioContext.state !== 'closed') {
      try {
        this.activeAudioContext.close().catch(() => {});
      } catch (e) {
        // ignore
      }
      this.activeAudioContext = null;
    }
  }

  /**
   * Play text with strict single-audio blocking guarantee
   */
  public async playText(
    text: string,
    options: PlayOptions,
    onEnded?: AudioEndedCallback
  ): Promise<void> {
    const cleanText = text.trim();
    if (!cleanText) {
      if (onEnded) onEnded();
      return;
    }

    // Stop and invalidate any existing playback session
    this.stopAll();

    const sessionId = ++this.currentSessionId;
    this.notifyStatus(true, cleanText);

    const handleFinished = () => {
      if (this.currentSessionId === sessionId) {
        this.notifyStatus(false, '');
        if (onEnded) onEnded();
      }
    };

    try {
      // 1. OmniVoice Local Server Integration
      if (options.engine === 'omnivoice') {
        const played = await this.playWithOmniVoice(cleanText, options, sessionId, handleFinished);
        if (played) return;
        // If OmniVoice local server is offline / unreachable in web preview, use Gemini AI or WebSpeech
        const geminiFallback = await this.playWithGeminiAI(cleanText, sessionId, handleFinished);
        if (geminiFallback) return;
      }

      // 2. Gemini AI TTS Integration
      if (options.engine === 'gemini_ai') {
        const played = await this.playWithGeminiAI(cleanText, sessionId, handleFinished);
        if (played) return;
      }

      // 3. WebSpeech API Mode (Standard fallback)
      await this.playWithWebSpeech(cleanText, options, sessionId, handleFinished);
    } catch (err) {
      console.error('[AudioQueue] Error playing audio:', err);
      handleFinished();
    }
  }

  private async playWithOmniVoice(
    text: string,
    options: PlayOptions,
    sessionId: number,
    onFinish: () => void
  ): Promise<boolean> {
    try {
      const endpoint = '/api/tts-omnivoice';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          omniVoiceUrl: options.omniVoiceUrl || 'http://127.0.0.1:8001',
          referenceClip: options.omniVoiceReferenceClip || 'reference_voice_en_01.wav',
          referenceText: options.omniVoiceReferenceText || '',
          language: options.omniVoiceLanguage || 'English',
          speed: options.rate || 1.0,
        }),
      });

      if (!response.ok) {
        throw new Error(`OmniVoice HTTP ${response.status}`);
      }

      const data = await response.json();
      if (this.currentSessionId !== sessionId) return true; // Cancelled

      if (data.audioBase64) {
        return this.playBase64Audio(data.audioBase64, data.mimeType || 'audio/wav', sessionId, onFinish);
      } else if (data.simulated) {
        // If mocked/simulated because local server isn't reachable from cloud container
        console.info('[AudioQueue] Using OmniVoice simulated mode');
        return false; // let webspeech speak the text
      }
      return false;
    } catch (err) {
      console.warn('[AudioQueue] OmniVoice request error:', err);
      return false;
    }
  }

  private async playWithGeminiAI(
    text: string,
    sessionId: number,
    onFinish: () => void
  ): Promise<boolean> {
    try {
      const res = await fetch('/api/tts-synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'Kore' }),
      });

      if (!res.ok) return false;
      const data = await res.json();
      if (this.currentSessionId !== sessionId) return true;

      if (data.success && data.audioBase64) {
        return this.playPCM24kAudio(data.audioBase64, sessionId, onFinish);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  private playBase64Audio(
    base64Data: string,
    mimeType: string,
    sessionId: number,
    onFinish: () => void
  ): boolean {
    try {
      const audio = new Audio(`data:${mimeType};base64,${base64Data}`);
      this.activeAudioElement = audio;

      audio.onended = () => {
        if (this.currentSessionId === sessionId) {
          this.activeAudioElement = null;
          onFinish();
        }
      };

      audio.onerror = () => {
        if (this.currentSessionId === sessionId) {
          this.activeAudioElement = null;
          onFinish();
        }
      };

      audio.play().catch((err) => {
        console.warn('[AudioQueue] HTMLAudio play error:', err);
        onFinish();
      });

      return true;
    } catch (e) {
      console.warn('[AudioQueue] Base64 audio error:', e);
      return false;
    }
  }

  private playPCM24kAudio(
    base64Data: string,
    sessionId: number,
    onFinish: () => void
  ): boolean {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass({ sampleRate: 24000 });
      this.activeAudioContext = audioCtx;

      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768;
      }

      const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioCtx.createBufferSource();
      this.activeSourceNode = source;
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      source.onended = () => {
        if (this.currentSessionId === sessionId) {
          this.activeSourceNode = null;
          onFinish();
        }
      };

      source.start(0);
      return true;
    } catch (e) {
      console.warn('[AudioQueue] PCM Audio decode error:', e);
      return false;
    }
  }

  private playWithWebSpeech(
    text: string,
    options: PlayOptions,
    sessionId: number,
    onFinish: () => void
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        // Fallback timer simulation
        const words = text.split(/\s+/).length;
        const durationMs = Math.max(1200, (words / (2.5 * (options.rate || 1))) * 1000);
        setTimeout(() => {
          if (this.currentSessionId === sessionId) {
            onFinish();
          }
          resolve();
        }, durationMs);
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (options.voiceName) {
        const voices = window.speechSynthesis.getVoices();
        const matched = voices.find((v) => v.name === options.voiceName);
        if (matched) utterance.voice = matched;
      }

      utterance.rate = Math.max(0.5, Math.min(2.0, options.rate || 1.0));
      utterance.volume = Math.max(0.1, Math.min(1.0, options.volume || 1.0));

      let hasCompleted = false;
      const completeOnce = () => {
        if (hasCompleted) return;
        hasCompleted = true;
        if (this.currentSessionId === sessionId) {
          onFinish();
        }
        resolve();
      };

      utterance.onend = completeOnce;
      utterance.onerror = (e) => {
        console.warn('[AudioQueue] SpeechSynthesis error:', e);
        completeOnce();
      };

      // Safeguard timeout in case browser speech synthesis hangs
      const maxDurationMs = Math.max(2500, (text.length / 10) * 1000 + 3000);
      setTimeout(() => {
        if (!hasCompleted && this.currentSessionId === sessionId) {
          completeOnce();
        }
      }, maxDurationMs);

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    });
  }
}

export const audioQueue = new AudioQueueService();
