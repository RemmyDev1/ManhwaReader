import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  BookChapter,
  ReaderSettings,
  DeduplicationEntry,
} from '../types';
import { isTextDuplicate } from '../utils/textMatcher';
import { AudioWaveform } from './AudioWaveform';
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  Sun,
  Moon,
  Feather,
  BookOpen,
  Volume2,
  Lock,
  Radio,
  Sparkles,
} from 'lucide-react';

interface BookViewerProps {
  chapter: BookChapter;
  settings: ReaderSettings;
  onUpdateSettings: (updater: (prev: ReaderSettings) => ReaderSettings) => void;
  onAddDeduplicationEntry: (entry: DeduplicationEntry) => void;
  onSpeakText: (text: string, onEnded?: () => void) => void;
}

export const BookViewer: React.FC<BookViewerProps> = ({
  chapter,
  settings,
  onUpdateSettings,
  onAddDeduplicationEntry,
  onSpeakText,
}) => {
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [activeParagraphIdx, setActiveParagraphIdx] = useState<number | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [customChapter, setCustomChapter] = useState<BookChapter | null>(null);
  const [readParagraphs, setReadParagraphs] = useState<Set<number>>(new Set());
  const [historyBuffer, setHistoryBuffer] = useState<string[]>([]);

  const activeChapter = customChapter || chapter;
  const currentPage = activeChapter.pages[currentPageIdx] || activeChapter.pages[0];

  // Sequence Lock & Cancellation Controls to prevent audio stream overlap
  const sequenceRunningRef = useRef(false);
  const currentJobIdRef = useRef(0);

  // Stop / cancel all active speech when paused or unmounted
  useEffect(() => {
    if (!settings.isPlaying) {
      currentJobIdRef.current++;
      sequenceRunningRef.current = false;
      setIsSpeaking(false);
      setActiveParagraphIdx(null);
    }
  }, [settings.isPlaying]);

  // Main Sequential Reader Driver
  useEffect(() => {
    if (!settings.isPlaying) return;

    const jobId = ++currentJobIdRef.current;
    sequenceRunningRef.current = true;

    const executeSequentialReading = async () => {
      // Find the first unread paragraph on current page
      let pIdx = 0;
      while (pIdx < currentPage.paragraphs.length && readParagraphs.has(pIdx)) {
        pIdx++;
      }

      while (sequenceRunningRef.current && currentJobIdRef.current === jobId) {
        if (pIdx >= currentPage.paragraphs.length) {
          // Page completed: advance to next page or loop
          if (currentPageIdx < activeChapter.pages.length - 1) {
            setCurrentPageIdx((prev) => prev + 1);
            setReadParagraphs(new Set());
            setActiveParagraphIdx(null);
          } else {
            setCurrentPageIdx(0);
            setReadParagraphs(new Set());
            setActiveParagraphIdx(null);
          }
          return;
        }

        const text = currentPage.paragraphs[pIdx];

        // Deduplication test using thefuzz Levenshtein & partial match
        const dedupResult = isTextDuplicate(text, historyBuffer, settings.fuzzyThreshold);
        const entry: DeduplicationEntry = {
          id: `book-dedup-${Date.now()}-${pIdx}`,
          text,
          timestamp: new Date().toLocaleTimeString(),
          similarityToPrevious: dedupResult.highestSimilarity,
          isDuplicate: dedupResult.isDuplicate,
          actionTaken: dedupResult.isDuplicate ? 'discarded' : 'spoken',
        };
        onAddDeduplicationEntry(entry);

        if (dedupResult.isDuplicate) {
          // Skip duplicate paragraph immediately
          pIdx++;
          continue;
        }

        // Add to recent history memory
        setHistoryBuffer((prev) => [...prev.slice(-15), text]);
        setActiveParagraphIdx(pIdx);
        setIsSpeaking(true);

        // Strict blocking await: will not proceed to next paragraph until this audio completes
        await new Promise<void>((resolve) => {
          onSpeakText(text, () => {
            resolve();
          });
        });

        if (!sequenceRunningRef.current || currentJobIdRef.current !== jobId) {
          setIsSpeaking(false);
          return;
        }

        setIsSpeaking(false);
        setReadParagraphs((prev) => new Set(prev).add(pIdx));

        // Inter-paragraph natural pacing delay
        await new Promise((res) => setTimeout(res, 500));
        pIdx++;
      }
    };

    executeSequentialReading();

    return () => {
      sequenceRunningRef.current = false;
    };
  }, [
    settings.isPlaying,
    currentPageIdx,
    currentPage,
    activeChapter,
    settings.fuzzyThreshold,
  ]);

  // Handle single paragraph manual click
  const handleParagraphClick = useCallback(
    (pIdx: number, text: string) => {
      // Invalidate current running loop
      currentJobIdRef.current++;
      sequenceRunningRef.current = false;
      setActiveParagraphIdx(pIdx);
      setIsSpeaking(true);

      onSpeakText(text, () => {
        setIsSpeaking(false);
        setReadParagraphs((prev) => new Set(prev).add(pIdx));
      });
    },
    [onSpeakText]
  );

  // Handle custom TXT / Markdown file upload
  const handleTxtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const lines = content.split(/\n\s*\n/).filter((line) => line.trim().length > 0);

      // Group into pages of 4 paragraphs each
      const pages = [];
      for (let i = 0; i < lines.length; i += 4) {
        pages.push({
          pageNumber: Math.floor(i / 4) + 1,
          chapterTitle: file.name,
          paragraphs: lines.slice(i, i + 4),
        });
      }

      setCustomChapter({
        id: `uploaded-${Date.now()}`,
        bookTitle: file.name.replace(/\.[^/.]+$/, ''),
        author: 'Uploaded Document',
        genre: 'User Ebook',
        coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80',
        pages:
          pages.length > 0
            ? pages
            : [{ pageNumber: 1, chapterTitle: file.name, paragraphs: [content] }],
      });

      setCurrentPageIdx(0);
      setReadParagraphs(new Set());
      setActiveParagraphIdx(null);
    };

    reader.readAsText(file);
  };

  // Theme Styling Map (Zinc & Professional Aesthetics)
  const themeStyles = {
    dark: 'bg-zinc-950 text-zinc-100 border-zinc-800 shadow-2xl',
    light: 'bg-amber-50 text-zinc-900 border-amber-200 shadow-xl',
    sepia: 'bg-[#fbf0d9] text-[#423223] border-[#e8d7b8] shadow-xl',
    emerald: 'bg-[#041a15] text-[#d1fae5] border-[#0a382e] shadow-2xl',
  };

  return (
    <div className="relative w-full h-[calc(100vh-60px)] bg-zinc-950 flex flex-col overflow-hidden select-none">
      {/* Book Title & Control Bar */}
      <div className="bg-zinc-900/90 border-b border-zinc-800 px-6 py-3 flex items-center justify-between text-xs backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-100 text-sm tracking-tight">
                {activeChapter.bookTitle}
              </span>
              <span className="bg-blue-950/80 text-blue-300 text-[10px] px-2 py-0.5 rounded-md font-mono border border-blue-800/60 uppercase font-semibold">
                {activeChapter.genre}
              </span>
            </div>
            <p className="text-zinc-400 text-[11px]">
              Author: {activeChapter.author}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Queue Concurrency Lock Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[10px]">
            <Lock className="w-3 h-3 text-blue-400" />
            <span className="text-zinc-400">Audio Queue:</span>
            <span className={isSpeaking ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
              {isSpeaking ? 'ACTIVE (LOCKED)' : 'IDLE'}
            </span>
          </div>

          {/* Active Audio Waveform */}
          <AudioWaveform isPlaying={isSpeaking} label="Audio Stream" />

          {/* Reader Theme Switcher */}
          <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 gap-1">
            <button
              onClick={() => onUpdateSettings((prev) => ({ ...prev, readerTheme: 'dark' }))}
              className={`p-1.5 rounded-lg transition-all ${
                settings.readerTheme === 'dark' ? 'bg-zinc-800 text-blue-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Dark Theme"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onUpdateSettings((prev) => ({ ...prev, readerTheme: 'sepia' }))}
              className={`p-1.5 rounded-lg transition-all ${
                settings.readerTheme === 'sepia' ? 'bg-amber-200 text-amber-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Sepia Theme"
            >
              <Feather className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onUpdateSettings((prev) => ({ ...prev, readerTheme: 'light' }))}
              className={`p-1.5 rounded-lg transition-all ${
                settings.readerTheme === 'light' ? 'bg-amber-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Light Theme"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Upload Local TXT / Book File */}
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-bold text-xs transition-all shadow-md shadow-blue-900/30">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Ebook</span>
            <input type="file" accept=".txt,.md" onChange={handleTxtUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* Book Viewport Container */}
      <div className="flex-1 w-full overflow-y-auto p-4 md:p-8 flex justify-center items-center">
        <div
          className={`w-full max-w-3xl rounded-2xl p-8 md:p-12 border transition-all duration-300 ${
            themeStyles[settings.readerTheme]
          }`}
          style={{ fontSize: `${settings.fontSize}px`, lineHeight: 1.85 }}
        >
          {/* Chapter Header */}
          <div className="mb-8 pb-4 border-b border-current opacity-25 flex items-center justify-between font-serif">
            <h2 className="font-bold text-lg tracking-wide">{currentPage.chapterTitle}</h2>
            <span className="text-xs font-mono opacity-80">
              Page {currentPage.pageNumber} of {activeChapter.pages.length}
            </span>
          </div>

          {/* Page Paragraphs */}
          <div className="space-y-6 font-serif">
            {currentPage.paragraphs.map((p, pIdx) => {
              const isActive = activeParagraphIdx === pIdx;
              const isRead = readParagraphs.has(pIdx);

              return (
                <p
                  key={pIdx}
                  onClick={() => handleParagraphClick(pIdx, p)}
                  className={`p-4 rounded-xl transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600/15 ring-2 ring-blue-500/70 shadow-lg text-blue-100 font-medium'
                      : isRead
                      ? 'opacity-55'
                      : 'hover:bg-zinc-800/30'
                  }`}
                >
                  {p}
                </p>
              );
            })}
          </div>

          {/* Page Navigation Controls */}
          <div className="mt-12 pt-6 border-t border-current opacity-30 flex items-center justify-between font-mono text-xs">
            <button
              disabled={currentPageIdx === 0}
              onClick={() => {
                setCurrentPageIdx((prev) => Math.max(0, prev - 1));
                setReadParagraphs(new Set());
                setActiveParagraphIdx(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-current disabled:opacity-20 hover:bg-zinc-800/40 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Previous Page
            </button>

            <span className="font-semibold text-xs tracking-wider">
              PAGE {currentPageIdx + 1} / {activeChapter.pages.length}
            </span>

            <button
              disabled={currentPageIdx === activeChapter.pages.length - 1}
              onClick={() => {
                setCurrentPageIdx((prev) => Math.min(activeChapter.pages.length - 1, prev + 1));
                setReadParagraphs(new Set());
                setActiveParagraphIdx(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-current disabled:opacity-20 hover:bg-zinc-800/40 transition-all"
            >
              Next Page <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
