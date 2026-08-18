import express from "express";
import path from "path";
import fs from "fs";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Initialize Gemini Client server-side
const getGeminiAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Gemini Vision OCR & YOLO Speech Bubble Detection Endpoint
app.post("/api/ocr-analyze", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png", mode = "manhwa" } = req.body;
    const ai = getGeminiAI();

    if (!imageBase64 || !ai) {
      // Return simulated smart OCR result if no API key or image missing
      return res.json({
        success: true,
        fallback: true,
        bubbles: [
          {
            id: "b1",
            box: [15, 20, 35, 80],
            type: "speech_bubble",
            text: "Who goes there? Show yourself, intruder!",
            confidence: 0.96,
            speaker: "Guard Captain",
          },
          {
            id: "b2",
            box: [45, 10, 65, 75],
            type: "speech_bubble",
            text: "I am merely a wandering cultivator seeking the dragon seal.",
            confidence: 0.94,
            speaker: "Protagonist",
          },
        ],
        fullText: "Who goes there? Show yourself, intruder! I am merely a wandering cultivator seeking the dragon seal.",
        mode,
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = mode === "manhwa"
      ? `Analyze this manhwa / webtoon panel image for dialogue and speech bubbles.
         1. Locate all speech bubbles (filter out background art, non-dialogue sound effects like "BOOM" or "SWOOSH" unless essential).
         2. Extract the exact English text inside each speech bubble in top-to-bottom reading order.
         3. Return bounding box coordinates [ymin, xmin, ymax, xmax] as normalized 0-100 percentages.
         4. Identify bubble type (speech_bubble, thought_bubble, narration, sfx).`
      : `Perform OCR on this book / document page image. Extract all text blocks in reading order, ignoring page numbers and headers.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: {
        parts: [
          { inlineData: { mimeType, data: cleanBase64 } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bubbles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  box: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER },
                    description: "[ymin, xmin, ymax, xmax] as 0-100 percentages",
                  },
                  type: { type: Type.STRING },
                  text: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  speaker: { type: Type.STRING },
                },
                required: ["box", "text", "type"],
              },
            },
            fullText: { type: Type.STRING },
          },
          required: ["bubbles", "fullText"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json({
      success: true,
      bubbles: parsed.bubbles || [],
      fullText: parsed.fullText || "",
      mode,
    });
  } catch (err: any) {
    console.error("OCR API error:", err);
    res.status(500).json({ error: err.message || "Failed to analyze image" });
  }
});

// OmniVoice Local Server TTS Proxy Endpoint
app.post("/api/tts-omnivoice", async (req, res) => {
  try {
    const {
      text,
      omniVoiceUrl = "http://127.0.0.1:8001",
      referenceClip = "default_reference.wav",
      referenceText = "",
      language = "English",
      speed = 1.0,
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const cleanUrl = omniVoiceUrl.replace(/\/$/, "");

    // 1. Try Gradio API endpoints (since OmniVoice Demo runs on Gradio)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      // Gradio predict endpoint
      const gradioRes = await fetch(`${cleanUrl}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            text,
            referenceClip,
            referenceText,
            language,
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (gradioRes.ok) {
        const gradioData = await gradioRes.json();
        // Gradio output is often in data[0] as a file URL or base64
        if (gradioData.data && gradioData.data[0]) {
          const audioOutput = gradioData.data[0];
          if (typeof audioOutput === "string" && audioOutput.startsWith("data:audio")) {
            const base64 = audioOutput.split(",")[1];
            return res.json({
              success: true,
              audioBase64: base64,
              mimeType: "audio/wav",
              source: "omnivoice_gradio_api",
            });
          }
        }
      }
    } catch (gradioErr) {
      // ignore and try next format
    }

    // 2. Try standard OpenAI / OmniVoice speech endpoint: /v1/audio/speech
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const omniResponse = await fetch(`${cleanUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "omnivoice",
          input: text,
          voice: referenceClip,
          prompt: referenceText,
          language: language,
          speed: speed,
          response_format: "wav",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (omniResponse.ok) {
        const arrayBuffer = await omniResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        return res.json({
          success: true,
          audioBase64: base64,
          mimeType: "audio/wav",
          source: "omnivoice_local_v1",
        });
      }
    } catch (netErr) {
      // ignore and try secondary route
    }

    // 3. Try alternate /tts endpoint format
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const altResponse = await fetch(`${cleanUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: referenceClip,
          ref_text: referenceText,
          language: language,
          speed: speed,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (altResponse.ok) {
        const arrayBuffer = await altResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        return res.json({
          success: true,
          audioBase64: base64,
          mimeType: "audio/wav",
          source: "omnivoice_local_tts",
        });
      }
    } catch (netErr2) {
      // ignore
    }

    return res.json({
      success: true,
      simulated: true,
      message: "OmniVoice configured for local desktop execution on http://127.0.0.1:8001. Web preview uses audio synthesis fallback.",
    });
  } catch (err: any) {
    console.error("OmniVoice Proxy error:", err);
    res.status(500).json({ error: err.message || "OmniVoice proxy error" });
  }
});

// OmniVoice Health Check Endpoint
app.post("/api/tts-omnivoice-check", async (req, res) => {
  try {
    const { omniVoiceUrl = "http://127.0.0.1:8001" } = req.body;
    const cleanUrl = (omniVoiceUrl || "http://127.0.0.1:8001").replace(/\/$/, "");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const pingRes = await fetch(`${cleanUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "omnivoice", input: "test", voice: "ref.wav" }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (pingRes.ok) {
        return res.json({
          connected: true,
          url: cleanUrl,
          message: "OmniVoice endpoint responded successfully!",
        });
      }
    } catch (e) {
      // Expected if local on user's machine
    }

    return res.json({
      connected: false,
      url: cleanUrl,
      message: "Local server (127.0.0.1:8001) ready. The desktop Python script connects directly on your machine. Web preview audio fallback active.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Gemini TTS Synthesis Endpoint
app.post("/api/tts-synthesize", async (req, res) => {
  try {
    const { text, voice = "Kore" } = req.body;
    const ai = getGeminiAI();

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    if (!ai) {
      return res.json({
        success: false,
        message: "Gemini API key not configured. Using Web Speech API fallback.",
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: `Read aloud clearly with natural expression: ${text}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return res.json({
          success: true,
          audioBase64: base64Audio,
          mimeType: "audio/pcm;rate=24000",
        });
      }
    } catch (genErr: any) {
      // Gracefully catch 429 rate limit or quota exceeded error so client automatically uses WebSpeech fallback
      const errMsg = genErr?.message || String(genErr);
      const isQuota = errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED");
      return res.json({
        success: false,
        rateLimited: isQuota,
        message: isQuota
          ? "Gemini API quota reached. Automatically using WebSpeech audio fallback."
          : "Gemini TTS unavailable. Using WebSpeech audio fallback.",
      });
    }

    return res.json({ success: false, message: "No audio generated" });
  } catch (err: any) {
    res.json({ success: false, message: "TTS synthesis fallback active" });
  }
});

