/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { FloatingHUD } from './components/FloatingHUD';
import { ManhwaViewer } from './components/ManhwaViewer';
import { BookViewer } from './components/BookViewer';
import { ReadZoneInspector } from './components/ReadZoneInspector';
import { PythonScriptExporter } from './components/PythonScriptExporter';
import { SAMPLE_MANHWA_CHAPTERS, SAMPLE_BOOK_CHAPTERS } from './data/sampleContent';
import type { ReaderSettings, DeduplicationEntry } from './types';
import { audioQueue } from './services/audioQueue';

export default function App() {
  const [activeView, setActiveView] = useState<'reader' | 'inspector' | 'code_export'>('reader');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Application Settings State with OmniVoice & Modular TTS Defaults
  const [settings, setSettings] = useState<ReaderSettings>({
    mode: 'manhwa',
    isPlaying: false,
    baseScrollSpeed: 3.0,
    currentActualSpeed: 3.0,
    readZoneY: 40,
    readZoneHeight: 20,
    fuzzyThreshold: 85,
    ttsEngine: 'omnivoice',
    omniVoiceUrl: 'http://127.0.0.1:8001',
    omniVoiceReferenceClip: 'audio.wav',
    omniVoiceReferenceText: 's. up to the imperial throne, perfectly lit by rays of the sun, she received the symbol of her rightful crown; the symbol of the empire\'s new ruler was placed upon her crimson head',
    omniVoiceLanguage: 'English',
    voiceName: '',
    ttsRate: 1.0,
    ttsVolume: 1.0,
    actionPacingMultiplier: 1.5,
    dialogueSlowdownMultiplier: 0.3,
    hudDocked: false,
    hudVisible: true,
    activeBubbleId: null,
    activeParagraphIndex: null,
    readerTheme: 'dark',
    fontSize: 18,
  });

  const [deduplicationEntries, setDeduplicationEntries] = useState<DeduplicationEntry[]>([]);

  // Stop audio immediately if user pauses reader
  useEffect(() => {
    if (!settings.isPlaying) {
      audioQueue.stopAll();
    }
  }, [settings.isPlaying]);

  // Load available WebSpeech synthesis voices
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        if (availableVoices.length > 0 && !settings.voiceName) {
          const englishVoice = availableVoices.find((v) => v.lang.startsWith('en')) || availableVoices[0];
          setSettings((prev) => ({ ...prev, voiceName: englishVoice.name }));
        }
      }
    };

    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // Add deduplication log entry
  const handleAddDeduplicationEntry = useCallback((entry: DeduplicationEntry) => {
    setDeduplicationEntries((prev) => [entry, ...prev.slice(0, 49)]);
  }, []);

  // Strict Single-Stream Audio Playback Handler via AudioQueueService
  const handleSpeakText = useCallback(
    (text: string, onEnded?: () => void) => {
      audioQueue.playText(
        text,
        {
          engine: settings.ttsEngine,
          omniVoiceUrl: settings.omniVoiceUrl,
          omniVoiceReferenceClip: settings.omniVoiceReferenceClip,
          omniVoiceReferenceText: settings.omniVoiceReferenceText,
          omniVoiceLanguage: settings.omniVoiceLanguage,
          voiceName: settings.voiceName,
          rate: settings.ttsRate,
          volume: settings.ttsVolume,
        },
        onEnded
      );
    },
    [
      settings.ttsEngine,
      settings.omniVoiceUrl,
      settings.omniVoiceReferenceClip,
      settings.omniVoiceReferenceText,
      settings.omniVoiceLanguage,
      settings.voiceName,
      settings.ttsRate,
      settings.ttsVolume,
    ]
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Navigation Header Bar */}
      <Navbar
        settings={settings}
        onUpdateSettings={setSettings}
        activeView={activeView}
        setActiveView={setActiveView}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
      />

      {/* Main Active View Area */}
      <main className="flex-1 relative overflow-hidden">
        {activeView === 'reader' && (
          <>
            {settings.mode === 'manhwa' ? (
              <ManhwaViewer
                chapter={SAMPLE_MANHWA_CHAPTERS[0]}
                settings={settings}
                onUpdateSettings={setSettings}
                onAddDeduplicationEntry={handleAddDeduplicationEntry}
                onSpeakText={handleSpeakText}
              />
            ) : (
              <BookViewer
                chapter={SAMPLE_BOOK_CHAPTERS[0]}
                settings={settings}
                onUpdateSettings={setSettings}
                onAddDeduplicationEntry={handleAddDeduplicationEntry}
                onSpeakText={handleSpeakText}
              />
            )}
          </>
        )}

        {activeView === 'inspector' && (
          <ReadZoneInspector
            settings={settings}
            onUpdateSettings={setSettings}
            deduplicationEntries={deduplicationEntries}
            onClearDeduplicationLogs={() => setDeduplicationEntries([])}
          />
        )}

        {activeView === 'code_export' && <PythonScriptExporter settings={settings} />}

        {/* Semi-Transparent Floating Overlay HUD Widget */}
        <FloatingHUD
          settings={settings}
          onUpdateSettings={setSettings}
          voices={voices}
          recentDeduplicationCount={deduplicationEntries.filter((e) => e.isDuplicate).length}
        />
      </main>
    </div>
  );
}
