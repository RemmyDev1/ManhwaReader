import React, { useRef, useEffect, useState } from 'react';
import type {
  ManhwaChapter,
  ManhwaPanel,
  SpeechBubble,
  ReaderSettings,
  DeduplicationEntry,
} from '../types';
import { isTextDuplicate } from '../utils/textMatcher';
import { AudioWaveform } from './AudioWaveform';
import {
  Upload,
  Sparkles,
  Bot,
  Zap,
  Volume2,
  AlertCircle,
  Eye,
  CheckCircle2,
  RefreshCw,
  Move,
  ArrowUpDown,
  Sliders,
} from 'lucide-react';

interface ManhwaViewerProps {
  chapter: ManhwaChapter;
  settings: ReaderSettings;
  onUpdateSettings: (updater: (prev: ReaderSettings) => ReaderSettings) => void;
  onAddDeduplicationEntry: (entry: DeduplicationEntry) => void;
  onSpeakText: (text: string, onEnded?: () => void) => void;
}

export const ManhwaViewer: React.FC<ManhwaViewerProps> = ({
  chapter,
  settings,
  onUpdateSettings,
  onAddDeduplicationEntry,
  onSpeakText,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerWrapperRef = useRef<HTMLDivElement>(null);
  const [activeSpeechText, setActiveSpeechText] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [processedBubbleIds, setProcessedBubbleIds] = useState<Set<string>>(new Set());
  const [textHistoryBuffer, setTextHistoryBuffer] = useState<string[]>([]);
  const [analyzingImage, setAnalyzingImage] = useState<boolean>(false);
  const [customPanels, setCustomPanels] = useState<ManhwaPanel[] | null>(null);

  // Read Zone Interactive Drag & Resize State
  const [isDraggingZoneY, setIsDraggingZoneY] = useState(false);
  const [isResizingZoneHeight, setIsResizingZoneHeight] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [initialZoneY, setInitialZoneY] = useState(settings.readZoneY);
  const [initialZoneHeight, setInitialZoneHeight] = useState(settings.readZoneHeight);

  // Drag Handlers for Read Zone
  const handleZoneMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingZoneY(true);
    setDragStartY(e.clientY);
    setInitialZoneY(settings.readZoneY);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizingZoneHeight(true);
    setDragStartY(e.clientY);
    setInitialZoneHeight(settings.readZoneHeight);
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    if (!containerWrapperRef.current) return;
    const containerHeight = containerWrapperRef.current.clientHeight;
    if (containerHeight === 0) return;

    if (isDraggingZoneY) {
      const deltaPx = e.clientY - dragStartY;
      const deltaPct = (deltaPx / containerHeight) * 100;
      const newY = Math.max(5, Math.min(85, Math.round(initialZoneY + deltaPct)));
      onUpdateSettings((prev) => ({ ...prev, readZoneY: newY }));
    } else if (isResizingZoneHeight) {
      const deltaPx = e.clientY - dragStartY;
      const deltaPct = (deltaPx / containerHeight) * 100;
      const newHeight = Math.max(5, Math.min(60, Math.round(initialZoneHeight + deltaPct)));
      onUpdateSettings((prev) => ({ ...prev, readZoneHeight: newHeight }));
    }
  };

  const handleContainerMouseUp = () => {
    setIsDraggingZoneY(false);
    setIsResizingZoneHeight(false);
  };

  const displayPanels = customPanels || chapter.panels;

  // Auto-Scroll Loop & Read Zone Bubble Detector
  useEffect(() => {
    if (!settings.isPlaying || !scrollContainerRef.current) return;

    let animFrameId: number;
    let lastTime = performance.now();

    const scrollLoop = (time: number) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const delta = (time - lastTime) / 1000;
      lastTime = time;

      // Calculate Read Zone pixel bounds inside the container viewport
      const containerHeight = container.clientHeight;
      const readZoneTopPx = (settings.readZoneY / 100) * containerHeight;
      const readZoneBottomPx = readZoneTopPx + (settings.readZoneHeight / 100) * containerHeight;

      // 1. Check for bubbles inside the Read Zone
      const panelElements = container.querySelectorAll('[data-panel-id]') as NodeListOf<HTMLElement>;
      let bubblesInZone: { bubble: SpeechBubble; element: HTMLElement }[] = [];

      panelElements.forEach((panelEl) => {
        const bubbleEls = panelEl.querySelectorAll('[data-bubble-id]') as NodeListOf<HTMLElement>;
        bubbleEls.forEach((bubbleEl) => {
          const rect = bubbleEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          const bubbleTopRelative = rect.top - containerRect.top;
          const bubbleBottomRelative = rect.bottom - containerRect.top;

          // Check intersection with Read Zone band
          if (
            bubbleBottomRelative >= readZoneTopPx &&
            bubbleTopRelative <= readZoneBottomPx
          ) {
            const bubbleData = bubbleEl.getAttribute('data-bubble-text');
            const bubbleId = bubbleEl.getAttribute('data-bubble-id');
            if (bubbleData && bubbleId) {
              bubblesInZone.push({
                bubble: {
                  id: bubbleId,
                  text: bubbleData,
                  type: 'speech_bubble',
                  confidence: 0.95,
                  box: { ymin: 0, xmin: 0, ymax: 0, xmax: 0 },
                },
                element: bubbleEl,
              });
            }
          }
        });
      });

      // 2. Adjust dynamic pacing speed
      let dynamicSpeed = settings.baseScrollSpeed;

      if (isSpeaking) {
        // Dialogue pacing: slow down scroll while reading dialogue aloud
        dynamicSpeed = settings.baseScrollSpeed * settings.dialogueSlowdownMultiplier;
      } else if (bubblesInZone.length === 0) {
        // Action pacing: speed up scroll slightly through empty/art panels
        dynamicSpeed = settings.baseScrollSpeed * settings.actionPacingMultiplier;
      }

      // Update actual speed in settings state for HUD gauge
      onUpdateSettings((prev) =>
        prev.currentActualSpeed === dynamicSpeed
          ? prev
          : { ...prev, currentActualSpeed: dynamicSpeed }
      );

      // 3. Process new unprocessed bubbles in zone
      for (const { bubble } of bubblesInZone) {
        if (!processedBubbleIds.has(bubble.id) && !isSpeaking) {
          // Check deduplication buffer with `thefuzz` algorithm
          const deduplicationResult = isTextDuplicate(
            bubble.text,
            textHistoryBuffer,
            settings.fuzzyThreshold
          );

          const entry: DeduplicationEntry = {
            id: `dedup-${Date.now()}-${Math.random()}`,
            text: bubble.text,
            timestamp: new Date().toLocaleTimeString(),
            similarityToPrevious: deduplicationResult.highestSimilarity,
            isDuplicate: deduplicationResult.isDuplicate,
            actionTaken: deduplicationResult.isDuplicate ? 'discarded' : 'spoken',
          };

          onAddDeduplicationEntry(entry);
          setProcessedBubbleIds((prev) => new Set(prev).add(bubble.id));

          if (!deduplicationResult.isDuplicate) {
            // Update history buffer
            setTextHistoryBuffer((prev) => [...prev.slice(-15), bubble.text]);
            setActiveSpeechText(bubble.text);
            setIsSpeaking(true);

            onUpdateSettings((prev) => ({ ...prev, activeBubbleId: bubble.id }));

            // Trigger TTS Playback
            onSpeakText(bubble.text, () => {
              setIsSpeaking(false);
              setActiveSpeechText(null);
              onUpdateSettings((prev) => ({ ...prev, activeBubbleId: null }));
            });
            break;
          }
        }
      }

      // 4. Perform continuous smooth scroll shift
      container.scrollTop += dynamicSpeed;

      // Loop back to top if reached bottom
      if (
        container.scrollTop + containerHeight >= container.scrollHeight - 5 &&
        container.scrollHeight > 0
      ) {
        container.scrollTop = 0;
        setProcessedBubbleIds(new Set());
      }

      animFrameId = requestAnimationFrame(scrollLoop);
    };

    animFrameId = requestAnimationFrame(scrollLoop);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [
    settings.isPlaying,
    settings.baseScrollSpeed,
    settings.readZoneY,
    settings.readZoneHeight,
    settings.fuzzyThreshold,
    isSpeaking,
    processedBubbleIds,
    textHistoryBuffer,
  ]);

  // Handle custom image uploads for Gemini OCR bubble analysis
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setAnalyzingImage(true);

    const newPanels: ManhwaPanel[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();

      const panelData = await new Promise<ManhwaPanel>((resolve) => {
        reader.onload = async (evt) => {
          const base64 = evt.target?.result as string;

          try {
            // Call server-side Gemini OCR endpoint
            const res = await fetch('/api/ocr-analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: base64,
                mimeType: file.type || 'image/png',
                mode: 'manhwa',
              }),
            });

            const data = await res.json();

            const detectedBubbles: SpeechBubble[] = (data.bubbles || []).map(
              (b: any, idx: number) => ({
                id: `upload-b-${i}-${idx}`,
                box: {
                  ymin: b.box[0],
                  xmin: b.box[1],
                  ymax: b.box[2],
                  xmax: b.box[3],
                },
                type: b.type || 'speech_bubble',
                text: b.text || 'Detected dialogue',
                confidence: b.confidence || 0.9,
                speaker: b.speaker,
              })
            );

            resolve({
              id: `custom-p-${Date.now()}-${i}`,
              title: file.name,
              imageUrl: base64,
              bubbles: detectedBubbles.length > 0 ? detectedBubbles : [
                {
                  id: `fallback-${i}`,
                  box: { ymin: 20, xmin: 15, ymax: 35, xmax: 85 },
                  type: 'speech_bubble',
                  text: data.fullText || 'Text extracted from uploaded image panel.',
                  confidence: 0.92,
                },
              ],
            });
          } catch (err) {
            resolve({
              id: `custom-p-${Date.now()}-${i}`,
              title: file.name,
              imageUrl: base64,
              bubbles: [
                {
                  id: `err-${i}`,
                  box: { ymin: 20, xmin: 15, ymax: 35, xmax: 85 },
                  type: 'speech_bubble',
                  text: 'Uploaded panel ready for OCR scanning.',
                  confidence: 0.9,
                },
              ],
            });
          }
        };
        reader.readAsDataURL(file);
      });

      newPanels.push(panelData);
    }

    setCustomPanels(newPanels);
    setAnalyzingImage(false);
    setProcessedBubbleIds(new Set());
  };

  return (
    <div className="relative w-full h-[calc(100vh-60px)] bg-slate-950 flex flex-col overflow-hidden select-none">
      {/* Chapter Banner & Quick Controls Bar */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-cyan-400 font-mono text-sm">
            {chapter.seriesTitle}
          </span>
          <span className="text-slate-400 font-medium hidden sm:inline">
            — {chapter.title}
          </span>
          <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-mono border border-slate-700">
            {chapter.genre}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Audio Waveform Indicator */}
          <AudioWaveform isPlaying={isSpeaking} label="Dialogue Speaking" />

          {/* Reset Scroll Button */}
          <button
            onClick={() => {
              if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
              setProcessedBubbleIds(new Set());
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all flex items-center gap-1 font-mono text-[11px]"
            title="Reset Scroll to Top"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reset Scroll</span>
          </button>

          {/* Custom File Upload Input */}
          <label className="cursor-pointer bg-cyan-950 border border-cyan-700/60 hover:bg-cyan-900 text-cyan-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all shadow-sm">
            {analyzingImage ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>AI Analyzing...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                <span>Upload Manhwa File</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Main Continuous Vertical Webtoon Canvas */}
      <div
        ref={containerWrapperRef}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseLeave={handleContainerMouseUp}
        className="relative flex-1 w-full overflow-hidden flex justify-center bg-slate-950"
      >
        {/* Continuous Webtoon Scroll Container */}
        <div
          ref={scrollContainerRef}
          className="relative w-full max-w-2xl h-full overflow-y-auto scrollbar-thin scrollbar-thumb-cyan-900/50 scrollbar-track-slate-950 space-y-2 p-2 shadow-2xl"
        >
          {displayPanels.map((panel) => (
            <div
              key={panel.id}
              data-panel-id={panel.id}
              className="relative w-full rounded-2xl overflow-hidden border border-slate-800/80 bg-slate-900 shadow-xl"
            >
              <img
                src={panel.imageUrl}
                alt={panel.title}
                className="w-full h-auto object-cover block"
                loading="eager"
              />

              {/* Overlaid Detected YOLO Speech Bubbles */}
              {panel.bubbles.map((bubble) => {
                const isActive = settings.activeBubbleId === bubble.id;
                const isProcessed = processedBubbleIds.has(bubble.id);

                return (
                  <div
                    key={bubble.id}
                    data-bubble-id={bubble.id}
                    data-bubble-text={bubble.text}
                    style={{
                      top: `${bubble.box.ymin}%`,
                      left: `${bubble.box.xmin}%`,
                      width: `${bubble.box.xmax - bubble.box.xmin}%`,
                      height: `${bubble.box.ymax - bubble.box.ymin}%`,
                    }}
                    className={`absolute rounded-xl border-2 transition-all duration-200 p-2 flex flex-col justify-center items-center text-center ${
                      isActive
                        ? 'border-emerald-400 bg-emerald-950/85 text-emerald-100 shadow-2xl shadow-emerald-500/50 ring-4 ring-emerald-500/30 scale-105 z-20'
                        : isProcessed
                        ? 'border-slate-600/40 bg-slate-950/40 opacity-50'
                        : 'border-cyan-400/80 bg-cyan-950/70 text-cyan-100 hover:border-cyan-300 shadow-lg shadow-cyan-950/40'
                    }`}
                  >
                    {/* Bounding Box Label Tag */}
                    <div className="absolute -top-3 left-2 bg-slate-950 text-cyan-300 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-cyan-800/80 shadow flex items-center gap-1">
                      <Bot className="w-2.5 h-2.5 text-cyan-400" />
                      <span>YOLOv8-Bubble ({Math.round(bubble.confidence * 100)}%)</span>
                    </div>

                    {/* Speech Text */}
                    <p className="font-semibold text-xs md:text-sm leading-tight text-white drop-shadow">
                      "{bubble.text}"
                    </p>

                    {bubble.speaker && (
                      <span className="text-[10px] text-cyan-300 font-mono mt-1 font-medium">
                        — {bubble.speaker}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="h-40 flex items-center justify-center text-slate-500 font-mono text-xs">
            End of Chapter • Scrolling will loop automatically
          </div>
        </div>

        {/* Interactive Read Zone Laser Overlay & Scanner Indicator */}
        <div
          style={{
            top: `${settings.readZoneY}%`,
            height: `${settings.readZoneHeight}%`,
          }}
          className={`absolute left-0 right-0 z-30 border-y-2 border-cyan-400/90 bg-cyan-500/15 backdrop-blur-[1px] flex flex-col justify-between select-none transition-colors ${
            isDraggingZoneY || isResizingZoneHeight
              ? 'ring-2 ring-cyan-400 bg-cyan-500/25'
              : 'hover:bg-cyan-500/20'
          }`}
        >
          {/* Top Laser Beam & Drag Handle for Position Y */}
          <div
            onMouseDown={handleZoneMouseDown}
            className="w-full cursor-grab active:cursor-grabbing bg-slate-950/90 border-b border-cyan-500/40 px-4 py-1 flex items-center justify-between pointer-events-auto"
            title="Drag to reposition reading area vertically"
          >
            <div className="flex items-center gap-2">
              <Move className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-[11px] font-mono font-bold text-cyan-300">
                READ ZONE (Y: {settings.readZoneY}% | Height: {settings.readZoneHeight}%)
              </span>
              <span className="text-[9px] text-zinc-400 hidden sm:inline font-mono">
                [Drag to Move Y]
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Quick Preset Buttons */}
              <div className="hidden md:flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateSettings((prev) => ({ ...prev, readZoneY: 20 }));
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-400 hover:text-cyan-200 text-[9px] font-mono"
                >
                  Top 20%
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateSettings((prev) => ({ ...prev, readZoneY: 40 }));
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-400 hover:text-cyan-200 text-[9px] font-mono"
                >
                  Center 40%
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateSettings((prev) => ({ ...prev, readZoneY: 65 }));
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-400 hover:text-cyan-200 text-[9px] font-mono"
                >
                  Bottom 65%
                </button>
              </div>

              {/* Pacing Speed Live Badge */}
              <div className="bg-slate-900/90 border border-amber-500/60 rounded px-2 py-0.5 text-[10px] font-mono text-amber-300 flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>{settings.currentActualSpeed.toFixed(1)} px/f</span>
              </div>
            </div>
          </div>

          {/* Bottom Resize Handle for Height */}
          <div
            onMouseDown={handleResizeMouseDown}
            className="w-full h-4 cursor-ns-resize hover:bg-cyan-400/40 bg-gradient-to-r from-cyan-500/50 via-blue-400/70 to-cyan-500/50 flex items-center justify-center pointer-events-auto transition-all"
            title="Drag bottom handle to adjust reading zone height / thickness"
          >
            <div className="flex items-center gap-1 text-[9px] font-mono font-bold text-slate-950 bg-cyan-300 px-2 py-0.2 rounded-full shadow">
              <ArrowUpDown className="w-2.5 h-2.5" />
              <span>Resize Height ({settings.readZoneHeight}%)</span>
            </div>
          </div>
        </div>

        {/* Active Speech Subtitle Banner at Bottom */}
        {activeSpeechText && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-xl bg-slate-950/95 border-2 border-emerald-500/80 rounded-2xl p-4 shadow-2xl shadow-emerald-950/80 text-emerald-100 backdrop-blur-xl animate-fade-in flex items-start gap-3">
            <Volume2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold block mb-0.5">
                ACTIVE TTS READOUT
              </span>
              <p className="text-sm font-semibold text-white leading-relaxed">
                "{activeSpeechText}"
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
