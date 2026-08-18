import React, { useState } from 'react';
import JSZip from 'jszip';
import type { ReaderSettings } from '../types';
import {
  Code,
  Copy,
  Check,
  Download,
  Terminal,
  FileCode,
  Package,
  BookOpen,
  Radio,
  Sparkles,
  Lock,
  Play,
  Loader2,
} from 'lucide-react';
import { audioQueue } from '../services/audioQueue';
import { getPythonScript, requirementsTxt, readmeMd, runBat } from '../pythonAppTemplate';

interface PythonScriptExporterProps {
  settings: ReaderSettings;
}

export const PythonScriptExporter: React.FC<PythonScriptExporterProps> = ({ settings }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedReqs, setCopiedReqs] = useState(false);
  const [activeTab, setActiveTab] = useState<'script' | 'reqs' | 'readme' | 'tester'>('script');
  const [testText, setTestText] = useState("Greetings. This is a synchronized test of the local OmniVoice text-to-speech engine running sequentially without overlapping.");
  const [isTesting, setIsTesting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const pythonScript = getPythonScript(settings);

  const handleCopy = (text: string, type: 'code' | 'reqs') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedReqs(true);
      setTimeout(() => setCopiedReqs(false), 2000);
    }
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      // 1. Try server-side complete zip
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

    // 2. Client-side JSZip generation fallback
    try {
      const zip = new JSZip();
      zip.file('main.py', pythonScript);
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

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunAudioTest = async () => {
    setIsTesting(true);
    await audioQueue.playText(
      testText,
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
      () => {
        setIsTesting(false);
      }
    );
  };

  return (
    <div className="w-full h-[calc(100vh-60px)] bg-zinc-950 text-zinc-100 p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
              Python Application Exporter
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Export the complete Python CustomTkinter desktop screen reader with settings GUI, PaddleOCR vision, modular OmniVoice voice cloning, and controlled auto-scrolling.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-400/30 cursor-pointer"
          >
            {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isZipping ? 'Generating ZIP...' : '📦 Download Full Project (.ZIP)'}</span>
          </button>
          <button
            onClick={() => handleDownload('main.py', pythonScript)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-900/40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>main.py</span>
          </button>
          <button
            onClick={() => handleDownload('requirements.txt', requirementsTxt)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-mono transition-all"
          >
            <Package className="w-3.5 h-3.5 text-blue-400" />
            <span>requirements.txt</span>
          </button>
        </div>
      </div>

      {/* OmniVoice Voice Cloning Quick Guide Banner */}
      <div className="bg-blue-950/40 border border-blue-800/60 rounded-2xl p-4 space-y-3 font-sans">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-300 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span>OmniVoice (Voice Clone) Configuration in your Script:</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
            Auto-Configured for Gradio (Port 8001)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
          <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">1. Reference Audio File:</span>
            <div className="text-blue-300 font-semibold break-all text-[11px]">
              {settings.omniVoiceReferenceClip || 'reference_voice_en_01.wav'}
            </div>
            <p className="text-[9px] text-zinc-500">Put this .wav audio file in your script folder or provide its full path.</p>
          </div>

          <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">2. Reference Transcript:</span>
            <div className="text-blue-300 font-semibold text-[11px] line-clamp-2" title={settings.omniVoiceReferenceText}>
              "{settings.omniVoiceReferenceText || 's. up to the imperial throne...'}"
            </div>
            <p className="text-[9px] text-zinc-500">Exact words spoken in your audio clip (boosts clone accuracy).</p>
          </div>

          <div className="bg-zinc-900/80 p-3 rounded-xl border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">3. Target Language:</span>
            <div className="text-blue-300 font-semibold text-[11px]">
              {settings.omniVoiceLanguage || 'English'}
            </div>
            <p className="text-[9px] text-zinc-500">Matches the language of your manhwa speech bubbles.</p>
          </div>
        </div>
      </div>

      {/* Code Viewer File Selector Tabs */}
      <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800 w-fit text-xs font-mono">
        <button
          onClick={() => setActiveTab('script')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
            activeTab === 'script' ? 'bg-blue-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" /> main.py (Settings GUI + OCR + OmniVoice)
        </button>
        <button
          onClick={() => setActiveTab('reqs')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
            activeTab === 'reqs' ? 'bg-blue-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> requirements.txt
        </button>
        <button
          onClick={() => setActiveTab('readme')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
            activeTab === 'readme' ? 'bg-blue-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" /> README.md
        </button>
        <button
          onClick={() => setActiveTab('tester')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
            activeTab === 'tester' ? 'bg-blue-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5" /> OmniVoice Audio Test
        </button>
      </div>

      {/* Syntax Highlighted Code Box or Tester Tab */}
      {activeTab === 'tester' ? (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 space-y-4 font-sans">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-400" />
              <h3 className="font-bold text-sm text-zinc-100">Live TTS &amp; Audio Queue Simulator</h3>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span>Engine: <strong className="text-blue-300">{settings.ttsEngine.toUpperCase()}</strong></span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Text Input to Synthesize:</label>
            <textarea
              rows={3}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-[11px] text-zinc-500 font-mono">
              Target: {settings.omniVoiceUrl || 'http://127.0.0.1:8001'} (Ref Clip: {settings.omniVoiceReferenceClip || 'reference_voice_en_01.wav'})
            </div>

            <button
              onClick={handleRunAudioTest}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-blue-950/60"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isTesting ? 'Playing Synchronously (Locked)...' : 'Test Synthesize & Play'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="relative bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 overflow-hidden shadow-2xl font-mono text-xs text-zinc-200">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800 text-[11px] text-zinc-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-400" />
              <span>
                {activeTab === 'script'
                  ? 'main.py (Settings GUI + Vision Preprocessing + OmniVoice + Controlled Scroll)'
                  : activeTab === 'reqs'
                  ? 'requirements.txt'
                  : 'README.md'}
              </span>
            </div>

            <button
              onClick={() =>
                handleCopy(
                  activeTab === 'script' ? pythonScript : activeTab === 'reqs' ? requirementsTxt : readmeMd,
                  'code'
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-all text-[11px]"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-blue-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
            </button>
          </div>

          <pre className="overflow-x-auto max-h-[500px] scrollbar-thin scrollbar-thumb-zinc-800 p-2 leading-relaxed text-zinc-300">
            {activeTab === 'script' ? pythonScript : activeTab === 'reqs' ? requirementsTxt : readmeMd}
          </pre>
        </div>
      )}
    </div>
  );
};
