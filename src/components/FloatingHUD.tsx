import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Sliders,
  Volume2,
  Eye,
  Minimize2,
  Maximize2,
  Move,
  RotateCcw,
  Sparkles,
  Zap,
  CheckCircle2,
  X,
  Bot,
  Radio,
  Lock,
  Server,
  SlidersHorizontal,
} from 'lucide-react';
import type { ReaderSettings, ReadingMode, TTSEngineType } from '../types';
import { audioQueue } from '../services/audioQueue';

interface FloatingHUDProps {
  settings: ReaderSettings;
  onUpdateSettings: (updater: (prev: ReaderSettings) => ReaderSettings) => void;
  voices: SpeechSynthesisVoice[];
  recentDeduplicationCount?: number;
}

export const FloatingHUD: React.FC<FloatingHUDProps> = ({
  settings,
  onUpdateSettings,
  voices,
  recentDeduplicationCount = 0,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [showOmniSettings, setShowOmniSettings] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isAudioBusy, setIsAudioBusy] = useState(false);

  // Subscribe to real-time audio queue mutex state
  useEffect(() => {
    const unsubscribe = audioQueue.subscribeStatus((busy) => {
      setIsAudioBusy(busy);
    });
    return unsubscribe;
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: Math.max(10, Math.min(window.innerWidth - 380, e.clientX - dragOffset.x)),
      y: Math.max(60, Math.min(window.innerHeight - 120, e.clientY - dragOffset.y)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!settings.hudVisible) return null;

  if (isMinimized) {
    return (
      <div
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed z-50 bg-zinc-950/95 backdrop-blur-xl border border-zinc-700/80 rounded-full px-4 py-2 shadow-2xl text-zinc-100 flex items-center gap-3 cursor-move ring-1 ring-blue-500/30"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                settings.isPlaying ? 'bg-blue-400' : 'bg-zinc-500'
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                settings.isPlaying ? 'bg-blue-500' : 'bg-zinc-600'
              }`}
            ></span>
          </span>
          <span className="font-bold text-xs uppercase font-mono tracking-wider text-zinc-200">
            V-HUD Pro
          </span>
        </div>

        <button
          onClick={() =>
            onUpdateSettings((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
          }
          className="p-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-md"
        >
          {settings.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => setIsMinimized(false)}
          className="p-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-50 w-84 md:w-96 bg-zinc-950/92 backdrop-blur-2xl border border-zinc-800 rounded-2xl shadow-2xl shadow-black/80 text-zinc-100 overflow-hidden transition-all duration-75"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Title Bar - Drag Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="bg-zinc-900 px-4 py-2.5 flex items-center justify-between border-b border-zinc-800 cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <Move className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-bold text-xs tracking-wider uppercase font-mono text-zinc-200">
            Screen Reader Overlay HUD
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] bg-blue-950/80 border border-blue-800/60 text-blue-300 font-mono px-2 py-0.5 rounded-md font-semibold">
            {settings.mode === 'manhwa' ? 'MANHWA' : 'BOOK'}
          </span>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
            title="Minimize"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() =>
              onUpdateSettings((prev) => ({ ...prev, hudVisible: false }))
            }
            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3.5 text-xs">
        {/* Mode Selector Switch */}
        <div className="flex items-center justify-between bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() =>
              onUpdateSettings((prev) => ({ ...prev, mode: 'manhwa' }))
            }
            className={`flex-1 py-1.5 rounded-lg font-semibold text-center transition-all ${
              settings.mode === 'manhwa'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            📜 Manhwa Mode
          </button>
          <button
            onClick={() =>
              onUpdateSettings((prev) => ({ ...prev, mode: 'book' }))
            }
            className={`flex-1 py-1.5 rounded-lg font-semibold text-center transition-all ${
              settings.mode === 'book'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-950/50'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            📖 Book Mode
          </button>
        </div>

        {/* Master Play/Pause Controller */}
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              onUpdateSettings((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
            }
            className={`flex-1 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg text-xs tracking-wide uppercase font-mono ${
              settings.isPlaying
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/60'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/60'
            }`}
          >
            {settings.isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" /> Pause Screen Reader
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> Start Screen Reader
              </>
            )}
          </button>
        </div>

        {/* Audio Queue Concurrency & Mutex Monitor */}
        <div className="bg-zinc-900/90 px-3 py-2 rounded-xl border border-zinc-800 flex items-center justify-between font-mono text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-blue-400" />
            Audio Mutex Lock:
          </span>
          <span
            className={`font-bold px-2 py-0.5 rounded text-[10px] ${
              isAudioBusy
                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                : 'bg-zinc-950 text-zinc-400 border border-zinc-800'
            }`}
          >
            {isAudioBusy ? '⚡ STREAM ACTIVE (LOCKED)' : 'IDLE (READY)'}
          </span>
        </div>

        {/* Modular TTS Engine Selector */}
        <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between font-mono">
            <span className="text-zinc-300 font-medium flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-blue-400" /> Modular TTS Engine
            </span>
            <button
              onClick={() => setShowOmniSettings((prev) => !prev)}
              className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-mono"
            >
              <SlidersHorizontal className="w-3 h-3" /> Config
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() =>
                onUpdateSettings((prev) => ({ ...prev, ttsEngine: 'omnivoice' }))
              }
              className={`py-1.5 rounded text-[10px] font-semibold text-center flex items-center justify-center gap-1 transition-all ${
                settings.ttsEngine === 'omnivoice'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Radio className="w-3 h-3" /> OmniVoice
            </button>
            <button
              onClick={() =>
                onUpdateSettings((prev) => ({ ...prev, ttsEngine: 'gemini_ai' }))
              }
              className={`py-1.5 rounded text-[10px] font-semibold text-center flex items-center justify-center gap-1 transition-all ${
                settings.ttsEngine === 'gemini_ai'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Bot className="w-3 h-3" /> Gemini AI
            </button>
            <button
              onClick={() =>
                onUpdateSettings((prev) => ({ ...prev, ttsEngine: 'webspeech' }))
              }
              className={`py-1.5 rounded text-[10px] font-semibold text-center transition-all ${
                settings.ttsEngine === 'webspeech'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              WebSpeech
            </button>
          </div>

          {/* OmniVoice Endpoint Configuration Drawer */}
          {showOmniSettings && (
            <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="flex items-center gap-1">
                  <Server className="w-3 h-3 text-blue-400" /> OmniVoice Server Config
                </span>
                <span className="text-[9px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                  Ready (Port 8001)
                </span>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500">Local Endpoint:</label>
                <input
                  type="text"
                  value={settings.omniVoiceUrl || 'http://127.0.0.1:8001'}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({ ...prev, omniVoiceUrl: e.target.value }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 text-[10px]"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span>Reference Audio (File path / Name):</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings((prev) => ({
                        ...prev,
                        omniVoiceReferenceClip: 'audio.wav',
                      }))
                    }
                    className="text-[9px] text-cyan-400 hover:text-cyan-300 underline font-mono"
                  >
                    Use audio.wav
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="e.g. audio.wav or C:/voices/hero.wav"
                  value={settings.omniVoiceReferenceClip || 'audio.wav'}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({ ...prev, omniVoiceReferenceClip: e.target.value }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 text-[10px]"
                />
              </div>

              {/* Reference Transcript Text (Optional but recommended for high quality voice cloning) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span>Reference Text (Transcript):</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings((prev) => ({
                        ...prev,
                        omniVoiceReferenceText:
                          's. up to the imperial throne, perfectly lit by rays of the sun, she received the symbol of her rightful crown; the symbol of the empire\'s new ruler was placed upon her crimson head',
                      }))
                    }
                    className="text-[9px] text-blue-400 hover:text-blue-300 underline"
                  >
                    Paste Demo Text
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Transcript of the reference audio clip (improves voice clone quality)..."
                  value={settings.omniVoiceReferenceText || ''}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({ ...prev, omniVoiceReferenceText: e.target.value }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 text-[10px] resize-none"
                />
              </div>

              {/* Target Language Selector */}
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400">Language (optional):</label>
                <select
                  value={settings.omniVoiceLanguage || 'English'}
                  onChange={(e) =>
                    onUpdateSettings((prev) => ({ ...prev, omniVoiceLanguage: e.target.value }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 text-[10px]"
                >
                  <option value="English">English</option>
                  <option value="Auto">Auto-detect</option>
                  <option value="Korean">Korean (한국어)</option>
                  <option value="Japanese">Japanese (日本語)</option>
                  <option value="Chinese">Chinese (中文)</option>
                  <option value="Spanish">Spanish (Español)</option>
                  <option value="French">French (Français)</option>
                  <option value="German">German (Deutsch)</option>
                </select>
              </div>

              {/* Test Audio Button */}
              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={() => {
                    audioQueue.playText(
                      'Just as the monster raised its blade, the time around us froze completely.',
                      {
                        engine: 'omnivoice',
                        omniVoiceUrl: settings.omniVoiceUrl,
                        omniVoiceReferenceClip: settings.omniVoiceReferenceClip,
                        omniVoiceReferenceText: settings.omniVoiceReferenceText,
                        omniVoiceLanguage: settings.omniVoiceLanguage,
                        rate: settings.ttsRate,
                        volume: settings.ttsVolume,
                      }
                    );
                  }}
                  className="flex-1 py-1 px-2 rounded bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-300 text-[10px] font-mono flex items-center justify-center gap-1.5 transition-all"
                >
                  <Volume2 className="w-3 h-3 text-blue-400" />
                  <span>Test OmniVoice Voice Clone</span>
                </button>
              </div>
              <p className="text-[9px] text-zinc-500 leading-tight">
                * In desktop Python app, connects directly to <code className="text-zinc-400">127.0.0.1:8001</code>. In web browser preview, audio synthesis plays with fallback.
              </p>
            </div>
          )}

          {/* Voice selector dropdown for WebSpeech */}
          {voices.length > 0 && settings.ttsEngine === 'webspeech' && (
            <select
              value={settings.voiceName}
              onChange={(e) =>
                onUpdateSettings((prev) => ({ ...prev, voiceName: e.target.value }))
              }
              className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-blue-500"
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          )}

          {/* Speech Rate Slider */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 font-mono">TTS Speed Rate:</span>
            <span className="text-blue-400 font-bold font-mono">{settings.ttsRate}x</span>
          </div>
          <input
            type="range"
            min="0.7"
            max="1.8"
            step="0.1"
            value={settings.ttsRate}
            onChange={(e) =>
              onUpdateSettings((prev) => ({
                ...prev,
                ttsRate: parseFloat(e.target.value),
              }))
            }
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Read Zone Geometry Controls (Y Position & Height) */}
        <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between font-mono">
            <span className="text-zinc-300 font-medium flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-cyan-400" /> Read Zone Position &amp; Height
            </span>
            <span className="text-cyan-400 font-bold font-mono text-[11px]">
              Y: {settings.readZoneY}% | H: {settings.readZoneHeight}%
            </span>
          </div>

          {/* Mini Visual Diagram of the Read Zone Position */}
          <div className="relative w-full h-8 bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
            <div
              style={{
                top: `${settings.readZoneY}%`,
                height: `${settings.readZoneHeight}%`,
              }}
              className="absolute left-0 right-0 bg-cyan-500/30 border-y border-cyan-400 flex items-center justify-center transition-all duration-75"
            >
              <span className="text-[9px] font-mono text-cyan-200 font-bold tracking-tight">
                ACTIVE CAPTURE BAND
              </span>
            </div>
          </div>

          {/* Read Zone Vertical Position (Y-Axis) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-mono">Vertical Position (Y Offset):</span>
              <span className="text-cyan-300 font-bold font-mono">{settings.readZoneY}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="85"
              step="1"
              value={settings.readZoneY}
              onChange={(e) =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  readZoneY: parseInt(e.target.value, 10),
                }))
              }
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                onClick={() => onUpdateSettings((prev) => ({ ...prev, readZoneY: 20 }))}
                className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono"
              >
                Top (20%)
              </button>
              <button
                onClick={() => onUpdateSettings((prev) => ({ ...prev, readZoneY: 40 }))}
                className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono"
              >
                Center (40%)
              </button>
              <button
                onClick={() => onUpdateSettings((prev) => ({ ...prev, readZoneY: 65 }))}
                className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono"
              >
                Bottom (65%)
              </button>
            </div>
          </div>

          {/* Read Zone Band Height */}
          <div className="space-y-1 pt-1 border-t border-zinc-800/80">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 font-mono">Band Height (Thickness):</span>
              <span className="text-cyan-300 font-bold font-mono">{settings.readZoneHeight}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="1"
              value={settings.readZoneHeight}
              onChange={(e) =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  readZoneHeight: parseInt(e.target.value, 10),
                }))
              }
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                onClick={() => onUpdateSettings((prev) => ({ ...prev, readZoneHeight: 15 }))}
                className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono"
              >
                Slim (15%)
              </button>
              <button
                onClick={() => onUpdateSettings((prev) => ({ ...prev, readZoneHeight: 25 }))}
                className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono"
              >
                Standard (25%)
              </button>
              <button
                onClick={() => onUpdateSettings((prev) => ({ ...prev, readZoneHeight: 40 }))}
                className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono"
              >
                Deep (40%)
              </button>
            </div>
          </div>
        </div>

        {/* Scroll Speed Slider */}
        <div className="bg-zinc-900/90 p-3 rounded-xl border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between font-mono">
            <span className="text-zinc-300 font-medium flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Scroll Baseline Speed
            </span>
            <span className="text-blue-400 font-bold font-mono">
              {settings.baseScrollSpeed} px
            </span>
          </div>

          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={settings.baseScrollSpeed}
            onChange={(e) =>
              onUpdateSettings((prev) => ({
                ...prev,
                baseScrollSpeed: parseFloat(e.target.value),
              }))
            }
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Deduplication Buffer Log Status */}
        <div className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between font-mono text-[11px]">
          <span className="text-zinc-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            thefuzz Deduplication:
          </span>
          <span className="text-blue-300 font-bold bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/50">
            {recentDeduplicationCount} Discarded
          </span>
        </div>
      </div>
    </div>
  );
};
