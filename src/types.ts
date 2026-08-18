export type ReadingMode = 'manhwa' | 'book';

export type TTSEngineType = 'omnivoice' | 'gemini_ai' | 'webspeech' | 'pyttsx3';

export interface BoundingBox {
  ymin: number; // 0-100 percentage
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface SpeechBubble {
  id: string;
  box: BoundingBox;
  type: 'speech_bubble' | 'thought_bubble' | 'narration' | 'sfx';
  text: string;
  confidence: number;
  speaker?: string;
  read?: boolean;
}

export interface ManhwaPanel {
  id: string;
  imageUrl: string;
  title: string;
  bubbles: SpeechBubble[];
  isActionSequence?: boolean;
}

export interface ManhwaChapter {
  id: string;
  title: string;
  seriesTitle: string;
  coverImage: string;
  genre: string;
  panels: ManhwaPanel[];
}

export interface BookPage {
  pageNumber: number;
  chapterTitle: string;
  paragraphs: string[];
}

export interface BookChapter {
  id: string;
  bookTitle: string;
  author: string;
  genre: string;
  coverImage: string;
  pages: BookPage[];
}

export interface DeduplicationEntry {
  id: string;
  text: string;
  timestamp: string;
  similarityToPrevious: number;
  isDuplicate: boolean;
  actionTaken: 'spoken' | 'discarded';
}

export interface ReaderSettings {
  mode: ReadingMode;
  isPlaying: boolean;
  baseScrollSpeed: number; // 1 to 10
  currentActualSpeed: number; // dynamically adjusted
  readZoneY: number; // 0 to 100 percentage from top
  readZoneHeight: number; // 5 to 40 percentage height
  fuzzyThreshold: number; // 50 to 95 percentage match
  ttsEngine: TTSEngineType;
  voiceName: string;
  ttsRate: number; // 0.5 to 2.0
  ttsVolume: number; // 0 to 1
  omniVoiceUrl: string; // default http://127.0.0.1:8001
  omniVoiceReferenceClip: string; // e.g. C:/voices/reference.wav or sample.wav
  omniVoiceReferenceText: string; // Transcript of the reference audio clip
  omniVoiceLanguage: string; // e.g. 'English', 'Auto', 'Korean', 'Japanese', 'Chinese'
  actionPacingMultiplier: number; // 1.2 to 2.5 x
  dialogueSlowdownMultiplier: number; // 0.2 to 0.6 x
  hudDocked: boolean;
  hudVisible: boolean;
  activeBubbleId: string | null;
  activeParagraphIndex: number | null;
  readerTheme: 'dark' | 'light' | 'sepia' | 'emerald';
  fontSize: number; // 14 to 28
}
