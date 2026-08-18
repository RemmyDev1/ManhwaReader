import React, { useState } from 'react';
import JSZip from 'jszip';
import {
  BookOpen,
  Sliders,
  Code,
  Sparkles,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Layers,
  Radio,
  Lock,
  Download,
  Loader2,
} from 'lucide-react';
import type { ReaderSettings } from '../types';
import { getPythonScript, requirementsTxt, readmeMd, runBat } from '../pythonAppTemplate';

interface NavbarProps {
  settings: ReaderSettings;
  onUpdateSettings: (updater: (prev: ReaderSettings) => ReaderSettings) => void;
  activeView: 'reader' | 'inspector' | 'code_export';
  setActiveView: (view: 'reader' | 'inspector' | 'code_export') => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  settings,
  onUpdateSettings,
  activeView,
  setActiveView,
  onToggleFullscreen,
  isFullscreen,
}) => {
  const [isZipping, setIsZipping] = useState(false);

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const res = await fetch('/api/download-project-zip');
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 1000) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'manhwa-screen-reader-project.zip';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setIsZipping(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Server zip download failed, generating client-side bundle...', e);
    }

    try {
      const zip = new JSZip();
      zip.file('main.py', getPythonScript(settings));
      zip.file('requirements.txt', requirementsTxt);
      zip.file('run.bat', runBat);
      zip.file('README.md', readmeMd);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'manhwa-screen-reader-project.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Client zip generation error:', err);
    } finally {
      setIsZipping(false);
    }
  };
  return (
    <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800 text-zinc-100 px-5 py-2.5 flex items-center justify-between shadow-xl">
      {/* App Logo & Branding */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold shadow-sm">
          <BookOpen className="w-4 h-4 text-blue-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-sm tracking-tight text-zinc-100">
              V-Reader Screen Reader
            </h1>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-blue-950/80 border border-blue-800/60 text-blue-300 font-semibold">
              OmniVoice v2.5
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 hidden sm:block">
            Synchronized Audio Queue • YOLO Manga-Bubble Detection • thefuzz Deduplication
          </p>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-medium">
        <button
          onClick={() => setActiveView('reader')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
            activeView === 'reader'
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Reader Suite</span>
        </button>

        <button
          onClick={() => setActiveView('inspector')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
            activeView === 'inspector'
              ? 'bg-blue-600 text-white font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Read Zone &amp; Dedup</span>
        </button>

        <button
          onClick={() => setActiveView('code_export')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
            activeView === 'code_export'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-950/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>App Exporter</span>
        </button>

        <button
          onClick={handleDownloadZip}
          disabled={isZipping}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md shadow-emerald-950/50 ring-1 ring-emerald-400/40 cursor-pointer"
          title="Download complete project folder including desktop app, configs & scripts as a ZIP"
        >
          {isZipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span>{isZipping ? 'Zipping...' : '📦 Download ZIP'}</span>
        </button>
      </div>

      {/* Global Quick Actions */}
      <div className="flex items-center gap-2">
        {/* Play / Pause Toggle */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
          }
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-all shadow-md ${
            settings.isPlaying
              ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/50'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/50'
          }`}
        >
          {settings.isPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span className="hidden md:inline">Pause</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden md:inline">Start Reader</span>
            </>
          )}
        </button>

        {/* Floating HUD Toggle Button */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({ ...prev, hudVisible: !prev.hudVisible }))
          }
          className={`p-2 rounded-xl border text-xs transition-all ${
            settings.hudVisible
              ? 'bg-blue-950/80 border-blue-500/50 text-blue-300 shadow-sm'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Toggle Floating HUD Overlay"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={onToggleFullscreen}
          className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