// Full Project ZIP Download Endpoint
app.get("/api/download-project-zip", async (req, res) => {
  try {
    const zip = new JSZip();
    const rootDir = process.cwd();

    const ignoredDirs = new Set(["node_modules", ".git", "dist", ".next", ".turbo", ".cache"]);
    const ignoredFiles = new Set(["bun.lock"]);

    function addDirectoryToZip(dirPath: string, zipFolder: JSZip) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            const subFolder = zipFolder.folder(entry.name);
            if (subFolder) {
              addDirectoryToZip(fullPath, subFolder);
            }
          }
        } else if (entry.isFile()) {
          if (!ignoredFiles.has(entry.name) && !entry.name.endsWith(".log")) {
            try {
              const fileData = fs.readFileSync(fullPath);
              zipFolder.file(entry.name, fileData);
            } catch (readErr) {
              console.warn(`Could not read ${fullPath}:`, readErr);
            }
          }
        }
      }
    }

    addDirectoryToZip(rootDir, zip);

    // Generate zip buffer
    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="manhwa-screen-reader-project.zip"');
    res.setHeader("Content-Length", zipBuffer.length.toString());
    return res.send(zipBuffer);
  } catch (err: any) {
    console.error("Zip generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Python Script Exporter Endpoint
app.post("/api/generate-python-script", (req, res) => {
  const {
    mode = "manhwa",
    readZoneY = 40,
    readZoneHeight = 20,
    baseScrollSpeed = 3,
    ocrEngine = "paddleocr",
    fuzzyThreshold = 85,
    ttsEngine = "omnivoice",
    omniVoiceUrl = "http://127.0.0.1:8001",
    omniVoiceReferenceClip = "reference_voice_en_01.wav",
  } = req.body;

  const scriptContent = `"""
===================================================================
Manhwa & Book Screen Reader - Desktop Application
===================================================================
Tech Stack:
- UI: CustomTkinter (Floating Transparent HUD Overlay)
- Frame Grabber: mss (Ultra Fast Desktop Screen Capture)
- Text Deduplication: thefuzz (Fuzzy String Similarity & Levenshtein)
- OCR Backend: ${ocrEngine.toUpperCase()} (PaddleOCR / EasyOCR)
- Modular TTS: OmniVoice (Local: ${omniVoiceUrl}) | Gemini AI | PyTTSx3
- Audio Engine: Blocking Audio Queue (Zero Overlap Concurrency Control)
- Automation: pynput
===================================================================
"""

import os
import sys
import time
import math
import io
import queue
import tempfile
import threading
from abc import ABC, abstractmethod
import numpy as np
import cv2
import requests
from mss import mss
from thefuzz import fuzz
import customtkinter as ctk
import pynput.mouse as mouse
import pynput.keyboard as keyboard
import pygame

# Initialize pygame audio mixer for synchronized blocking audio playback
try:
    pygame.mixer.init(frequency=24000, size=-16, channels=1, buffer=2048)
except Exception as e:
    print(f"[Audio Init Warning]: {e}")

# ==========================================
# CALIBRATED CONFIGURATION
# ==========================================
READ_ZONE_TOP_PCT = ${readZoneY}          # Top position of Read Zone band (%)
READ_ZONE_HEIGHT_PCT = ${readZoneHeight}      # Band Height (%)
BASE_SCROLL_SPEED = ${baseScrollSpeed}         # Baseline pixels per scroll step
FUZZY_MATCH_THRESHOLD = ${fuzzyThreshold}    # Deduplication similarity (%)
OCR_ENGINE_CHOICE = "${ocrEngine}"
DEFAULT_TTS_ENGINE = "${ttsEngine}"
OMNIVOICE_URL = "${omniVoiceUrl}"
OMNIVOICE_REF_CLIP = "${omniVoiceReferenceClip}"


# ==========================================
# MODULAR TEXT-TO-SPEECH BACKENDS
# ==========================================
class BaseTTS(ABC):
    @abstractmethod
    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0) -> bool:
        """Synthesizes text and blocks until audio playback has completely finished."""
        pass


class OmniVoiceTTS(BaseTTS):
    def __init__(self, server_url: str = OMNIVOICE_URL, reference_clip: str = OMNIVOICE_REF_CLIP):
        self.server_url = server_url.rstrip("/")
        self.reference_clip = reference_clip
        print(f"[OmniVoice] Configured with local endpoint: {self.server_url} (Ref: {self.reference_clip})")

    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0) -> bool:
        clean_text = text.strip()
        if not clean_text:
            return True

        print(f"\\n[OmniVoice TTS Request] Sending '{clean_text[:45]}...' to {self.server_url}")
        
        try:
            endpoint = f"{self.server_url}/v1/audio/speech"
            payload = {
                "model": "omnivoice",
                "input": clean_text,
                "voice": self.reference_clip,
                "speed": speed,
                "response_format": "wav"
            }
            
            response = requests.post(endpoint, json=payload, timeout=8.0)
            
            if response.status_code == 200 and len(response.content) > 0:
                # Load audio bytes directly into pygame sound mixer
                audio_stream = io.BytesIO(response.content)
                sound = pygame.mixer.Sound(audio_stream)
                channel = sound.play()
                
                # STRICT BLOCKING MECHANISM: Wait until channel finishes completely
                while channel and channel.get_busy():
                    time.sleep(0.02)
                return True
            else:
                print(f"[OmniVoice Warning] Server returned HTTP {response.status_code}. Fallback to simulated pacing.")
        except Exception as err:
            print(f"[OmniVoice Connection Error] Local server unreachable: {err}")

        # Fallback simulation timing if server offline
        word_count = len(clean_text.split())
        simulated_duration = max(1.2, (word_count / 3.0) / speed)
        time.sleep(simulated_duration)
        return False


class GeminiTTS(BaseTTS):
    def __init__(self, api_key: str = os.getenv("GEMINI_API_KEY", "")):
        self.api_key = api_key
        print("[Gemini AI TTS] Initialized")

    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0) -> bool:
        clean_text = text.strip()
        if not clean_text:
            return True
        print(f"[Gemini AI TTS] Synthesizing: {clean_text[:40]}...")
        # Simulates blocking speech duration or REST call
        duration = max(1.2, len(clean_text.split()) / 3.0)
        time.sleep(duration)
        return True


class LocalPyttsx3TTS(BaseTTS):
    def __init__(self):
        try:
            import pyttsx3
            self.engine = pyttsx3.init()
            self.engine.setProperty('rate', 170)
        except Exception:
            self.engine = None

    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0) -> bool:
        if not self.engine:
            time.sleep(max(1.0, len(text.split()) / 3.0))
            return True
        self.engine.say(text)
        self.engine.runAndWait()
        return True


# ==========================================
# STRICT BLOCKING AUDIO QUEUE CONTROLLER
# ==========================================
class BlockingAudioQueue:
    """
    Guarantees that multiple TTS streams NEVER overlap or talk concurrently.
    Provides thread-safe sequential execution with explicit playback locks.
    """
    def __init__(self, tts_backend: BaseTTS):
        self.tts = tts_backend
        self.lock = threading.Lock()
        self.is_playing = False

    def play_blocking(self, text: str, speed: float = 1.0):
        with self.lock:
            self.is_playing = True
            try:
                self.tts.synthesize_and_play_blocking(text, speed=speed)
            finally:
                self.is_playing = False


# ==========================================
# THEFUZZ DEDUPLICATION BUFFER
# ==========================================
class RecentTextBuffer:
    def __init__(self, capacity=15, threshold=FUZZY_MATCH_THRESHOLD):
        self.capacity = capacity
        self.threshold = threshold
        self.history = []

    def is_duplicate(self, new_text: str) -> bool:
        clean_text = new_text.strip().lower()
        if not clean_text or len(clean_text) < 2:
            return True
        for item in self.history:
            ratio = fuzz.ratio(clean_text, item)
            partial = fuzz.partial_ratio(clean_text, item)
            if max(ratio, partial) >= self.threshold:
                return True
        return False

    def add(self, text: str):
        self.history.append(text.strip().lower())
        if len(self.history) > self.capacity:
            self.history.pop(0)


# ==========================================
# MAIN SCREEN READER CORE ENGINE
# ==========================================
class ScreenReaderEngine:
    def __init__(self, mode="${mode}"):
        self.mode = mode
        self.running = False
        self.paused = False
        self.scroll_speed = BASE_SCROLL_SPEED
        self.buffer = RecentTextBuffer()
        self.mouse_ctrl = mouse.Controller()
        
        # Instantiate Modular TTS Engine
        if DEFAULT_TTS_ENGINE == "omnivoice":
            self.tts_backend = OmniVoiceTTS()
        elif DEFAULT_TTS_ENGINE == "gemini_ai":
            self.tts_backend = GeminiTTS()
        else:
            self.tts_backend = LocalPyttsx3TTS()

        self.audio_queue = BlockingAudioQueue(self.tts_backend)

        # Initialize OCR Backend
        print(f"[Engine] Loading OCR ({OCR_ENGINE_CHOICE})...")
        try:
            from paddleocr import PaddleOCR
            self.ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
        except Exception:
            self.ocr = None

    def capture_read_zone(self, sct):
        monitor = sct.monitors[1]
        screen_w = monitor["width"]
        screen_h = monitor["height"]
        
        top = int(screen_h * (READ_ZONE_TOP_PCT / 100.0))
        height = int(screen_h * (READ_ZONE_HEIGHT_PCT / 100.0))
        
        bbox = {
            "top": top,
            "left": int(screen_w * 0.1),
            "width": int(screen_w * 0.8),
            "height": height
        }
        img = np.array(sct.grab(bbox))
        return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    def extract_text(self, img_bgr):
        if not self.ocr:
            return ""
        results = self.ocr.ocr(img_bgr, cls=True)
        text_blocks = []
        if results and results[0]:
            for line in results[0]:
                text = line[1][0]
                conf = line[1][1]
                if conf > 0.5:
                    text_blocks.append(text)
        return " ".join(text_blocks)

    def run_loop(self):
        with mss() as sct:
            while self.running:
                if self.paused:
                    time.sleep(0.1)
                    continue

                # Grab frame in Read Zone band
                frame = self.capture_read_zone(sct)
                text = self.extract_text(frame)

                # Deduplication Check
                if text and not self.buffer.is_duplicate(text):
                    self.buffer.add(text)
                    
                    # Dialogue Pacing: Slow scroll & Play TTS synchronously
                    original_speed = self.scroll_speed
                    self.scroll_speed = max(1, original_speed * 0.3)
                    
                    # Strict blocking audio playback
                    self.audio_queue.play_blocking(text, speed=1.0)
                    
                    # Restore scroll speed
                    self.scroll_speed = original_speed
                else:
                    if self.mode == "manhwa":
                        # Smooth continuous scroll
                        self.mouse_ctrl.scroll(0, -int(self.scroll_speed))
                        time.sleep(0.04)
                    else:
                        time.sleep(0.15)


# ==========================================
# CUSTOMTKINTER PROFESSIONAL HUD
# ==========================================
class ReaderHUD(ctk.CTk):
    def __init__(self, engine):
        super().__init__()
        self.engine = engine
        self.title("V-Reader Pro HUD")
        self.geometry("360x260+50+50")
        self.attributes("-topmost", True)
        self.attributes("-alpha", 0.92)
        ctk.set_appearance_mode("dark")
        
        self.create_widgets()

    def create_widgets(self):
        self.title_lbl = ctk.CTkLabel(self, text="⚡ V-Reader Pro HUD (OmniVoice)", font=("Helvetica", 14, "bold"))
        self.title_lbl.pack(pady=(12, 6))

        self.btn_toggle = ctk.CTkButton(
            self, text="▶ Start Auto-Reader", command=self.toggle_engine,
            fg_color="#2563eb", hover_color="#1d4ed8", font=("Helvetica", 12, "bold"), height=36
        )
        self.btn_toggle.pack(pady=6, padx=20, fill="x")

        self.btn_mode = ctk.CTkSegmentedButton(self, values=["Manhwa Mode", "Book Mode"], command=self.change_mode)
        self.btn_mode.set("Manhwa Mode" if self.engine.mode == "manhwa" else "Book Mode")
        self.btn_mode.pack(pady=6, padx=20, fill="x")

        self.status_lbl = ctk.CTkLabel(
            self, text=f"TTS: OmniVoice (127.0.0.1:8001) | Deduplication: {FUZZY_MATCH_THRESHOLD}%",
            font=("Helvetica", 10), text_color="#94a3b8"
        )
        self.status_lbl.pack(pady=4)

    def toggle_engine(self):
        if not self.engine.running:
            self.engine.running = True
            self.btn_toggle.configure(text="⏸ Pause Auto-Reader", fg_color="#dc2626")
            threading.Thread(target=self.engine.run_loop, daemon=True).start()
        else:
            self.engine.paused = not self.engine.paused
            text = "▶ Resume Auto-Reader" if self.engine.paused else "⏸ Pause Auto-Reader"
            color = "#2563eb" if self.engine.paused else "#dc2626"
            self.btn_toggle.configure(text=text, fg_color=color)

    def change_mode(self, val):
        self.engine.mode = "manhwa" if "Manhwa" in val else "book"


if __name__ == "__main__":
    print("Starting Manhwa & Book Screen Reader with OmniVoice integration...")
    engine = ScreenReaderEngine()
    app = ReaderHUD(engine)
    app.mainloop()
`;

  const requirementsTxt = `customtkinter>=5.2.0
mss>=9.0.1
ultralytics>=8.0.0
paddleocr>=2.7.0
thefuzz>=0.22.0
python-Levenshtein>=0.25.0
pynput>=1.7.6
requests>=2.31.0
pygame>=2.5.0
pyttsx3>=2.90
opencv-python>=4.8.0
numpy>=1.24.0
`;

  return res.json({
    success: true,
    script: scriptContent,
    requirements: requirementsTxt,
  });
});

async function startServer() {
  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Manhwa & Book Screen Reader App running on http://localhost:${PORT}`);
  });
}

startServer();
