import React from 'react';
import type {
  ReaderSettings,
  DeduplicationEntry,
} from '../types';
import {
  Layers,
  Eye,
  CheckCircle2,
  XCircle,
  Sliders,
  Activity,
  Trash2,
  Filter,
  Bot,
  Zap,
  Lock,
} from 'lucide-react';

interface ReadZoneInspectorProps {
  settings: ReaderSettings;
  onUpdateSettings: (updater: (prev: ReaderSettings) => ReaderSettings) => void;
  deduplicationEntries: DeduplicationEntry[];
  onClearDeduplicationLogs: () => void;
}

export const ReadZoneInspector: React.FC<ReadZoneInspectorProps> = ({
  settings,
  onUpdateSettings,
  deduplicationEntries,
  onClearDeduplicationLogs,
}) => {
  return (
    <div className="w-full h-[calc(100vh-60px)] bg-zinc-950 text-zinc-100 p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
              Read Zone &amp; Deduplication Engine Diagnostics
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time inspection of screen capture bounds, OCR text extraction, and `thefuzz` string similarity filtering
          </p>
        </div>

        <button
          onClick={onClearDeduplicationLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-mono transition-all"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          <span>Clear Logs</span>
        </button>
      </div>

      {/* Grid Layout: Config & Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Read Zone Screen Capture Parameters */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-blue-400 uppercase tracking-wider">
            <Eye className="w-4 h-4" />
            <span>Read Zone Geometry (mss)</span>
          </div>

          {/* Visual Band Diagram */}
          <div className="relative w-full h-32 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden flex flex-col justify-between p-2">
            <div className="text-[10px] font-mono text-zinc-500">Screen Top (0%)</div>

            {/* Read Zone Band */}
            <div
              style={{
                marginTop: `${(settings.readZoneY / 100) * 80}px`,
                height: `${(settings.readZoneHeight / 100) * 80}px`,
              }}
              className="w-full bg-blue-600/20 border-y-2 border-blue-500 flex items-center justify-center text-blue-300 font-mono text-[10px] font-bold shadow-lg shadow-black"
            >
              ACTIVE CAPTURE BAND ({settings.readZoneHeight}% Height)
            </div>

            <div className="text-[10px] font-mono text-zinc-500 text-right">Screen Bottom (100%)</div>
          </div>

          <div className="space-y-3 text-xs font-mono">
            {/* Y Offset Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Y Offset (Top Position):</span>
                <span className="text-blue-300 font-bold">{settings.readZoneY}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="85"
                value={settings.readZoneY}
                onChange={(e) =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    readZoneY: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Band Height Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Band Height Ratio:</span>
                <span className="text-blue-300 font-bold">{settings.readZoneHeight}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                value={settings.readZoneHeight}
                onChange={(e) =>
                  onUpdateSettings((prev) => ({
                    ...prev,
                    readZoneHeight: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 pt-2">
              <span className="text-zinc-400">YOLOv8 Bubble Filter:</span>
              <span className="text-blue-400 font-bold">ACTIVE (Manga-YOLO)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Deduplication Similarity Threshold */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-blue-400 uppercase tracking-wider">
            <Filter className="w-4 h-4" />
            <span>thefuzz Fuzzy Matching</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Duplicate Cutoff:</span>
              <span className="text-blue-400 font-bold">{settings.fuzzyThreshold}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              value={settings.fuzzyThreshold}
              onChange={(e) =>
                onUpdateSettings((prev) => ({
                  ...prev,
                  fuzzyThreshold: parseInt(e.target.value, 10),
                }))
              }
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <p className="text-[11px] text-zinc-400">
              Evaluates Levenshtein distance &amp; token-set ratios against the past 15 spoken frames to avoid stuttering.
            </p>
          </div>

          <div className="space-y-2 border-t border-zinc-800 pt-3 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Total Scanned Blocks:</span>
              <span className="text-zinc-200 font-bold">{deduplicationEntries.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Duplicate Discards:</span>
              <span className="text-rose-400 font-bold">
                {deduplicationEntries.filter((e) => e.isDuplicate).length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Spoken to TTS:</span>
              <span className="text-emerald-400 font-bold">
                {deduplicationEntries.filter((e) => !e.isDuplicate).length}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Dynamic Pacing & TTS Telemetry */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-blue-400 uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            <span>Pacing Engine Telemetry</span>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">TTS Engine:</span>
              <span className="text-blue-300 font-bold uppercase">{settings.ttsEngine}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">OmniVoice URL:</span>
              <span className="text-zinc-300 font-bold text-[10px]">{settings.omniVoiceUrl || '127.0.0.1:8001'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Audio Queue Mutex:</span>
              <span className="text-emerald-400 font-bold">STRICT BLOCKING</span>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-800 pt-2">
              <span className="text-zinc-400">Action Fast-Scroll:</span>
              <span className="text-amber-400 font-bold">{settings.actionPacingMultiplier}x Speed</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Dialogue Slowdown:</span>
              <span className="text-blue-400 font-bold">{settings.dialogueSlowdownMultiplier}x Speed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Deduplication Log Table */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="font-mono text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Live Fuzzy Deduplication Decision Feed
          </h3>
          <span className="text-xs font-mono text-zinc-400">
            Buffer Capacity: 15 items
          </span>
        </div>

        <div className="overflow-x-auto max-h-72">
          {deduplicationEntries.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 font-mono text-xs">
              No OCR frames scanned yet. Start the screen reader to stream real-time logs.
            </div>
          ) : (
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="py-2 px-3">Timestamp</th>
                  <th className="py-2 px-3">Extracted OCR Text</th>
                  <th className="py-2 px-3">Similarity</th>
                  <th className="py-2 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {deduplicationEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-zinc-800/40 transition-all">
                    <td className="py-2.5 px-3 text-zinc-400 text-[11px] whitespace-nowrap">
                      {entry.timestamp}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-200 max-w-md truncate">
                      "{entry.text}"
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          entry.similarityToPrevious >= settings.fuzzyThreshold
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}
                      >
                        {entry.similarityToPrevious}% Match
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {entry.isDuplicate ? (
                        <span className="flex items-center gap-1 text-rose-400 font-bold">
                          <XCircle className="w-3.5 h-3.5" /> Discarded
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Spoken
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
