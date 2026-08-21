"""
===================================================================
V-Reader Pro: Manhwa, Manga & Webtoon AI Screen Reader (v2.5)
===================================================================
Tech Stack:
- UI: CustomTkinter 60FPS Tabbed Configuration & Calibration Frame
- Vision: RapidOCR (ONNX Runtime, 0-PaddlePaddle) + WinOCR (Windows 10/11) + Multi-pass CLAHE
- Stabilizer: Dialogue Settle Window & Sentence Boundary Accumulator (Prevents early fragmentation)
- Normalizer: Manhwa Dialogue Casing & Punctuation Sanitizer (Fixes monotone shouting / spelling out)
- TTS Backends:
    1. OmniVoice Voice Cloning (Gradio /_clone_fn with precise duration estimation)
    2. Edge-TTS (Microsoft Neural Studio HD: Christopher, Guy, Eric, Jenny)
    3. Local Windows PyTTSx3 (SAPI5 Fallback)
- Audio Engine: Windows Native Winsound / Pygame Mixer / Subprocess Player
- Scroll Engine: Windows Multimedia 1ms Precision (timeBeginPeriod) + 60FPS Micro-Wheel Glide
===================================================================
"""

import os
from dotenv import load_dotenv
load_dotenv()
import importlib
import sys
import time
import json
import math
import platform
import io
import re
import queue
import tempfile
import threading
import traceback
import base64
import ctypes
import asyncio
from difflib import SequenceMatcher
from abc import ABC, abstractmethod
import numpy as np
import cv2
import requests
import mss
from thefuzz import fuzz
import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox
import pynput.mouse as mouse
import pynput.keyboard as keyboard
from PIL import Image

# ==========================================
# WINDOWS HIGH-PRECISION 1MS MULTIMEDIA TIMER
# ==========================================
# Windows default sleep resolution is ~15.6ms which causes stutter in 60Hz/144Hz scroll loops.
# timeBeginPeriod(1) forces the OS timer scheduler to 1.0ms resolution.
if sys.platform.startswith("win"):
    try:
        ctypes.windll.winmm.timeBeginPeriod(1)
    except Exception:
        pass

CONFIG_FILE = "config.json"

DEFAULT_CONFIG = {
    "read_zone_top": 20,
    "read_zone_height": 55,
    "read_zone_left": 10,
    "read_zone_width": 80,
    "monitor_index": 1,
    "scroll_mode": "glide",          # "glide" (continuous smooth) or "paced" (stepped)
    "glide_speed": 3.0,              # Smooth glide speed (1.0 to 10.0)
    "scroll_interval_sec": 1.2,      # For paced step mode
    "scroll_step_amount": 1,         # For paced step mode
    "pause_scroll_on_text": True,
    "fuzzy_threshold": 70,
    "ocr_confidence": 0.20,
    "ocr_interval_sec": 0.12,
    "ocr_variant_limit": 4,
    "ocr_engine_preference": "auto", # "auto", "rapidocr", "winocr", "paddleocr"
    "enable_image_preprocessing": True,
    "enable_ocr_repair": True,       # Auto-repairs comic font OCR errors ("reqeests" -> "requests", etc.)
    "sanitize_tts_punctuation": True,# Strips stutter-inducing dashes and symbols before synthesis
    
    # Dialogue & Sentence Stabilization Settings
    "bubble_settle_sec": 0.90,       # Debounce delay: wait for full speech bubble to scroll into frame
    "min_dialogue_words": 2,         # Ignore solitary 1-word garbage fragments like "DLACN."
    "normalize_casing": True,        # Convert screaming ALL-CAPS into natural spoken sentence casing
    
    # TTS Backend Settings
    "tts_backend": "omnivoice",      # "omnivoice", "cosyvoice", "edgetts", "pyttsx3"
    "omnivoice_url": "http://127.0.0.1:8001",
    "omnivoice_ref_clip": "audio.wav",
    "omnivoice_ref_text": "",
    "omnivoice_language": "English",
    "omnivoice_duration_scale": 1.0, # 1.0x tight duration prevents looping, rereading, or trailing stutter
    "cosyvoice_url": "http://127.0.0.1:50000",
    "cosyvoice_mode": "zero_shot",
    "enable_omnivoice_prefetch": True,
    "max_tts_queue": 2,
    "allow_pyttsx3_fallback": False, # Prevent silent robotic fallback
    "edge_tts_voice": "en-US-ChristopherNeural", # Studio natural voice
    "speech_speed": 1.0,
    "dialogue_pause_sec": 0.4,
    "mode": "manhwa"
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                merged = DEFAULT_CONFIG.copy()
                merged.update(cfg)
                return merged
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()

def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        print(f"[Config Save Error]: {e}")

# ==========================================
# WINDOWS LOW-LEVEL MOUSE WHEEL
# ==========================================
MOUSEEVENTF_WHEEL = 0x0800

def send_native_mouse_wheel(delta_int):
    """Sends raw Windows mouse wheel event for sub-notch smooth scrolling."""
    if sys.platform.startswith("win"):
        try:
            ctypes.windll.user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, int(delta_int), 0)
            return True
        except Exception:
            pass
    return False

# ==========================================
# OCR SPELL REPAIR & LEXICON SANITIZER
# ==========================================
COMMON_ENGLISH_WORDS = {
    "a", "i", "in", "to", "of", "it", "is", "he", "she", "we", "me", "my", "us", "on", "at", "by", "as",
    "do", "go", "no", "so", "up", "if", "or", "an", "be", "am", "the", "and", "for", "are", "but", "not",
    "you", "all", "any", "can", "had", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
    "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put", "say",
    "she", "too", "use", "dad", "mom", "sir", "gate", "rank", "boss", "lord", "king", "done", "soon", "after",
    "that", "with", "have", "this", "will", "your", "from", "they", "know", "want", "been", "good", "much",
    "some", "time", "very", "when", "come", "here", "just", "like", "long", "make", "many", "more", "only",
    "over", "such", "take", "than", "them", "then", "were", "what", "also", "back", "even", "give", "most",
    "well", "into", "year", "your", "said", "each", "tell", "does", "want", "help", "went", "down", "look",
    "magic", "mana", "skill", "spell", "level", "power", "sword", "blade", "guild", "quest", "order", "beast",
    "about", "after", "again", "below", "could", "every", "first", "found", "great", "house", "large", "never",
    "other", "place", "right", "small", "sound", "still", "their", "there", "these", "thing", "think", "three",
    "water", "where", "which", "world", "would", "write", "order", "ordered", "empire", "entire", "opened", "opening",
    "before", "better", "called", "change", "father", "friend", "little", "mother", "people", "should", "system",
    "hunter", "dungeon", "monster", "monsters", "dragon", "status", "window", "damage", "attack", "shield", "potion",
    "because", "another", "between", "country", "different", "picture", "thought", "through", "together", "without",
    "mentioned", "unknown", "difficulty", "unidentifiable", "emperor", "empress", "princess", "prince",
    "energy", "wealthy", "magnate", "villain", "villains", "fate", "sharp", "eyesight", "telling", "notebook", "special",
    "minister", "ministers", "opposition", "immense", "issues", "demons", "surely", "praise", "petty", "compiled",
    "reinforce", "reliable", "workers", "lacking", "areas", "noticed", "feeling", "sense", "senses", "snow", "ugh",
    "nor", "sight", "eyes", "eye", "special", "note", "book"
}

LONG_VALID_WORDS = {
    "information", "understanding", "difficulty", "different", "mentioned", "opening", "entire", "empire",
    "ordered", "something", "everything", "everyone", "someone", "without", "within", "into", "unidentifiable",
    "unknown", "dungeon", "monster", "monsters", "system", "hunter", "awakened", "ability", "destroy", "immediately",
    "opposition", "immense", "notebook", "eyesight", "magnate", "villains", "villain", "wealthy", "reinforce"
}

# Targets for conservative OCR correction. Unknown words are never changed to
# arbitrary names; they must closely match one of these known words.
MANHWA_CORRECTION_WORDS = COMMON_ENGLISH_WORDS | LONG_VALID_WORDS | {
    "ability", "awakened", "awakening", "barrier", "captain", "character",
    "clan", "combat", "cultivator", "curse", "defeat", "defense", "defend", "home",
    "destroy", "destruction", "divine", "familiar", "fortress", "healing",
    "heaven", "infinite", "invincible", "kingdom", "master", "medieval",
    "mercenary", "mission", "noble", "palace", "portal", "possessed",
    "regression", "return", "revenge", "ruler", "sacred", "secret",
    "soldier", "strongest", "summon", "summoned", "tower", "training",
    "treasure", "ultimate", "universe", "warrior", "weapon", "wizard",
    "adventure", "ancient", "appearance", "command", "danger", "despair",
    "discovery", "escape", "eternal", "fighting", "future", "healing",
    "hidden", "identity", "legend", "legendary", "memory", "opponent",
    "promise", "recognize", "resurrection", "ruins", "servant", "shadow",
    "strength", "survive", "threat", "victory", "weakness", "chapter",
    "academy", "archer", "assassin", "blacksmith", "demon", "dimension",
    "equipment", "experience", "goddess", "heir", "immortal", "ingredient",
    "merchant", "mission", "overlord", "phenomenon", "ranker", "relic",
    "saint", "summoner", "suppress", "transcend", "transformation",
}

MANHWA_CORRECTION_INDEX = tuple(sorted(MANHWA_CORRECTION_WORDS))
MANHWA_SAFE_CORRECTION_WORDS = COMMON_ENGLISH_WORDS | {"home"}

def correct_manhwa_ocr_word(word: str) -> str:
    """Correct only a high-confidence near-match to a known English term."""
    if not word or len(word) < 4:
        return word

    core_match = re.fullmatch(r"([A-Za-z]+)([^A-Za-z]*)", word)
    if not core_match:
        return word
    core, suffix = core_match.groups()
    lower_core = core.lower()
    if lower_core in MANHWA_CORRECTION_WORDS:
        return word

    candidates = []
    for target in MANHWA_CORRECTION_INDEX:
        if target not in MANHWA_SAFE_CORRECTION_WORDS:
            continue
        if abs(len(target) - len(lower_core)) > 1:
            continue
        if target[0] != lower_core[0]:
            continue
        ratio = SequenceMatcher(None, lower_core, target).ratio()
        if ratio >= 0.86:
            candidates.append((ratio, target))

    if not candidates:
        return word
    candidates.sort(reverse=True)
    best_ratio, best_target = candidates[0]
    second_ratio = candidates[1][0] if len(candidates) > 1 else 0.0
    # A single inserted/deleted character is acceptable, but only with a clear
    # winner. This prevents ordinary names and invented terms being rewritten.
    if best_ratio < 0.88 or (best_ratio < 0.94 and best_ratio - second_ratio < 0.04):
        return word
    if not any(
        lower_core[:index] + lower_core[index + 1:] == best_target
        for index in range(len(lower_core))
    ):
        return word

    if core.isupper():
        corrected = best_target.upper()
    elif core[:1].isupper():
        corrected = best_target.capitalize()
    else:
        corrected = best_target
    return corrected + suffix

def correct_manhwa_ocr_text(text: str) -> str:
    return " ".join(correct_manhwa_ocr_word(token) for token in text.split())

def ocr_agreement_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()

def repair_manhwa_ocr_text(text: str) -> str:
    """
    Auto-corrects common OCR phonetic & character manglings in comic/manhwa typography:
    - 'maric' / 'marjc' -> 'magic'
    - 'ordereditdonefor' -> 'ordered it done for'
    - 'theenfrgyraoe' -> 'the energy of'
    - 'norisittheenergy' -> 'nor is it the energy'
    - 'lwealthymagnatet' -> 'wealthy magnate'
    - 'oflvillain'sfatei' -> 'of villain's fate'
    - 'lsharpeyesighti' -> 'sharp eyesight'
    - 'istellingme' -> 'is telling me'
    - 'notebookis' -> 'notebook is'
    - 'petiy' -> 'petty'
    - 'dthe' -> 'the'
    - 'reqeests' / 'reqests' -> 'requests'
    - 'dened' / 'denled' -> 'denied'
    - 'du to' / 'clue to' -> 'due to'
    - 'diffcultt' / 'diffculty' -> 'difficulty'
    - 'difh' -> 'gate'
    - 'was un' at sentence end -> 'was unknown.'
    - Manhwa contractions & broken letter combos ('rn' -> 'm', 'vv' -> 'w')
    """
    if not text:
        return ""
    t = text
    substitutions = [
        # Dark burst & Manhwa Fantasy term corrections
        (r'\btheenfrgyraoe\b', 'the energy of'),
        (r'\btheenfrgy\b', 'the energy'),
        (r'\btheenergyof\b', 'the energy of'),
        (r'\btheenergy\b', 'the energy'),
        (r'\bnorisittheenergy\b', 'nor is it the energy'),
        (r'\bnorisit\b', 'nor is it'),
        (r'\bofl?villain\'?s?fate[it]?\b', "of villain's fate"),
        (r'\boflvillain\b', 'of villain'),
        (r'\blwealthymagnatet?\b', 'wealthy magnate'),
        (r'\blwealthy\b', 'wealthy'),
        (r'\bmagnatet\b', 'magnate'),
        (r'\blsharpeyesight[it]?\b', 'sharp eyesight'),
        (r'\bsharpeyesight\b', 'sharp eyesight'),
        (r'\bistellingme\b', 'is telling me'),
        (r'\bnotebookis\b', 'notebook is'),
        (r'\bwhatis\b', 'what is'),
        (r'\bthisnotebook\b', 'this notebook'),
        (r'\bpetiy\b', 'petty'),
        (r'\bsnowea\b', 'issues with'),
        (r'\bhiim s3nssi\b', 'demons'),
        (r'\bzc read by ocr\b', ''),
        (r'\bmanhwa read\b', ''),
        (r'\bzc read\b', ''),
        # Magic & Manhwa terminology distortions (e.g. 'G' with serif read as 'R' in glowing fonts)
        (r'\bmaric\b', 'magic'),
        (r'\bmarjc\b', 'magic'),
        (r'\bmaqic\b', 'magic'),
        (r'\brnaric\b', 'magic'),
        (r'\brnagic\b', 'magic'),
        (r'\bmagie\b', 'magic'),
        (r'\bmagjc\b', 'magic'),
        (r'\bopcning\b', 'opening'),
        (r'\bopcn\b', 'open'),
        (r'\brnentioned\b', 'mentioned'),
        (r'\brnention\b', 'mention'),
        (r'\bcmprc\b', 'empire'),
        (r'\bernprc\b', 'empire'),
        (r'\bcrnpirc\b', 'empire'),
        (r'\bernpite\b', 'empire'),
        (r'\bcmptrc\b', 'empire'),
        (r'\bcmpiro\b', 'empire'),
        (r'\bentirc\b', 'entire'),
        (r'\bentirely\b', 'entirely'),
        (r'\bordcrcd\b', 'ordered'),
        (r'\bordcred\b', 'ordered'),
        (r'\bordoned\b', 'ordered'),
        (r'\bsophicn\b', 'sophien'),
        # Run-together common phrases
        (r'\bordereditdonefor\b', 'ordered it done for'),
        (r'\bordereditdone\b', 'ordered it done'),
        (r'\borderedit\b', 'ordered it'),
        (r'\bdonefor\b', 'done for'),
        (r'\bhadsoon\b', 'had soon'),
        (r'\bsoonafter\b', 'soon after'),
        (r'\bopeningup\b', 'opening up'),
        (r'\bentireempire\b', 'entire empire'),
        (r'\btome\b', 'to me'),
        (r'\bforthe\b', 'for the'),
        (r'\bwhoknew\b', 'who knew'),
        (r'\bwhowas\b', 'who was'),
        (r'\bwhohad\b', 'who had'),
        # Comic font 'vv' -> 'w'
        (r'\bvvhat\b', 'what'),
        (r'\bvvhere\b', 'where'),
        (r'\bvvho\b', 'who'),
        (r'\bvvhy\b', 'why'),
        (r'\bvvould\b', 'would'),
        (r'\bvve\b', 'we'),
        (r'\bvvill\b', 'will'),
        (r'\bvvith\b', 'with'),
        (r'\bvvell\b', 'well'),
        (r'\bvvas\b', 'was'),
        # Comic font 'rn' -> 'm'
        (r'\bfrorn\b', 'from'),
        (r'\brnaybe\b', 'maybe'),
        (r'\brnan\b', 'man'),
        (r'\bcornplete\b', 'complete'),
        (r'\bdornain\b', 'domain'),
        # Leading 'd' glitches
        (r'\bdthe\b', 'the'),
        (r'\bdthat\b', 'that'),
        (r'\bdthis\b', 'this'),
        (r'\bdthen\b', 'then'),
        (r'\bdthere\b', 'there'),
        # Gate & Difficulty mangling
        (r'\breqeests?\b', 'requests'),
        (r'\breqests?\b', 'requests'),
        (r'\brequesls?\b', 'requests'),
        (r'\bdened\b', 'denied'),
        (r'\bdenled\b', 'denied'),
        (r'\bcleniecl\b', 'denied'),
        (r'\bdu to\b', 'due to'),
        (r'\bclue to\b', 'due to'),
        (r'\bdue tot\b', 'due to the'),
        (r'\bdiffcultt?\b', 'difficulty'),
        (r'\bdiffculty\b', 'difficulty'),
        (r'\bdifficultt\b', 'difficulty'),
        (r'\bdifficulty of the difh\b', 'difficulty of the gate'),
        (r'\bdifh\b', 'gate'),
        (r'\bgatc\b', 'gate'),
        (r'\bgafe\b', 'gate'),
        (r'\bwas un\b', 'was unknown.'),
        (r'\bthe fact the\b', 'the fact that the'),
        (r'\bunidentif[a-z]+\b', 'unidentifiable'),
        (r'\bmonstcr\b', 'monster'),
        (r'\bmonsler\b', 'monster'),
        (r'\bhuntcr\b', 'hunter'),
        (r'\bhunler\b', 'hunter'),
        (r'\bdungean\b', 'dungeon'),
        (r'\bduncen\b', 'dungeon'),
        (r'\bsystern\b', 'system'),
        (r'\blevcl\b', 'level'),
        (r'\bpowcr\b', 'power'),
    ]
    for pattern, repl in substitutions:
        t = re.sub(pattern, repl, t, flags=re.IGNORECASE)

    return t

def clean_tts_phonetics_and_dashes(text: str) -> str:
    """
    Specifically prepares comic text for Neural & Diffusion TTS engines (OmniVoice, Edge-TTS):
    1. Removes split-line word breaks ('re- quests' -> 'requests', 'diffi- culty' -> 'difficulty').
    2. Converts dialogue dashes ('—', '–', '--', ' - ') to natural soft pause commas, NOT vocalized dashes.
    3. Repairs missing apostrophes in English contractions ('dont' -> 'don't', 'im' -> 'I'm').
    4. Strips non-verbal symbols (~, ^, *, #, @, _, [], {}, \\, /, <>, |, •, ★) that cause TTS stutters.
    """
    if not text:
        return ""
    
    t = text
    # 1. Merge hyphen-split words from line wraps (e.g. 're- quests' -> 'requests')
    # We require at least one space after the hyphen so we don't accidentally merge normal hyphenated words like 'spider-man' or OCR'd M-dashes
    t = re.sub(r'(\b[a-zA-Z]{2,})-\s+([a-zA-Z]{2,}\b)', r'\1\2', t)

    # 2. Fix broken contractions with spaces (e.g. 'don t' -> "don't", 'i m' -> "I'm")
    contraction_fixes = [
        (r"\b([a-zA-Z]+)\s+t\b", r"\1't"),
        (r"\b([a-zA-Z]+)\s+s\b", r"\1's"),
        (r"\b([a-zA-Z]+)\s+re\b", r"\1're"),
        (r"\b([a-zA-Z]+)\s+ve\b", r"\1've"),
        (r"\b([a-zA-Z]+)\s+ll\b", r"\1'll"),
        (r"\b([a-zA-Z]+)\s+d\b", r"\1'd"),
        (r"\bi\s+m\b", "I'm"),
        (r"\bdont\b", "don't"),
        (r"\bcant\b", "can't"),
        (r"\bwont\b", "won't"),
        (r"\bdidnt\b", "didn't"),
        (r"\bisnt\b", "isn't"),
        (r"\baren\b", "aren't"),
        (r"\bwasnt\b", "wasn't"),
        (r"\bwerent\b", "weren't"),
        (r"\bhavent\b", "haven't"),
        (r"\bhasnt\b", "hasn't"),
        (r"\bhadnt\b", "hadn't"),
        (r"\bwouldnt\b", "wouldn't"),
        (r"\bcouldnt\b", "couldn't"),
        (r"\bshouldnt\b", "shouldn't"),
        (r"\bthats\b", "that's"),
        (r"\bwhats\b", "what's"),
        (r"\btheres\b", "there's"),
        (r"\byoure\b", "you're"),
        (r"\btheyre\b", "they're"),
    ]
    for pat, rep in contraction_fixes:
        t = re.sub(pat, rep, t, flags=re.IGNORECASE)

    # 3. (REMOVED) We no longer convert dashes/ellipses to commas, 
    # because Gemini and modern TTS engines handle M-dashes and ellipses beautifully natively.

    # 4. Remove all non-speech symbols
    t = re.sub(r'[~^#@*_\[\]{}\\\/<>\$|•►★☆♪♫="`]+', ' ', t)

    # 5. Clean punctuation spacing
    t = re.sub(r'\s*,\s*', ', ', t)
    t = re.sub(r'\s*\.\s*', '. ', t)
    t = re.sub(r'\s*\?\s*', '? ', t)
    t = re.sub(r'\s*\!\s*', '! ', t)
    t = re.sub(r',\s*,+', ', ', t)
    t = re.sub(r'\.\s*\.+', '. ', t)
    t = re.sub(r'\s+', ' ', t).strip()

    # 6. Remove leading/trailing non-word characters (but preserve valid punctuation)
    t = re.sub(r'^[^\w\'"—]+|[^\w\.\!\?\'"—]+$', '', t)
    return t.strip()

def prune_tts_repetition_loops(text: str, max_ngram: int = 4) -> str:
    """
    Removes immediate duplicated words and repeated n-gram loops that frequently appear
    in OCR feeds and can trigger autoregressive TTS stutter.
    """
    if not text:
        return ""

    def _norm(tok: str) -> str:
        return re.sub(r"[^a-z0-9']", "", tok.lower())

    tokens = text.split()
    if not tokens:
        return ""

    deduped = []
    for tok in tokens:
        if deduped:
            if _norm(deduped[-1]) == _norm(tok) and _norm(tok):
                continue
        deduped.append(tok)

    collapsed = []
    i = 0
    while i < len(deduped):
        removed_loop = False
        for n in range(min(max_ngram, max(2, (len(deduped) - i) // 2)), 1, -1):
            if i + (2 * n) > len(deduped):
                continue
            left = [_norm(t) for t in deduped[i:i + n]]
            right = [_norm(t) for t in deduped[i + n:i + (2 * n)]]
            if left == right and any(left):
                collapsed.extend(deduped[i:i + n])
                i += 2 * n
                removed_loop = True
                break
        if removed_loop:
            continue
        collapsed.append(deduped[i])
        i += 1

    cleaned = " ".join(collapsed)
    cleaned = re.sub(r'([!?.,])\1+', r'\1', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def estimate_speech_duration(text: str, speed: float = 1.0, duration_scale: float = 1.0) -> float:
    """
    Calculates tight, exact speech duration for diffusion TTS models (OmniVoice).
    Tight duration prevents the model from generating silence padding or looping/rereading words.
    """
    words = text.split()
    if not words:
        return 1.8
    syllables = 0
    for w in words:
        w_clean = re.sub(r'[^a-zA-Z]', '', w).lower()
        s_count = len(re.findall(r'[aeiouy]+', w_clean))
        syllables += max(1, s_count)
    
    # Natural speaking pace is ~3.3 words/s or ~4.2 syllables/s.
    # Tight baseline calculation:
    base_dur = (syllables * 0.22) + (len(words) * 0.06) + 0.35
    final_dur = max(1.2, round((base_dur * duration_scale) / max(0.2, speed), 2))
    return final_dur

def normalize_dialogue_text(text: str, apply_casing: bool = True, apply_repair: bool = True, sanitize_tts: bool = True) -> str:
    """
    Cleans OCR output from webtoons/manhwas:
    1. Removes OCR boundary garbage & vertical line glitches.
    2. Auto-repairs mangled OCR typos.
    3. Converts ALL-CAPS screaming ("THE GATE'S RANK WAS...") to natural speech casing.
    4. Fixes broken hyphens, duplicate ellipses, and speech artifacts.
    """
    if not text:
        return ""
    
    clean = text.strip()
    clean = re.sub(r'[\r\n\t]+', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean)
    clean = clean.replace('|', '').replace('..', '.')

    if not clean:
        return ""

    if apply_repair:
        clean = repair_manhwa_ocr_text(clean)

    # Check if text is all-caps (Manhwa standard typography)
    words = clean.split()
    if apply_casing and len(words) >= 2:
        upper_count = sum(1 for w in words if w.isupper() and len(w) > 1)
        if upper_count / len(words) > 0.6:
            # Smart Sentence Capitalization
            sentences = re.split(r'([\.\!\?\…]\s*)', clean)
            formatted = []
            for s in sentences:
                s_strip = s.strip()
                if s_strip and not re.match(r'^[\.\!\?\…]+$', s_strip):
                    capitalized = s_strip[0].upper() + s_strip[1:].lower()
                    capitalized = re.sub(r"\bi\b", "I", capitalized)
                    capitalized = re.sub(r"\bi'([a-z]+)", r"I'\1", capitalized)
                    formatted.append(capitalized)
                else:
                    formatted.append(s)
            clean = "".join(formatted)

    if sanitize_tts:
        clean = clean_tts_phonetics_and_dashes(clean)
        clean = prune_tts_repetition_loops(clean)
    else:
        clean = prune_tts_repetition_loops(clean)

    return clean.strip()

# ==========================================
# AUDIO DATA CONVERTER & NORMALIZE
# ==========================================
def save_numpy_to_wav(sr, data):
    """Converts a numpy array to a playable 16-bit PCM WAV file."""
    try:
        import scipy.io.wavfile as wavfile
        temp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        temp.close()
        
        if np.issubdtype(data.dtype, np.floating):
            max_val = np.max(np.abs(data))
            if max_val > 0:
                data = (data / max_val * 32767).astype(np.int16)
            else:
                data = (data * 32767).astype(np.int16)
        elif data.dtype != np.int16:
            data = data.astype(np.int16)
        
        wavfile.write(temp.name, int(sr), data)
        return temp.name
    except Exception as e:
        print(f"[WAV Save Error]: {e}")
        return None

def extract_audio_to_wav_file(raw_output, log_fn=None):
    """Extracts a local playable WAV/MP3 file from ANY Gradio/OmniVoice output format."""
    if raw_output is None:
        return None

    if isinstance(raw_output, str):
        raw_str = raw_output.strip()
        if os.path.exists(os.path.normpath(raw_str)):
            return os.path.normpath(raw_str)
        if raw_str.startswith("data:audio") and "base64," in raw_str:
            b64_data = raw_str.split("base64,")[1]
            temp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            temp.write(base64.b64decode(b64_data))
            temp.close()
            return temp.name
        if raw_str.startswith("http://") or raw_str.startswith("https://"):
            try:
                res = requests.get(raw_str, timeout=10)
                if res.status_code == 200:
                    temp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                    temp.write(res.content)
                    temp.close()
                    return temp.name
            except Exception:
                pass

    if isinstance(raw_output, (tuple, list)):
        if len(raw_output) == 2 and isinstance(raw_output[0], (int, float)) and isinstance(raw_output[1], np.ndarray):
            sr, arr = int(raw_output[0]), raw_output[1]
            if log_fn:
                log_fn(f"🎵 Gradio returned audio array: {sr}Hz, shape={arr.shape}")
            return save_numpy_to_wav(sr, arr)
        
        for item in raw_output:
            sub = extract_audio_to_wav_file(item, log_fn)
            if sub and os.path.exists(sub):
                return sub

    if isinstance(raw_output, dict):
        if "path" in raw_output and isinstance(raw_output["path"], str) and os.path.exists(os.path.normpath(raw_output["path"])):
            return os.path.normpath(raw_output["path"])
        if "name" in raw_output and isinstance(raw_output["name"], str) and os.path.exists(os.path.normpath(raw_output["name"])):
            return os.path.normpath(raw_output["name"])
        if "data" in raw_output and isinstance(raw_output["data"], str):
            return extract_audio_to_wav_file(raw_output["data"], log_fn)
        if "url" in raw_output and isinstance(raw_output["url"], str):
            return extract_audio_to_wav_file(raw_output["url"], log_fn)

    return None

# ==========================================
# MULTI-BACKEND AUDIBLE PLAYBACK ENGINE
# ==========================================
def play_wav_blocking(wav_path_or_bytes, log_fn=None):
    """Plays audio through speakers and strictly blocks until finished."""
    if not wav_path_or_bytes:
        if log_fn: log_fn("⚠️ No audio data received to play.")
        return False

    temp_file = None
    if isinstance(wav_path_or_bytes, (bytes, io.BytesIO)):
        data = wav_path_or_bytes.getvalue() if isinstance(wav_path_or_bytes, io.BytesIO) else wav_path_or_bytes
        temp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        temp.write(data)
        temp.close()
        wav_path = temp.name
        temp_file = wav_path
    else:
        wav_path = str(wav_path_or_bytes)

    if not os.path.exists(wav_path):
        if log_fn: log_fn(f"⚠️ Audio file not found at: {wav_path}")
        return False

    file_size_kb = round(os.path.getsize(wav_path) / 1024, 1)
    if log_fn: log_fn(f"🔊 Playing Audio ({file_size_kb} KB)...")

    # Backend 1: Native Windows built-in winsound
    if sys.platform.startswith("win"):
        try:
            import winsound
            winsound.PlaySound(wav_path, winsound.SND_FILENAME)
            if temp_file and os.path.exists(temp_file):
                try: os.remove(temp_file)
                except Exception: pass
            if log_fn: log_fn("✅ Audio Playback Completed (via Winsound)!")
            return True
        except Exception as we:
            if log_fn: log_fn(f"ℹ️ Winsound note: {we}, trying secondary audio player...")

    # Backend 2: Pygame Mixer
    try:
        import pygame
        if not pygame.mixer.get_init():
            try:
                pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
            except Exception:
                pygame.mixer.init()
        
        sound = pygame.mixer.Sound(wav_path)
        channel = sound.play()
        while channel and channel.get_busy():
            time.sleep(0.02)
            
        if temp_file and os.path.exists(temp_file):
            try: os.remove(temp_file)
            except Exception: pass
        if log_fn: log_fn("✅ Audio Playback Completed (via Pygame)!")
        return True
    except Exception:
        pass

    # Backend 3: PowerShell / CLI Media Player
    try:
        import subprocess
        if sys.platform.startswith("win"):
            ps_script = f"(New-Object Media.SoundPlayer '{wav_path}').PlaySync()"
            subprocess.run(["powershell", "-NoProfile", "-c", ps_script], capture_output=True, timeout=15)
        elif sys.platform.startswith("darwin"):
            subprocess.run(["afplay", wav_path], capture_output=True, timeout=15)
        else:
            subprocess.run(["aplay", wav_path], capture_output=True, timeout=15)

        if temp_file and os.path.exists(temp_file):
            try: os.remove(temp_file)
            except Exception: pass
        if log_fn: log_fn("✅ Audio Playback Completed (via System CLI)!")
        return True
    except Exception as se:
        if log_fn: log_fn(f"❌ System audio error: {se}")

    if temp_file and os.path.exists(temp_file):
        try: os.remove(temp_file)
        except Exception: pass

    return False

# ==========================================
# MODULAR TTS BACKENDS
# ==========================================
class BaseTTS(ABC):
    @abstractmethod
    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0, log_fn=None) -> bool:
        pass

class OmniVoiceTTS(BaseTTS):
    def __init__(self, server_url, ref_clip, ref_text="", language="English", duration_scale=1.45, allow_fallback=False, log_fn=None):
        self.server_url = server_url.rstrip("/")
        self.ref_clip = ref_clip
        self.ref_text = ref_text
        self.language = language
        self.duration_scale = float(duration_scale)
        self.allow_fallback = allow_fallback
        self.gradio_client = None
        self.api_schema = None
        self.connecting = False
        self.last_connect_time = 0
        self._cache_lock = threading.Lock()
        self._prefetch_cache = {}
        self._prefetch_inflight = set()
        self._max_prefetch_cache = 6
        threading.Thread(target=self._async_init_gradio, args=(log_fn,), daemon=True).start()

    def _async_init_gradio(self, log_fn=None):
        if self.connecting:
            return
        self.connecting = True
        try:
            from gradio_client import Client
            self.gradio_client = Client(self.server_url)
            msg = f"Connected to OmniVoice Gradio at {self.server_url}"
            print(f"[OmniVoice] {msg}")
            if log_fn: log_fn(f"📡 {msg}")

            try:
                self.api_schema = self.gradio_client.view_api(return_format="dict")
                named = self.api_schema.get("named_endpoints", {})
                if log_fn:
                    log_fn(f"📋 Gradio API ready with endpoints: {list(named.keys())}")
            except Exception:
                pass
        except Exception as e:
            self.gradio_client = None
            err_msg = f"OmniVoice Gradio connection failed at {self.server_url}: {e}"
            print(f"[OmniVoice] {err_msg}")
            if log_fn: log_fn(f"⚠️ {err_msg}")
        finally:
            self.connecting = False
            self.last_connect_time = time.time()

    def inspect_api(self, log_fn=None):
        """Deep inspection of the OmniVoice / Gradio API."""
        if log_fn: log_fn(f"🔍 Inspecting OmniVoice Server at: {self.server_url} ...")
        
        try:
            r = requests.get(self.server_url, timeout=5.0)
            if log_fn: log_fn(f"🌐 HTTP Status: {r.status_code} ({'OK' if r.status_code < 400 else 'Error'})")
        except Exception as e:
            if log_fn: log_fn(f"❌ Server unreachable: {e}")
            return

        norm_ref = os.path.abspath(os.path.normpath(self.ref_clip)) if self.ref_clip else ""
        if norm_ref and os.path.exists(norm_ref):
            size_mb = round(os.path.getsize(norm_ref) / (1024 * 1024), 2)
            if log_fn: log_fn(f"📁 Reference Audio Clip: '{os.path.basename(norm_ref)}' ({size_mb} MB) [VERIFIED EXISTS ✅]")
        else:
            if log_fn: log_fn(f"❌ Reference Audio Clip NOT found on disk at: '{self.ref_clip}'. Please browse and select your .wav recording!")

        try:
            from gradio_client import Client
            client = Client(self.server_url)
            schema = client.view_api(return_format="dict")
            named = schema.get("named_endpoints", {})
            if log_fn:
                log_fn(f"📋 Available Named Endpoints: {list(named.keys())}")
                if "/_clone_fn" in named:
                    log_fn("🎯 Target Endpoint '/_clone_fn' is READY for Voice Cloning!")
        except Exception as ge:
            if log_fn: log_fn(f"ℹ️ Gradio Client inspection note: {ge}")

    def _ensure_gradio_client(self, log_fn=None):
        if self.gradio_client is not None:
            return self.gradio_client
        try:
            from gradio_client import Client
            self.gradio_client = Client(self.server_url)
            return self.gradio_client
        except Exception as e:
            if log_fn:
                log_fn(f"❌ OmniVoice Gradio connection failed: {e}")
            return None

    def _build_ref_audio_payload(self):
        ref_path = None
        ref_payload = None
        if self.ref_clip:
            norm_ref = os.path.abspath(os.path.normpath(self.ref_clip))
            if os.path.exists(norm_ref):
                ref_path = norm_ref
                try:
                    from gradio_client import handle_file
                    ref_payload = handle_file(ref_path)
                except Exception:
                    ref_payload = ref_path
        return ref_path, ref_payload

    def _cache_key(self, clean_text: str, speed: float) -> str:
        return f"{clean_text.lower()}|{round(float(speed), 3)}"

    def _predict_to_wav(self, clean_text: str, speed: float, log_fn=None):
        client = self._ensure_gradio_client(log_fn=log_fn)
        if client is None:
            return None

        ref_path, ref_payload = self._build_ref_audio_payload()
        est_duration = estimate_speech_duration(clean_text, speed=speed, duration_scale=self.duration_scale)
        audio_input = ref_payload if ref_payload is not None else ref_path

        raw_result = client.predict(
            text=clean_text,
            lang=self.language if self.language in ["English", "Auto", "Japanese", "Korean", "Chinese", "Spanish", "French", "German"] else "English",
            ref_aud=audio_input,
            ref_text=self.ref_text or "",
            instruct="",
            ns=32.0,
            gs=2.2,
            dn=True,
            sp=float(speed),
            du=float(est_duration),
            pp=True,
            po=True,
            api_name="/_clone_fn"
        )

        return extract_audio_to_wav_file(raw_result, log_fn)

    def prefetch(self, text: str, speed: float = 1.0, log_fn=None):
        clean_text = normalize_dialogue_text(text, apply_casing=True, apply_repair=True)
        if not clean_text:
            return
        key = self._cache_key(clean_text, speed)

        with self._cache_lock:
            cached = self._prefetch_cache.get(key)
            if cached and os.path.exists(cached):
                return
            if key in self._prefetch_inflight:
                return
            self._prefetch_inflight.add(key)

        def _prefetch_worker():
            wav_file = None
            try:
                wav_file = self._predict_to_wav(clean_text, speed, log_fn=None)
                if wav_file and os.path.exists(wav_file):
                    with self._cache_lock:
                        self._prefetch_cache[key] = wav_file
                        while len(self._prefetch_cache) > self._max_prefetch_cache:
                            oldest_key = next(iter(self._prefetch_cache))
                            old_path = self._prefetch_cache.pop(oldest_key, None)
                            if old_path and old_path != wav_file and os.path.exists(old_path):
                                try:
                                    os.remove(old_path)
                                except Exception:
                                    pass
            except Exception:
                pass
            finally:
                with self._cache_lock:
                    self._prefetch_inflight.discard(key)

        threading.Thread(target=_prefetch_worker, daemon=True).start()

    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0, log_fn=None) -> bool:
        clean_text = normalize_dialogue_text(text, apply_casing=True, apply_repair=True)
        if not clean_text or len(clean_text.split()) == 0:
            return True

        words = clean_text.split()
        if log_fn:
            log_fn(f"🎙️ Synthesizing Voice Clone: '{clean_text}' ({len(words)} words)...")

        key = self._cache_key(clean_text, speed)
        wav_file = None
        with self._cache_lock:
            cached = self._prefetch_cache.pop(key, None)
            if cached and os.path.exists(cached):
                wav_file = cached

        if wav_file and log_fn:
            log_fn("⚡ Using prefetched OmniVoice audio (low latency).")

        if wav_file is None:
            try:
                wav_file = self._predict_to_wav(clean_text, speed, log_fn=log_fn)
            except Exception as e:
                err_msg = str(e)
                if log_fn:
                    log_fn(f"❌ OmniVoice Error: {err_msg}")
                wav_file = None

        if wav_file and os.path.exists(wav_file):
            return play_wav_blocking(wav_file, log_fn)

        if self.allow_fallback:
            if log_fn: log_fn("⚠️ Fallback to robotic Windows PyTTSx3...")
            fallback = LocalPyttsx3TTS()
            return fallback.synthesize_and_play_blocking(clean_text, speed, log_fn)
        else:
            if log_fn:
                log_fn("🛑 Voice Clone failed and robotic fallback is disabled. Check server status or switch to Edge-TTS!")
            return False


class CosyVoiceTTS(BaseTTS):
    """Local CosyVoice Gradio client using zero-shot reference-voice cloning."""
    def __init__(self, server_url, ref_clip, ref_text="", mode="zero_shot", log_fn=None):
        self.server_url = server_url.rstrip("/")
        self.ref_clip = ref_clip
        self.ref_text = ref_text
        self.mode = mode
        self.gradio_client = None
        self.api_schema = None
        self._cache_lock = threading.Lock()
        self._prefetch_cache = {}
        self._prefetch_inflight = set()
        self._max_prefetch_cache = 6
        threading.Thread(target=self._async_init_gradio, args=(log_fn,), daemon=True).start()

    def _async_init_gradio(self, log_fn=None):
        try:
            from gradio_client import Client
            self.gradio_client = Client(self.server_url)
            try:
                self.api_schema = self.gradio_client.view_api(return_format="dict")
            except Exception:
                self.api_schema = None
            if log_fn:
                log_fn(f"📡 Connected to local CosyVoice at {self.server_url}")
        except Exception as e:
            if log_fn:
                log_fn(f"⚠️ Local CosyVoice unavailable at {self.server_url}: {e}")

    def _ensure_client(self, log_fn=None):
        if self.gradio_client is not None:
            return self.gradio_client
        try:
            from gradio_client import Client
            self.gradio_client = Client(self.server_url)
            try:
                self.api_schema = self.gradio_client.view_api(return_format="dict")
            except Exception:
                self.api_schema = None
            return self.gradio_client
        except Exception as e:
            if log_fn:
                log_fn(f"❌ CosyVoice connection failed: {e}")
            return None

    def _get_named_endpoints(self):
        if not isinstance(self.api_schema, dict):
            return {}
        named = self.api_schema.get("named_endpoints", {})
        return named if isinstance(named, dict) else {}

    def _resolve_generate_api_name(self):
        named = self._get_named_endpoints()
        if "/generate_audio" in named:
            return "/generate_audio"
        for candidate in ["/generate", "/inference", "/tts", "/predict"]:
            if candidate in named:
                return candidate
        if named:
            return next(iter(named.keys()))
        return "/generate_audio"

    def _endpoint_param_names(self, api_name):
        params = self._endpoint_params(api_name)
        names = []
        for item in params:
            if isinstance(item, dict):
                p = item.get("parameter_name")
                if isinstance(p, str):
                    names.append(p)
        return names

    def _endpoint_params(self, api_name):
        named = self._get_named_endpoints()
        endpoint = named.get(api_name, {})
        params = endpoint.get("parameters", [])
        return params if isinstance(params, list) else []

    def _literal_choices_from_type(self, python_type):
        if isinstance(python_type, dict):
            type_str = python_type.get("type", "")
        else:
            type_str = str(python_type) if python_type is not None else ""
        if "Literal[" not in type_str:
            return []
        values = re.findall(r"'([^']*)'", type_str)
        return values if values else []

    def _param_meta(self, api_name):
        meta = {}
        for item in self._endpoint_params(api_name):
            if isinstance(item, dict):
                name = item.get("parameter_name")
                if isinstance(name, str):
                    meta[name] = item
        return meta

    def _resolve_mode_label(self, mode_choices):
        mode_key = str(self.mode or "").strip().lower()
        mode_map = {
            "zero_shot": "3s极速复刻",
            "instruct": "自然语言控制",
            "cross_lingual": "跨语种复刻",
            "sft": "预训练音色",
            "pretrained": "预训练音色",
        }
        preferred = mode_map.get(mode_key, self.mode)
        if mode_choices:
            if preferred in mode_choices:
                return preferred
            if isinstance(self.mode, str) and self.mode in mode_choices:
                return self.mode
            return mode_choices[0]
        return preferred

    def _mode_candidates(self, mode_choices):
        primary = self._resolve_mode_label(mode_choices)
        candidates = [primary]
        for item in mode_choices:
            if item not in candidates:
                candidates.append(item)
        return candidates

    def _first_present_key(self, candidates, available_names):
        for name in candidates:
            if name in available_names:
                return name
        return None

    def _build_dynamic_payload(self, clean_text, ref_file, api_name, speed=1.0):
        names = self._endpoint_param_names(api_name)
        names_set = set(names)
        meta = self._param_meta(api_name)
        payload = {}

        text_key = self._first_present_key(["tts_text", "text", "input_text", "synthesis_text"], names_set)
        if text_key:
            payload[text_key] = clean_text[:200]

        mode_key = self._first_present_key(["mode_value", "mode", "tts_mode", "mode_checkbox_group"], names_set)
        if mode_key:
            mode_choices = self._literal_choices_from_type(meta.get(mode_key, {}).get("python_type"))
            payload[mode_key] = self._resolve_mode_label(mode_choices)

        prompt_text_key = self._first_present_key(["prompt_text", "ref_text", "reference_text"], names_set)
        if prompt_text_key and self.ref_text:
            payload[prompt_text_key] = self.ref_text

        prompt_wav_key = self._first_present_key(["prompt_wav_upload", "prompt_wav", "ref_wav", "reference_audio"], names_set)
        if prompt_wav_key:
            payload[prompt_wav_key] = ref_file

        record_key = self._first_present_key(["prompt_wav_record", "record_audio"], names_set)
        if record_key:
            payload[record_key] = ref_file

        instruct_key = self._first_present_key(["instruct_text", "instruction"], names_set)
        if instruct_key:
            payload[instruct_key] = ""

        seed_key = self._first_present_key(["seed", "random_seed"], names_set)
        if seed_key:
            payload[seed_key] = 12345

        stream_key = self._first_present_key(["stream", "is_stream", "streaming"], names_set)
        if stream_key:
            payload[stream_key] = False

        lang_key = self._first_present_key(["ui_lang", "language", "lang"], names_set)
        if lang_key:
            payload[lang_key] = "En"

        sft_key = self._first_present_key(["sft_dropdown", "voice_dropdown"], names_set)
        if sft_key:
            sft_choices = self._literal_choices_from_type(meta.get(sft_key, {}).get("python_type"))
            payload[sft_key] = sft_choices[0] if sft_choices else ""

        speed_key = self._first_present_key(["speed", "speech_speed"], names_set)
        if speed_key:
            payload[speed_key] = float(speed)

        if not names:
            payload = {
                "tts_text": clean_text[:200],
                "prompt_text": self.ref_text,
                "prompt_wav_upload": ref_file,
                "mode": self.mode,
            }

        return payload, names, meta

    def _cache_key(self, text, speed):
        return f"{text.lower()}|{round(float(speed), 3)}|{self.mode}"

    def _predict_to_wav(self, clean_text, speed=1.0, log_fn=None):
        client = self._ensure_client(log_fn)
        if client is None:
            return None

        ref_path = os.path.abspath(os.path.normpath(self.ref_clip)) if self.ref_clip else ""
        if not ref_path or not os.path.exists(ref_path):
            if log_fn:
                log_fn(f"❌ CosyVoice reference audio not found: {self.ref_clip}")
            return None
        if not self.ref_text.strip():
            if log_fn:
                log_fn("❌ CosyVoice requires the exact transcript of the reference audio.")
            return None

        from gradio_client import handle_file
        api_name = self._resolve_generate_api_name()
        ref_file = handle_file(ref_path)
        payload, param_names, meta = self._build_dynamic_payload(clean_text, ref_file, api_name, speed=speed)
        if log_fn and param_names:
            log_fn(f"🧩 CosyVoice endpoint {api_name} params: {', '.join(param_names)}")
        if "/change_instruction" in self._get_named_endpoints():
            mode_key = self._first_present_key(["mode_value", "mode", "tts_mode", "mode_checkbox_group"], set(param_names))
            if mode_key and mode_key in payload:
                try:
                    client.predict(payload[mode_key], api_name="/change_instruction")
                except Exception:
                    pass

        mode_key = self._first_present_key(["mode_value", "mode", "tts_mode", "mode_checkbox_group"], set(param_names))
        upload_key = self._first_present_key(["prompt_wav_upload", "prompt_wav", "ref_wav", "reference_audio"], set(param_names))
        record_key = self._first_present_key(["prompt_wav_record", "record_audio"], set(param_names))
        stream_key = self._first_present_key(["stream", "is_stream", "streaming"], set(param_names))

        mode_choices = []
        if mode_key:
            mode_choices = self._literal_choices_from_type(meta.get(mode_key, {}).get("python_type"))
        candidate_modes = self._mode_candidates(mode_choices) if mode_choices else [payload.get(mode_key)]

        stream_variants = [False]
        if stream_key:
            stream_choices = self._literal_choices_from_type(meta.get(stream_key, {}).get("python_type"))
            if "False" in stream_choices:
                stream_variants.append("False")

        record_variants = []
        if record_key:
            record_variants = [payload.get(record_key), None]
            if record_variants[0] is None:
                record_variants = [None, ref_file]
        else:
            record_variants = [None]

        last_error = None
        attempt = 0
        for mode_value in candidate_modes:
            for record_value in record_variants:
                for stream_value in stream_variants:
                    call_payload = dict(payload)
                    if mode_key and mode_value is not None:
                        call_payload[mode_key] = mode_value
                    if upload_key and upload_key not in call_payload:
                        call_payload[upload_key] = ref_file
                    if record_key:
                        call_payload[record_key] = record_value
                    if stream_key:
                        call_payload[stream_key] = stream_value
                    attempt += 1
                    try:
                        if log_fn:
                            log_fn(
                                f"🧪 CosyVoice attempt #{attempt}: mode={call_payload.get(mode_key, '')}, "
                                f"record={'set' if call_payload.get(record_key) else 'none'}, stream={call_payload.get(stream_key)}"
                            )
                        result = client.predict(api_name=api_name, **call_payload)
                        wav = extract_audio_to_wav_file(result, log_fn)
                        if wav and os.path.exists(wav):
                            return wav
                    except Exception as e:
                        last_error = e
                        if log_fn:
                            log_fn(f"⚠️ CosyVoice attempt #{attempt} failed: {e}")

        if last_error is not None:
            raise last_error
        return None

    def prefetch(self, text, speed=1.0, log_fn=None):
        clean_text = normalize_dialogue_text(text, apply_casing=True, apply_repair=True)
        if not clean_text:
            return
        key = self._cache_key(clean_text, speed)
        with self._cache_lock:
            if key in self._prefetch_cache or key in self._prefetch_inflight:
                return
            self._prefetch_inflight.add(key)

        def worker():
            try:
                wav_file = self._predict_to_wav(clean_text, speed, log_fn=None)
                if wav_file and os.path.exists(wav_file):
                    with self._cache_lock:
                        self._prefetch_cache[key] = wav_file
                        while len(self._prefetch_cache) > self._max_prefetch_cache:
                            old_key, old_path = self._prefetch_cache.popitem()
                            if old_path != wav_file and os.path.exists(old_path):
                                try:
                                    os.remove(old_path)
                                except OSError:
                                    pass
            except Exception:
                pass
            finally:
                with self._cache_lock:
                    self._prefetch_inflight.discard(key)

        threading.Thread(target=worker, daemon=True).start()

    def synthesize_and_play_blocking(self, text, speed=1.0, log_fn=None):
        clean_text = normalize_dialogue_text(text, apply_casing=True, apply_repair=True)
        if not clean_text:
            return True
        key = self._cache_key(clean_text, speed)
        with self._cache_lock:
            wav_file = self._prefetch_cache.pop(key, None)
        if wav_file and os.path.exists(wav_file):
            if log_fn:
                log_fn("⚡ Using prefetched CosyVoice audio.")
        else:
            try:
                wav_file = self._predict_to_wav(clean_text, speed, log_fn)
            except Exception as e:
                if log_fn:
                    log_fn(f"❌ CosyVoice Error: {e}")
                return False
        return bool(wav_file and play_wav_blocking(wav_file, log_fn))


class GeminiTTSBackend(BaseTTS):
    """Google Gemini AI TTS Backend (gemini-3.1-flash-tts-preview)"""
    def __init__(self, voice_name="Aoede"):
        self.voice_name = voice_name
        
    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0, log_fn=None) -> bool:
        clean_text = normalize_dialogue_text(text, apply_casing=True)
        if not clean_text:
            return True
            
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            if log_fn:
                log_fn("❌ GEMINI_API_KEY environment variable not set. Please set it to use Gemini TTS.")
            return False

        if log_fn:
            log_fn(f"🎙️ Synthesizing Gemini Voice ({self.voice_name}): '{clean_text}'...")

        try:
            import requests
            import base64
            import wave
            import io
            
            url = f"https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.1-flash-tts-preview:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": clean_text}]}],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": self.voice_name
                            }
                        }
                    }
                }
            }
            
            headers = {"Content-Type": "application/json"}
            response = requests.post(url, headers=headers, json=payload, timeout=120)
            
            if response.status_code != 200:
                if log_fn: log_fn(f"❌ Gemini API Error: {response.text}")
                return False
                
            data = response.json()
            if "candidates" in data and len(data["candidates"]) > 0:
                parts = data["candidates"][0].get("content", {}).get("parts", [])
                for part in parts:
                    if "inlineData" in part and "data" in part["inlineData"]:
                        b64_audio = part["inlineData"]["data"]
                        pcm_data = base64.b64decode(b64_audio)
                        
                        # Wrap raw 24kHz PCM into a standard WAV file
                        wav_io = io.BytesIO()
                        with wave.open(wav_io, 'wb') as wav_file:
                            wav_file.setnchannels(1)      # Mono
                            wav_file.setsampwidth(2)      # 16-bit
                            wav_file.setframerate(24000)  # Gemini default is 24kHz
                            wav_file.writeframes(pcm_data)
                            
                        wav_bytes = wav_io.getvalue()
                        return play_wav_blocking(wav_bytes, log_fn)
                        
            if log_fn: log_fn("❌ No audio data returned from Gemini.")
            return False
            
        except Exception as e:
            if log_fn: log_fn(f"❌ Gemini TTS Error: {e}")
        return False

class EdgeTTSBackend(BaseTTS):
    """Ultra-realistic Microsoft Neural HD Studio voices (Christopher, Guy, Eric, Jenny, etc.). Zero hallucination."""
    def __init__(self, voice_name="en-US-ChristopherNeural"):
        self.voice_name = voice_name

    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0, log_fn=None) -> bool:
        clean_text = normalize_dialogue_text(text, apply_casing=True)
        if not clean_text:
            return True

        if log_fn:
            log_fn(f"🎙️ Synthesizing Studio Voice ({self.voice_name}): '{clean_text}'...")

        try:
            import edge_tts
            temp_mp3 = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
            temp_mp3.close()

            # Speed string format: "+10%" or "-10%"
            speed_pct = int((speed - 1.0) * 100)
            rate_str = f"{'+' if speed_pct >= 0 else ''}{speed_pct}%"

            async def _run_edge():
                communicate = edge_tts.Communicate(clean_text, self.voice_name, rate=rate_str)
                await communicate.save(temp_mp3.name)

            asyncio.run(_run_edge())

            if os.path.exists(temp_mp3.name) and os.path.getsize(temp_mp3.name) > 100:
                success = play_wav_blocking(temp_mp3.name, log_fn)
                try: os.remove(temp_mp3.name)
                except Exception: pass
                return success
        except ImportError:
            if log_fn:
                log_fn("ℹ️ Edge-TTS not installed. Run: pip install edge-tts for studio HD human voices!")
        except Exception as e:
            if log_fn: log_fn(f"❌ Edge-TTS Error: {e}")

        return False


class LocalPyttsx3TTS(BaseTTS):
    def __init__(self):
        self.engine = None
        self._init_engine()

    def _init_engine(self):
        try:
            if sys.platform.startswith("win"):
                try:
                    pythoncom = importlib.import_module("pythoncom")
                    pythoncom.CoInitialize()
                except Exception:
                    pass
            import pyttsx3
            self.engine = pyttsx3.init()
            self.engine.setProperty('rate', 175)
        except Exception as e:
            self.engine = None
            print(f"[PyTTSx3 Init Error]: {e}")

    def synthesize_and_play_blocking(self, text: str, speed: float = 1.0, log_fn=None) -> bool:
        if not self.engine:
            self._init_engine()
        
        clean_text = normalize_dialogue_text(text, apply_casing=True)
        if not self.engine or not clean_text:
            return True

        try:
            if log_fn: log_fn(f"🗣️ Playing via Local Windows PyTTSx3 (SAPI5): '{clean_text}'")
            self.engine.say(clean_text)
            self.engine.runAndWait()
            return True
        except Exception as e:
            if log_fn: log_fn(f"❌ PyTTSx3 Error: {e}")
            return False

# ==========================================
# THEFUZZ TEXT DEDUPLICATION & LOOP SUPPRESSION
# ==========================================
class RecentTextBuffer:
    def __init__(self, capacity=50, threshold=75):
        self.capacity = capacity
        self.threshold = threshold
        self.history = []

    def is_duplicate(self, new_text: str) -> bool:
        clean = re.sub(r'[^a-zA-Z0-9\s]', '', new_text).strip().lower()
        if not clean or len(clean) < 2:
            return True

        words = clean.split()
        for item in self.history:
            item_clean = re.sub(r'[^a-zA-Z0-9\s]', '', item).strip().lower()
            if not item_clean:
                continue

            # Exact match
            if clean == item_clean:
                return True

            # Substring containment ONLY when lengths are comparable (>= 80% length ratio)
            # This prevents short questions ("what is this notebook?") from colliding with long paragraphs containing "notebook"
            min_l = min(len(clean), len(item_clean))
            max_l = max(len(clean), len(item_clean))
            if max_l > 0 and (min_l / max_l) >= 0.80:
                if clean in item_clean or item_clean in clean:
                    return True

            # Full string fuzzy ratio
            ratio = fuzz.ratio(clean, item_clean)
            if ratio >= self.threshold:
                return True

            # Token sort similarity ONLY when word counts are comparable
            item_words = item_clean.split()
            w_min = min(len(words), len(item_words))
            w_max = max(len(words), len(item_words))
            if w_max > 0 and (w_min / w_max) >= 0.70:
                token_sort = fuzz.token_sort_ratio(clean, item_clean)
                if token_sort >= max(self.threshold, 82):
                    return True

        return False

    def add(self, text: str):
        self.history.append(text.strip().lower())
        if len(self.history) > self.capacity:
            self.history.pop(0)

# ==========================================
# DIALOGUE BUBBLE STABILIZER & SETTLER
# ==========================================
class DialogueStabilizer:
    """
    Prevents premature reading of half-entered speech bubbles.
    Waits for the bubble to finish scrolling into view and stabilize before dispatching to TTS.
    """
    def __init__(self, settle_sec=0.85, min_words=2):
        self.settle_sec = settle_sec
        self.min_words = min_words
        self.candidate_text = ""
        self.first_seen_time = 0
        self.last_expanded_time = 0
        self.stable_frames = 0

    def update(self, raw_text: str) -> str:
        """
        Receives new raw OCR text from the current video frame.
        Returns the finalized dialogue string if it is ready to be spoken, or "" if still stabilizing.
        """
        clean = normalize_dialogue_text(raw_text, apply_casing=True, apply_repair=True, sanitize_tts=True)
        if not clean:
            return ""

        words = clean.split()
        is_exclamation = len(words) == 1 and (re.search(r'[\!\?\…\.]', raw_text) is not None) and len(re.sub(r'[^a-zA-Z]', '', words[0])) >= 2
        if len(words) < self.min_words and not is_exclamation:
            # Ignore solitary 1-word fragments unless valid punctuated exclamation (e.g. "UGH...!!")
            return ""

        now = time.time()

        # If we have no candidate, initialize
        if not self.candidate_text:
            self.candidate_text = clean
            self.first_seen_time = now
            self.last_expanded_time = now
            self.stable_frames = 1
            return ""

        # Check if the text is expanding as the bubble scrolls into view
        cand_lower = self.candidate_text.lower()
        new_lower = clean.lower()

        if len(clean) > len(self.candidate_text) and (cand_lower in new_lower or fuzz.partial_ratio(cand_lower, new_lower) > 75):
            # Text expanded! Update candidate and reset settle timer
            self.candidate_text = clean
            self.last_expanded_time = now
            self.stable_frames = 1
            return ""

        # Check if text is stable across frames
        if fuzz.ratio(cand_lower, new_lower) >= 82:
            self.stable_frames += 1
        else:
            # Entirely new text appeared
            self.candidate_text = clean
            self.first_seen_time = now
            self.last_expanded_time = now
            self.stable_frames = 1
            return ""

        # Verification: Has the text settled long enough?
        time_since_expanded = now - self.last_expanded_time
        has_punctuation = bool(re.search(r'[\.\!\?\…\”\"\~]$', self.candidate_text))

        # If it has terminal punctuation, it settles faster (0.45s). Otherwise, wait full settle_sec.
        required_settle = max(0.40, self.settle_sec * 0.6) if has_punctuation else self.settle_sec

        if time_since_expanded >= required_settle and self.stable_frames >= 2:
            ready_text = self.candidate_text
            self.candidate_text = ""
            self.stable_frames = 0
            return ready_text

        return ""

# ==========================================
# ADVANCED MANHWA OCR PREPROCESSING
# ==========================================
def preprocess_manhwa_image(img_bgr, enable_advanced=True, max_variants=None):
    """
    Advanced multi-variant preprocessing tuned for manhwa speech bubbles & glowing font outlines:
    1. Raw BGR
    2. CLAHE (Local Adaptive Contrast Boost)
    3. Dark Background Inversion (for dark burst bubbles like "WHAT IS THIS NOTEBOOK?")
    4. 1.5x Bicubic Scaled Inverted (sharpens condensed italics & small serif fonts)
    5. High-Luminance Core Stroke Isolation (strips outer diffuse glow halo)
    6. Morphological Opening (severs connected glowing bridges between letters)
    7. Standard & Inverted Otsu Binarization
    """
    if not enable_advanced or img_bgr is None:
        return [img_bgr]

    variants = [img_bgr]
    try:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        mean_lum = float(np.mean(gray))

        # 1. CLAHE Contrast Boost
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        variants.append(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR))

        # 2. Dark-Background Inversion (dark burst bubbles with white/blue glowing text)
        if mean_lum < 110:
            inv_gray = cv2.bitwise_not(gray)
            enhanced_inv = clahe.apply(inv_gray)
            variants.append(cv2.cvtColor(enhanced_inv, cv2.COLOR_GRAY2BGR))

        # 3. 1.5x Scaled Inverted (greatly improves small stylized fonts)
        h, w = gray.shape[:2]
        if h > 20 and w > 20:
            scaled = cv2.resize(gray, (int(w * 1.5), int(h * 1.5)), interpolation=cv2.INTER_CUBIC)
            if mean_lum < 110:
                scaled = cv2.bitwise_not(scaled)
            scaled_enhanced = clahe.apply(scaled)
            variants.append(cv2.cvtColor(scaled_enhanced, cv2.COLOR_GRAY2BGR))

        # 4. Adaptive local thresholding catches glowing/inverted fantasy skill text
        denoised = cv2.bilateralFilter(enhanced, 7, 40, 40)
        adaptive = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 7
        )
        variants.append(cv2.cvtColor(adaptive, cv2.COLOR_GRAY2BGR))
        variants.append(cv2.cvtColor(cv2.bitwise_not(adaptive), cv2.COLOR_GRAY2BGR))

        # 5. High-Luminance Core Stroke Isolation (removes outer glow halo)
        _, core_thresh = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)
        if cv2.countNonZero(core_thresh) > 40:
            variants.append(cv2.cvtColor(core_thresh, cv2.COLOR_GRAY2BGR))
            # Inverted core (black letters on white)
            variants.append(cv2.cvtColor(cv2.bitwise_not(core_thresh), cv2.COLOR_GRAY2BGR))

            # 6. Morphological Opening to sever fused letter bridges
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            opened = cv2.morphologyEx(core_thresh, cv2.MORPH_OPEN, kernel)
            variants.append(cv2.cvtColor(opened, cv2.COLOR_GRAY2BGR))

        # 7. Standard Otsu Adaptive Binarization
        _, thresh = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR))

        # 8. Inverted Otsu Binarization
        inv_thresh = cv2.bitwise_not(thresh)
        variants.append(cv2.cvtColor(inv_thresh, cv2.COLOR_GRAY2BGR))
    except Exception as e:
        print(f"[Preprocess Warning]: {e}")

    if max_variants is not None:
        return variants[:max(1, int(max_variants))]
    return variants

# ==========================================
# ULTRA-RESILIENT MULTI-ENGINE OCR
# ==========================================
class ResilientOCR:
    def __init__(self, preference="auto", log_fn=None):
        self.preference = preference
        self.log_fn = log_fn
        self.engine_type = None
        self.engine_instance = None
        self.init_engine()

    def init_engine(self):
        # 1. RapidOCR (ONNX Runtime)
        if self.preference in ("auto", "rapidocr"):
            try:
                from rapidocr_onnxruntime import RapidOCR
                self.engine_instance = RapidOCR()
                self.engine_type = "RapidOCR (ONNX Runtime, High-Speed)"
                print(f"[OCR] Loaded: {self.engine_type}")
                if self.log_fn: self.log_fn(f"🔍 OCR Active: {self.engine_type} ✅")
                return
            except Exception as e:
                print(f"[OCR] RapidOCR unavailable: {e}")

        # 2. Windows Native Media OCR (Windows 10 & 11 Built-in)
        if self.preference in ("auto", "winocr"):
            try:
                winocr = importlib.import_module("winocr")
                self.engine_instance = "winocr"
                self.engine_type = "Windows 10/11 Native Media OCR (WinRT)"
                print(f"[OCR] Loaded: {self.engine_type}")
                if self.log_fn: self.log_fn(f"🔍 OCR Active: {self.engine_type} ✅")
                return
            except Exception as e:
                print(f"[OCR] WinOCR unavailable: {e}")

        # 3. PaddleOCR Fallback
        if self.preference in ("auto", "paddleocr"):
            try:
                PaddleOCR = importlib.import_module("paddleocr").PaddleOCR
                self.engine_instance = PaddleOCR(lang="en", use_angle_cls=True)
                self.engine_type = "PaddleOCR (Standard Engine)"
                print(f"[OCR] Loaded: {self.engine_type}")
                if self.log_fn: self.log_fn(f"🔍 OCR Active: {self.engine_type} ✅")
                return
            except Exception as e:
                py_ver = f"{sys.version_info.major}.{sys.version_info.minor}"
                cpu_arch = platform.machine() if hasattr(platform, "machine") else "unknown"
                print(f"[OCR] PaddleOCR unavailable: {e}")
                if self.log_fn:
                    self.log_fn(
                        f"⚠️ PaddleOCR failed on Python {py_ver} ({cpu_arch}). "
                        "Use matching paddlepaddle wheel (Python 3.10/3.11 preferred), "
                        "or keep RapidOCR/WinOCR enabled."
                    )

        self.engine_type = "None"
        if self.log_fn:
            self.log_fn("⚠️ No OCR engine available. Run: pip install rapidocr-onnxruntime onnxruntime winocr")

    def extract_text(self, img_bgr, min_conf=0.25):
        if self.engine_instance is None or img_bgr is None:
            return ""

        try:
            if "RapidOCR" in str(self.engine_type):
                result, _ = self.engine_instance(img_bgr)
                if result:
                    lines = []
                    for item in result:
                        if len(item) >= 3:
                            text, conf = item[1], float(item[2])
                            if conf >= min_conf:
                                clean = text.strip()
                                if len(clean) >= 2 and not clean.isnumeric():
                                    lines.append(clean)
                    return " ".join(lines).strip()

            elif self.engine_instance == "winocr":
                winocr = importlib.import_module("winocr")
                pil_img = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
                res = winocr.recognize_pil_sync(pil_img, lang="en")
                if res and "text" in res:
                    return res["text"].strip()

            elif "PaddleOCR" in str(self.engine_type):
                res = self.engine_instance.ocr(img_bgr, cls=True)
                if res and len(res) > 0 and res[0]:
                    lines = []
                    for item in res[0]:
                        if len(item) >= 2 and isinstance(item[1], (list, tuple)):
                            text, conf = item[1][0], float(item[1][1])
                            if conf >= min_conf:
                                clean = text.strip()
                                if len(clean) >= 2 and not clean.isnumeric():
                                    lines.append(clean)
                    return " ".join(lines).strip()

        except Exception as e:
            print(f"[OCR Recognition Error]: {e}")

        return ""

# ==========================================
# CORE SCREEN READER ENGINE
# ==========================================
class ScreenReaderEngine:
    def __init__(self, config, on_text_detected=None, log_fn=None):
        self.config = config
        self.on_text_detected = on_text_detected
        self.log_fn = log_fn
        self.running = False
        self.paused = False
        self.is_speaking = False
        self.buffer = RecentTextBuffer(capacity=40, threshold=self.config.get("fuzzy_threshold", 75))
        self.stabilizer = DialogueStabilizer(
            settle_sec=float(self.config.get("bubble_settle_sec", 0.85)),
            min_words=int(self.config.get("min_dialogue_words", 2))
        )
        self.mouse_ctrl = mouse.Controller()
        self.ocr = None
        self.tts = None
        self.tts_queue = None
        self.tts_worker = None
        self.tts_worker_running = True
        self.current_tts_job = None
        self.prefetch_hint_text = ""
        self.init_ocr()
        self.init_tts()
        self._init_tts_worker()

    def update_config(self, new_config):
        self.config.update(new_config)
        self.buffer.threshold = self.config.get("fuzzy_threshold", 75)
        self.stabilizer.settle_sec = float(self.config.get("bubble_settle_sec", 0.85))
        self.stabilizer.min_words = int(self.config.get("min_dialogue_words", 2))
        self.init_ocr()
        self.init_tts()
        self._init_tts_worker()

    def init_ocr(self):
        pref = self.config.get("ocr_engine_preference", "auto")
        self.ocr = ResilientOCR(preference=pref, log_fn=self.log_fn)

    def init_tts(self):
        backend = self.config.get("tts_backend", "omnivoice")
        if backend == "omnivoice":
            self.tts = GeminiTTSBackend(voice_name="Aoede")
        elif backend == "cosyvoice":
            self.tts = CosyVoiceTTS(
                server_url=self.config.get("cosyvoice_url", "http://127.0.0.1:50000"),
                ref_clip=self.config.get("omnivoice_ref_clip", "audio.wav"),
                ref_text=self.config.get("omnivoice_ref_text", ""),
                mode=self.config.get("cosyvoice_mode", "zero_shot"),
                log_fn=self.log_fn
            )
        elif backend == "edgetts":
            self.tts = EdgeTTSBackend(
                voice_name=self.config.get("edge_tts_voice", "en-US-ChristopherNeural")
            )
        else:
            self.tts = LocalPyttsx3TTS()
        self.prefetch_hint_text = ""

    def _init_tts_worker(self):
        queue_size = max(1, int(self.config.get("max_tts_queue", 2)))
        restart_needed = self.tts_queue is None or self.tts_queue.maxsize != queue_size
        if restart_needed:
            self.tts_queue = queue.Queue(maxsize=queue_size)
        if self.tts_worker is None or not self.tts_worker.is_alive():
            self.tts_worker = threading.Thread(target=self._tts_worker_loop, daemon=True)
            self.tts_worker.start()

    def _enqueue_tts(self, text: str, speed: float):
        if not self.tts_queue:
            return

        item = {"text": text, "speed": speed}
        if self.tts_queue.full():
            try:
                dropped = self.tts_queue.get_nowait()
                if self.log_fn:
                    self.log_fn(f"⏭️ Skipping stale queued line: '{dropped.get('text', '')[:42]}'")
            except queue.Empty:
                pass
        try:
            self.tts_queue.put_nowait(item)
        except queue.Full:
            if self.log_fn:
                self.log_fn("⚠️ TTS queue full; newest line dropped to preserve realtime scroll.")

    def _tts_worker_loop(self):
        while self.tts_worker_running:
            if self.tts_queue is None:
                time.sleep(0.05)
                continue
            try:
                job = self.tts_queue.get(timeout=0.1)
            except queue.Empty:
                self.current_tts_job = None
                self.is_speaking = False
                continue

            text = job.get("text", "")
            speed = float(job.get("speed", 1.0))
            self.current_tts_job = text
            self.is_speaking = True
            try:
                self.tts.synthesize_and_play_blocking(text, speed=speed, log_fn=self.log_fn)
                pause_sec = float(self.config.get("dialogue_pause_sec", 0.4))
                time.sleep(max(0.0, pause_sec))
            finally:
                self.current_tts_job = None
                self.is_speaking = False

    def get_read_zone_bbox(self, sct):
        monitors = sct.monitors
        m_idx = min(max(1, self.config.get("monitor_index", 1)), len(monitors) - 1)
        mon = monitors[m_idx]
        
        sw = mon["width"]
        sh = mon["height"]
        left_offset = mon["left"]
        top_offset = mon["top"]

        top_pct = self.config.get("read_zone_top", 20) / 100.0
        height_pct = self.config.get("read_zone_height", 55) / 100.0
        left_pct = self.config.get("read_zone_left", 10) / 100.0
        width_pct = self.config.get("read_zone_width", 80) / 100.0

        top = top_offset + int(sh * top_pct)
        height = int(sh * height_pct)
        left = left_offset + int(sw * left_pct)
        width = int(sw * width_pct)

        return {"top": top, "left": left, "width": width, "height": height}

    def capture_frame(self, sct):
        bbox = self.get_read_zone_bbox(sct)
        raw = np.array(sct.grab(bbox))
        return cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)

    def extract_text(self, img_bgr):
        if not self.ocr:
            self.init_ocr()
        if not self.ocr or img_bgr is None:
            return ""
        
        min_conf = float(self.config.get("ocr_confidence", 0.18))
        is_manhwa = self.config.get("mode", "manhwa") == "manhwa"
        apply_repair = is_manhwa and bool(self.config.get("enable_ocr_repair", True))
        variants = preprocess_manhwa_image(
            img_bgr,
            enable_advanced=self.config.get("enable_image_preprocessing", True),
            max_variants=max(1, int(self.config.get("ocr_variant_limit", 4)))
        )

        candidates = []

        for var in variants:
            text = self.ocr.extract_text(var, min_conf=min_conf)
            if text and len(text.strip()) >= 2:
                repaired = repair_manhwa_ocr_text(text) if apply_repair else text
                if is_manhwa:
                    repaired = correct_manhwa_ocr_text(repaired)
                words = [w.lower().strip(" '\",.!?") for w in repaired.split()]
                valid_words_count = sum(1 for w in words if w in COMMON_ENGLISH_WORDS or len(w) >= 3 and w.isalpha())
                # Score: heavily reward recognized coherent words and sentence structure
                score = valid_words_count * 25.0 + len(words) * 8.0
                clean_chars = sum(1 for c in repaired if c.isalnum() or c in " '\",.!?")
                score += (clean_chars / max(1, len(repaired))) * 40.0
                candidates.append({
                    "text": repaired.strip(),
                    "score": score,
                    "agreement": ocr_agreement_key(repaired),
                })

        if not candidates:
            return ""

        agreement_counts = {}
        for candidate in candidates:
            agreement_counts[candidate["agreement"]] = agreement_counts.get(candidate["agreement"], 0) + 1

        best = max(
            candidates,
            key=lambda candidate: (
                candidate["score"] + max(0, agreement_counts[candidate["agreement"]] - 1) * 45.0,
                agreement_counts[candidate["agreement"]],
                candidate["score"],
            ),
        )

        return best["text"]

    def run_loop(self):
        self.running = True
        print("[Engine] Auto-Reader Thread Started.")
        last_paced_scroll_time = time.time()
        scroll_subdelta_accum = 0.0
        next_ocr_time = 0.0

        with mss.mss() as sct:
            while self.running:
                if self.paused:
                    time.sleep(0.1)
                    continue

                # 1. Screen Capture & OCR Detection
                now = time.time()
                raw_detected = ""
                if now >= next_ocr_time:
                    frame = self.capture_frame(sct)
                    raw_detected = self.extract_text(frame)
                    next_ocr_time = now + max(0.05, float(self.config.get("ocr_interval_sec", 0.12)))

                # 2. Dialogue Settle & Sentence Completion Filter
                finalized_dialogue = self.stabilizer.update(raw_detected)

                # Motion-deblur pause: if a candidate speech bubble is expanding, pause scroll 35ms for crisp still capture
                if self.stabilizer.candidate_text and self.stabilizer.stable_frames < 2 and not finalized_dialogue:
                    time.sleep(0.035)

                if (
                    self.config.get("enable_omnivoice_prefetch", True)
                    and isinstance(self.tts, (OmniVoiceTTS, CosyVoiceTTS))
                    and self.stabilizer.candidate_text
                    and self.stabilizer.stable_frames >= 2
                    and not finalized_dialogue
                ):
                    candidate = self.stabilizer.candidate_text.strip()
                    if candidate and candidate != self.prefetch_hint_text:
                        speed = float(self.config.get("speech_speed", 1.0))
                        self.tts.prefetch(candidate, speed=speed, log_fn=self.log_fn)
                        self.prefetch_hint_text = candidate

                if finalized_dialogue and not self.buffer.is_duplicate(finalized_dialogue):
                    print(f"\n[OCR Found Complete Dialogue]: '{finalized_dialogue}'")
                    self.buffer.add(finalized_dialogue)

                    if self.on_text_detected:
                        self.on_text_detected(finalized_dialogue)

                    speed = float(self.config.get("speech_speed", 1.0))
                    self._enqueue_tts(finalized_dialogue, speed=speed)
                    self.prefetch_hint_text = ""
                    last_paced_scroll_time = time.time()
                    scroll_subdelta_accum = 0.0
                else:
                    # 3. Continuous Smooth Glide / Paced Auto-Scroll
                    if self.config.get("mode", "manhwa") == "manhwa" and not self.is_speaking:
                        scroll_mode = self.config.get("scroll_mode", "glide")
                        
                        if scroll_mode == "glide":
                            # 60FPS HIGH-PRECISION GLIDE
                            speed_val = float(self.config.get("glide_speed", 3.0))
                            frame_delta = speed_val * 2.2
                            scroll_subdelta_accum += frame_delta
                            
                            if scroll_subdelta_accum >= 1.0:
                                delta_to_send = -int(scroll_subdelta_accum)
                                scroll_subdelta_accum -= abs(delta_to_send)
                                
                                sent = send_native_mouse_wheel(delta_to_send)
                                if not sent:
                                    self.mouse_ctrl.scroll(0, -1)
                                    
                            time.sleep(0.016) # ~60 FPS smooth loop (backed by 1ms timer)
                        else:
                            # PACED STEP SCROLL
                            interval = max(0.3, float(self.config.get("scroll_interval_sec", 1.2)))
                            step_amt = int(self.config.get("scroll_step_amount", 1))
                            if (time.time() - last_paced_scroll_time) >= interval:
                                self.mouse_ctrl.scroll(0, -step_amt)
                                last_paced_scroll_time = time.time()
                            time.sleep(0.05)
                    else:
                        time.sleep(0.1)

        print("[Engine] Auto-Reader Loop Ended.")

# ==========================================
# VISUAL CALIBRATION BOUNDING BOX WINDOW
# ==========================================
class CalibrationOverlay(tk.Toplevel):
    def __init__(self, master, engine):
        super().__init__(master)
        self.engine = engine
        self.title("Read Zone Calibration Frame")
        self.overrideredirect(True)
        self.attributes("-topmost", True)
        self.attributes("-alpha", 0.15)
        self.configure(bg="#22c55e")
        
        self.canvas = tk.Canvas(self, bg="#22c55e", highlightthickness=3, highlightbackground="#16a34a")
        self.canvas.pack(fill="both", expand=True)

        self.update_position()

    def update_position(self):
        with mss.mss() as sct:
            bbox = self.engine.get_read_zone_bbox(sct)
            self.geometry(f"{bbox['width']}x{bbox['height']}+{bbox['left']}+{bbox['top']}")


# ==========================================
# 60FPS CUSTOMTKINTER GUI
# ==========================================
class ManhwaReaderApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("⚡ V-Reader Pro: Manhwa Screen Reader (v2.6)")
        self.geometry("990x760")
        self.minsize(880, 680)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.config = load_config()
        self.overlay_window = None
        self.reader_thread = None
        self.log_textbox = None
        self.pending_logs = []

        # Create UI first so log_textbox and status labels exist
        self.create_ui()

        # Initialize screen reader engine after UI is ready
        self.engine = ScreenReaderEngine(
            self.config,
            on_text_detected=self.on_text_detected,
            log_fn=self.log
        )

        # Flush any pending logs that were buffered
        for plog in self.pending_logs:
            self.log(plog)
        self.pending_logs.clear()

        # Update initial status label
        ocr_name = self.engine.ocr.engine_type if self.engine.ocr else 'Auto'
        self.lbl_status.configure(
            text=f"OCR: {ocr_name}\nTTS: {self.config.get('tts_backend')}\nVoice: {os.path.basename(self.config.get('omnivoice_ref_clip', '')) or 'None'}"
        )
        self.log("🚀 V-Reader Pro initialized & ready.")

    def create_ui(self):
        top_bar = ctk.CTkFrame(self, fg_color="#0f172a", corner_radius=0)
        top_bar.pack(fill="x", padx=0, pady=0)

        header_content = ctk.CTkFrame(top_bar, fg_color="transparent")
        header_content.pack(fill="x", padx=20, pady=12)

        title_lbl = ctk.CTkLabel(
            header_content,
            text="⚡ V-Reader Pro: Screen Reader",
            font=("Helvetica", 18, "bold"),
            text_color="#38bdf8"
        )
        title_lbl.pack(side="left")

        self.btn_master = ctk.CTkButton(
            header_content,
            text="▶ Start Auto-Reader",
            command=self.toggle_reader,
            fg_color="#10b981",
            hover_color="#059669",
            font=("Helvetica", 13, "bold"),
            height=38,
            width=180
        )
        self.btn_master.pack(side="right", padx=6)

        self.btn_calib = ctk.CTkButton(
            header_content,
            text="📐 Show Read Zone",
            command=self.toggle_calibration,
            fg_color="#334155",
            hover_color="#475569",
            font=("Helvetica", 12),
            height=38
        )
        self.btn_calib.pack(side="right", padx=6)

        self.tabs = ctk.CTkTabview(self, fg_color="#1e293b")
        self.tabs.pack(fill="both", expand=True, padx=16, pady=12)

        tab_dash = self.tabs.add("🎮 Live Dashboard")
        tab_stabilizer = self.tabs.add("🛡️ Sentence Stabilizer")
        tab_scroll = self.tabs.add("📜 Smooth Auto-Scroll")
        tab_tts = self.tabs.add("🎙️ Voice & TTS")
        tab_ocr = self.tabs.add("🔍 OCR & Vision")
        tab_zone = self.tabs.add("📐 Read Zone & Screen")

        self.build_dashboard_tab(tab_dash)
        self.build_stabilizer_tab(tab_stabilizer)
        self.build_scroll_tab(tab_scroll)
        self.build_tts_tab(tab_tts)
        self.build_ocr_tab(tab_ocr)
        self.build_zone_tab(tab_zone)

    def build_dashboard_tab(self, parent):
        grid = ctk.CTkFrame(parent, fg_color="transparent")
        grid.pack(fill="both", expand=True, padx=12, pady=12)

        left_panel = ctk.CTkFrame(grid, fg_color="#0f172a", width=340)
        left_panel.pack(side="left", fill="y", padx=8, pady=8)

        ctk.CTkLabel(left_panel, text="Diagnostics & Quick Actions", font=("Helvetica", 13, "bold")).pack(pady=(12, 8), padx=12, anchor="w")

        btn_test_ocr = ctk.CTkButton(
            left_panel, text="🧪 Test OCR on Current Screen",
            command=self.test_screen_ocr, fg_color="#2563eb", hover_color="#1d4ed8"
        )
        btn_test_ocr.pack(fill="x", padx=12, pady=6)

        btn_inspect_voice = ctk.CTkButton(
            left_panel, text="🔍 Inspect OmniVoice Server",
            command=self.inspect_omnivoice, fg_color="#0284c7", hover_color="#0369a1"
        )
        btn_inspect_voice.pack(fill="x", padx=12, pady=6)

        btn_test_tts = ctk.CTkButton(
            left_panel, text="🔊 Test Voice Playback",
            command=self.test_tts_playback, fg_color="#7c3aed", hover_color="#6d28d9"
        )
        btn_test_tts.pack(fill="x", padx=12, pady=6)

        ctk.CTkLabel(left_panel, text="Reader Mode", font=("Helvetica", 12, "bold")).pack(pady=(16, 4), padx=12, anchor="w")
        self.seg_mode = ctk.CTkSegmentedButton(
            left_panel, values=["Manhwa Mode", "Book Mode"],
            command=self.on_mode_change
        )
        self.seg_mode.set("Manhwa Mode" if self.config.get("mode") == "manhwa" else "Book Mode")
        self.seg_mode.pack(fill="x", padx=12, pady=4)

        self.lbl_status = ctk.CTkLabel(
            left_panel,
            text=f"OCR: Initializing...\nTTS: {self.config.get('tts_backend')}\nVoice: {os.path.basename(self.config.get('omnivoice_ref_clip', '')) or 'None'}",
            font=("Helvetica", 11), text_color="#94a3b8", justify="left"
        )
        self.lbl_status.pack(pady=16, padx=12, anchor="w")

        right_panel = ctk.CTkFrame(grid, fg_color="#0f172a")
        right_panel.pack(side="right", fill="both", expand=True, padx=8, pady=8)

        ctk.CTkLabel(right_panel, text="📖 Live Detected Dialogue / Real-Time Logs", font=("Helvetica", 13, "bold")).pack(pady=(12, 6), padx=12, anchor="w")

        self.log_textbox = ctk.CTkTextbox(right_panel, font=("Consolas", 12), text_color="#38bdf8", fg_color="#020617")
        self.log_textbox.pack(fill="both", expand=True, padx=12, pady=(0, 12))

    def build_stabilizer_tab(self, parent):
        scroll = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        ctk.CTkLabel(scroll, text="🛡️ Speech Bubble Settler & Anti-Fragmentation Engine", font=("Helvetica", 14, "bold")).pack(anchor="w", pady=(8, 4))
        ctk.CTkLabel(
            scroll,
            text="Prevents the reader from jumping the gun on half-visible bubbles or single words as they scroll into view.",
            font=("Helvetica", 11), text_color="#94a3b8"
        ).pack(anchor="w", pady=(0, 14))

        # Settle Delay Slider
        ctk.CTkLabel(scroll, text="Bubble Settle Window (Seconds to wait for bubble to finish expanding)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(10, 2))
        self.lbl_settle_val = ctk.CTkLabel(scroll, text=f"{self.config.get('bubble_settle_sec', 0.85)}s", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_settle_val.pack(anchor="w")
        self.sld_settle = ctk.CTkSlider(
            scroll, from_=0.3, to=2.5, number_of_steps=22,
            command=lambda v: self.lbl_settle_val.configure(text=f"{round(v, 2)}s")
        )
        self.sld_settle.set(self.config.get("bubble_settle_sec", 0.85))
        self.sld_settle.pack(fill="x", pady=4)

        # Minimum words filter
        ctk.CTkLabel(scroll, text="Minimum Valid Word Count (Filters out stray OCR fragments like 'DLACN.')", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.lbl_min_words_val = ctk.CTkLabel(scroll, text=f"{self.config.get('min_dialogue_words', 2)} words", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_min_words_val.pack(anchor="w")
        self.sld_min_words = ctk.CTkSlider(
            scroll, from_=1, to=5, number_of_steps=4,
            command=lambda v: self.lbl_min_words_val.configure(text=f"{int(v)} words")
        )
        self.sld_min_words.set(self.config.get("min_dialogue_words", 2))
        self.sld_min_words.pack(fill="x", pady=4)

        # Casing Normalization
        self.chk_casing = ctk.CTkCheckBox(
            scroll, text="Normalize ALL-CAPS screaming to natural spoken sentences (Fixes monotone robotic voice)",
            command=self.save_and_apply
        )
        if self.config.get("normalize_casing", True):
            self.chk_casing.select()
        self.chk_casing.pack(anchor="w", pady=16)

        ctk.CTkButton(scroll, text="💾 Save Stabilization Settings", command=self.save_and_apply, fg_color="#10b981").pack(pady=16, fill="x")

    def build_scroll_tab(self, parent):
        scroll = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        ctk.CTkLabel(scroll, text="Scroll Motion Engine", font=("Helvetica", 13, "bold")).pack(anchor="w", pady=(8, 4))
        self.seg_scroll_mode = ctk.CTkSegmentedButton(
            scroll, values=["Continuous Glide (60FPS Sub-Notch)", "Paced Steps"],
            command=self.save_and_apply
        )
        self.seg_scroll_mode.set("Continuous Glide (60FPS Sub-Notch)" if self.config.get("scroll_mode") == "glide" else "Paced Steps")
        self.seg_scroll_mode.pack(fill="x", pady=4)

        ctk.CTkLabel(scroll, text="Continuous Glide Speed (1.0 = Slow Reading, 3.0 = Standard, 8.0 = Fast)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(14, 2))
        self.lbl_glide_val = ctk.CTkLabel(scroll, text=f"Speed: {self.config.get('glide_speed', 3.0)}x", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_glide_val.pack(anchor="w")
        self.sld_glide = ctk.CTkSlider(
            scroll, from_=0.5, to=10.0, number_of_steps=19,
            command=lambda v: self.lbl_glide_val.configure(text=f"Speed: {round(v, 1)}x")
        )
        self.sld_glide.set(self.config.get("glide_speed", 3.0))
        self.sld_glide.pack(fill="x", pady=4)

        ctk.CTkLabel(scroll, text="Paced Step Interval (Seconds between scrolls - For Step Mode)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(14, 2))
        self.lbl_interval_val = ctk.CTkLabel(scroll, text=f"Interval: {self.config.get('scroll_interval_sec', 1.2)}s", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_interval_val.pack(anchor="w")
        self.sld_interval = ctk.CTkSlider(
            scroll, from_=0.4, to=4.0, number_of_steps=36,
            command=lambda v: self.lbl_interval_val.configure(text=f"Interval: {round(v, 2)}s")
        )
        self.sld_interval.set(self.config.get("scroll_interval_sec", 1.2))
        self.sld_interval.pack(fill="x", pady=4)

        self.chk_pause_on_text = ctk.CTkCheckBox(
            scroll, text="Automatically stop scrolling completely while speech is playing",
            command=self.save_and_apply
        )
        if self.config.get("pause_scroll_on_text", True):
            self.chk_pause_on_text.select()
        self.chk_pause_on_text.pack(anchor="w", pady=16)

        ctk.CTkButton(scroll, text="💾 Save Scroll Settings", command=self.save_and_apply, fg_color="#10b981").pack(pady=16, fill="x")

    def build_tts_tab(self, parent):
        scroll = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        ctk.CTkLabel(scroll, text="Voice Engine Backend", font=("Helvetica", 13, "bold")).pack(anchor="w", pady=(8, 4))
        self.seg_tts = ctk.CTkSegmentedButton(
            scroll, values=["CosyVoice (Local Clone)", "Gemini API (GenAI)", "Edge-TTS (Studio HD)", "Local PyTTSx3"],
            command=self.save_and_apply
        )
        current_tts = self.config.get("tts_backend")
        if current_tts == "cosyvoice":
            self.seg_tts.set("CosyVoice (Local Clone)")
        elif current_tts == "omnivoice":
            self.seg_tts.set("Gemini API (GenAI)")
        elif current_tts == "edgetts":
            self.seg_tts.set("Edge-TTS (Studio HD)")
        else:
            self.seg_tts.set("Local PyTTSx3")
        self.seg_tts.pack(fill="x", pady=4)

        # OmniVoice Section
        ctk.CTkLabel(scroll, text="OmniVoice Gradio Endpoint", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.ent_url = ctk.CTkEntry(scroll, placeholder_text="http://127.0.0.1:8001")
        self.ent_url.insert(0, self.config.get("omnivoice_url", "http://127.0.0.1:8001"))
        self.ent_url.pack(fill="x", pady=4)

        ctk.CTkLabel(scroll, text="Local CosyVoice Gradio Endpoint", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.ent_cosy_url = ctk.CTkEntry(scroll, placeholder_text="http://127.0.0.1:50000")
        self.ent_cosy_url.insert(0, self.config.get("cosyvoice_url", "http://127.0.0.1:50000"))
        self.ent_cosy_url.pack(fill="x", pady=4)

        self.ent_cosy_mode = ctk.CTkOptionMenu(scroll, values=["zero_shot", "instruct"])
        self.ent_cosy_mode.set(self.config.get("cosyvoice_mode", "zero_shot"))
        self.ent_cosy_mode.pack(fill="x", pady=4)

        ctk.CTkLabel(scroll, text="Reference Audio Clip (Target Voice to Clone)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        ref_row = ctk.CTkFrame(scroll, fg_color="transparent")
        ref_row.pack(fill="x", pady=4)
        self.ent_ref = ctk.CTkEntry(ref_row, placeholder_text="audio.wav or full path")
        self.ent_ref.insert(0, self.config.get("omnivoice_ref_clip", "audio.wav"))
        self.ent_ref.pack(side="left", fill="x", expand=True, padx=(0, 8))
        btn_browse = ctk.CTkButton(ref_row, text="Browse...", width=100, command=self.browse_audio_file)
        btn_browse.pack(side="right")

        ctk.CTkLabel(scroll, text="Reference Audio Transcript (Exact Words Spoken in Clip - Highly Recommended!)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.ent_transcript = ctk.CTkEntry(scroll, placeholder_text="Exact words spoken in your audio clip (e.g. She received the symbol...)")
        self.ent_transcript.insert(0, self.config.get("omnivoice_ref_text", ""))
        self.ent_transcript.pack(fill="x", pady=4)

        # Edge-TTS Voice Select
        ctk.CTkLabel(scroll, text="Edge-TTS Studio Voice (If using Studio HD mode)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.ent_edge_voice = ctk.CTkOptionMenu(
            scroll,
            values=[
                "en-US-ChristopherNeural",
                "en-US-GuyNeural",
                "en-US-EricNeural",
                "en-US-JennyNeural",
                "en-US-AriaNeural",
                "en-GB-RyanNeural",
                "ja-JP-NanamiNeural",
                "ko-KR-SunHiNeural"
            ]
        )
        self.ent_edge_voice.set(self.config.get("edge_tts_voice", "en-US-ChristopherNeural"))
        self.ent_edge_voice.pack(fill="x", pady=4)

        # Speed Multiplier
        ctk.CTkLabel(scroll, text="Speech Speed Multiplier", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.lbl_speed_val = ctk.CTkLabel(scroll, text=f"{self.config.get('speech_speed', 1.0)}x", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_speed_val.pack(anchor="w")
        self.sld_speed = ctk.CTkSlider(
            scroll, from_=0.5, to=2.0, number_of_steps=15,
            command=lambda v: self.lbl_speed_val.configure(text=f"{round(v, 2)}x")
        )
        self.sld_speed.set(self.config.get("speech_speed", 1.0))
        self.sld_speed.pack(fill="x", pady=4)

        # OmniVoice Duration Cushion (Prevents diffusion looping / rereading)
        ctk.CTkLabel(scroll, text="OmniVoice Duration Pacing (1.0x = Exact tight timing, prevents looping/rereading)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.lbl_dur_val = ctk.CTkLabel(scroll, text=f"{self.config.get('omnivoice_duration_scale', 1.0)}x", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_dur_val.pack(anchor="w")
        self.sld_dur = ctk.CTkSlider(
            scroll, from_=0.75, to=1.40, number_of_steps=13,
            command=lambda v: self.lbl_dur_val.configure(text=f"{round(v, 2)}x")
        )
        self.sld_dur.set(self.config.get("omnivoice_duration_scale", 1.0))
        self.sld_dur.pack(fill="x", pady=4)

        # Punctuation & Dash cleaner toggle
        self.chk_dash_clean = ctk.CTkCheckBox(
            scroll, text="Sanitize Comic Dashes & Hyphens to Soft Pauses (Stops voice from saying 'dash' or stuttering)",
            command=self.save_and_apply
        )
        if self.config.get("sanitize_tts_punctuation", True):
            self.chk_dash_clean.select()
        self.chk_dash_clean.pack(anchor="w", pady=12)

        ctk.CTkButton(scroll, text="💾 Save Voice Settings", command=self.save_and_apply, fg_color="#10b981").pack(pady=16, fill="x")

    def build_ocr_tab(self, parent):
        scroll = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        ctk.CTkLabel(scroll, text="OCR Engine Configuration", font=("Helvetica", 13, "bold")).pack(anchor="w", pady=(8, 4))
        self.seg_ocr = ctk.CTkSegmentedButton(
            scroll, values=["Auto-Detect", "RapidOCR (ONNX)", "Windows Native OCR", "PaddleOCR"],
            command=self.save_and_apply
        )
        pref = self.config.get("ocr_engine_preference", "auto")
        if pref == "rapidocr": self.seg_ocr.set("RapidOCR (ONNX)")
        elif pref == "winocr": self.seg_ocr.set("Windows Native OCR")
        elif pref == "paddleocr": self.seg_ocr.set("PaddleOCR")
        else: self.seg_ocr.set("Auto-Detect")
        self.seg_ocr.pack(fill="x", pady=4)

        ctk.CTkLabel(scroll, text="OCR Confidence Threshold", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(14, 2))
        self.lbl_conf_val = ctk.CTkLabel(scroll, text=f"{int(self.config.get('ocr_confidence', 0.25) * 100)}%", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_conf_val.pack(anchor="w")
        self.sld_conf = ctk.CTkSlider(
            scroll, from_=0.10, to=0.85, number_of_steps=15,
            command=lambda v: self.lbl_conf_val.configure(text=f"{int(v * 100)}%")
        )
        self.sld_conf.set(self.config.get("ocr_confidence", 0.25))
        self.sld_conf.pack(fill="x", pady=4)

        self.chk_preprocess = ctk.CTkCheckBox(
            scroll, text="Enable Multi-Pass CLAHE & Otsu Binarization (Boosts stylized manhwa font recognition)",
            command=self.save_and_apply
        )
        if self.config.get("enable_image_preprocessing", True):
            self.chk_preprocess.select()
        self.chk_preprocess.pack(anchor="w", pady=14)

        ctk.CTkButton(scroll, text="💾 Save OCR Settings", command=self.save_and_apply, fg_color="#10b981").pack(pady=16, fill="x")

    def build_zone_tab(self, parent):
        scroll = ctk.CTkScrollableFrame(parent, fg_color="transparent")
        scroll.pack(fill="both", expand=True, padx=16, pady=12)

        ctk.CTkLabel(scroll, text="Screen Read Zone Calibration", font=("Helvetica", 13, "bold")).pack(anchor="w", pady=(8, 4))
        ctk.CTkLabel(scroll, text="Adjust the capture box where speech bubbles appear on your display.", font=("Helvetica", 11), text_color="#94a3b8").pack(anchor="w", pady=(0, 12))

        ctk.CTkLabel(scroll, text="Top Offset (% from top of screen)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(8, 2))
        self.lbl_top_val = ctk.CTkLabel(scroll, text=f"{self.config.get('read_zone_top', 20)}%", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_top_val.pack(anchor="w")
        self.sld_top = ctk.CTkSlider(
            scroll, from_=0, to=90, number_of_steps=90,
            command=self.on_zone_slider_change
        )
        self.sld_top.set(self.config.get("read_zone_top", 20))
        self.sld_top.pack(fill="x", pady=4)

        ctk.CTkLabel(scroll, text="Zone Height (% of screen)", font=("Helvetica", 12, "bold")).pack(anchor="w", pady=(12, 2))
        self.lbl_height_val = ctk.CTkLabel(scroll, text=f"{self.config.get('read_zone_height', 55)}%", font=("Helvetica", 11), text_color="#38bdf8")
        self.lbl_height_val.pack(anchor="w")
        self.sld_height = ctk.CTkSlider(
            scroll, from_=10, to=95, number_of_steps=85,
            command=self.on_zone_slider_change
        )
        self.sld_height.set(self.config.get("read_zone_height", 55))
        self.sld_height.pack(fill="x", pady=4)

        ctk.CTkButton(scroll, text="📐 Show / Hide Visual Read Zone Frame", command=self.toggle_calibration, fg_color="#334155").pack(pady=16, fill="x")

    def on_zone_slider_change(self, _=None):
        top_val = int(self.sld_top.get())
        height_val = int(self.sld_height.get())
        self.lbl_top_val.configure(text=f"{top_val}%")
        self.lbl_height_val.configure(text=f"{height_val}%")
        self.config["read_zone_top"] = top_val
        self.config["read_zone_height"] = height_val
        self.engine.update_config(self.config)
        save_config(self.config)
        if self.overlay_window:
            self.overlay_window.update_position()

    def on_mode_change(self, mode_str):
        new_mode = "manhwa" if "Manhwa" in mode_str else "book"
        self.config["mode"] = new_mode
        self.engine.update_config(self.config)
        save_config(self.config)
        self.log(f"🔄 Switched to {mode_str}.")

    def browse_audio_file(self):
        filename = filedialog.askopenfilename(
            title="Select Target Voice Recording (.wav, .mp3)",
            filetypes=[("Audio Files", "*.wav;*.mp3;*.ogg;*.flac;*.m4a"), ("All Files", "*.*")]
        )
        if filename:
            self.ent_ref.delete(0, "end")
            self.ent_ref.insert(0, filename)
            self.save_and_apply()

    def save_and_apply(self, _=None):
        tts_selection = self.seg_tts.get()
        if "CosyVoice" in tts_selection:
            backend = "cosyvoice"
        elif "Gemini" in tts_selection:
            backend = "omnivoice"
        elif "Edge-TTS" in tts_selection:
            backend = "edgetts"
        else:
            backend = "pyttsx3"

        ocr_selection = self.seg_ocr.get()
        if "RapidOCR" in ocr_selection: ocr_pref = "rapidocr"
        elif "Windows" in ocr_selection: ocr_pref = "winocr"
        elif "Paddle" in ocr_selection: ocr_pref = "paddleocr"
        else: ocr_pref = "auto"

        self.config["tts_backend"] = backend
        self.config["omnivoice_url"] = self.ent_url.get().strip()
        self.config["cosyvoice_url"] = self.ent_cosy_url.get().strip()
        self.config["cosyvoice_mode"] = self.ent_cosy_mode.get()
        self.config["omnivoice_ref_clip"] = self.ent_ref.get().strip()
        self.config["omnivoice_ref_text"] = self.ent_transcript.get().strip()
        self.config["edge_tts_voice"] = self.ent_edge_voice.get()
        self.config["ocr_engine_preference"] = ocr_pref
        self.config["ocr_confidence"] = round(float(self.sld_conf.get()), 2)
        self.config["enable_image_preprocessing"] = bool(self.chk_preprocess.get())
        self.config["scroll_mode"] = "glide" if "Glide" in self.seg_scroll_mode.get() else "paced"
        self.config["glide_speed"] = round(float(self.sld_glide.get()), 1)
        self.config["scroll_interval_sec"] = round(float(self.sld_interval.get()), 2)
        self.config["pause_scroll_on_text"] = bool(self.chk_pause_on_text.get())
        self.config["speech_speed"] = round(float(self.sld_speed.get()), 2)
        self.config["omnivoice_duration_scale"] = round(float(self.sld_dur.get()), 2) if hasattr(self, 'sld_dur') else 1.0
        self.config["sanitize_tts_punctuation"] = bool(self.chk_dash_clean.get()) if hasattr(self, 'chk_dash_clean') else True
        self.config["bubble_settle_sec"] = round(float(self.sld_settle.get()), 2)
        self.config["min_dialogue_words"] = int(self.sld_min_words.get())
        self.config["normalize_casing"] = bool(self.chk_casing.get())

        save_config(self.config)
        self.engine.update_config(self.config)

        self.lbl_status.configure(
            text=f"OCR: {self.engine.ocr.engine_type if self.engine.ocr else 'Auto'}\nTTS: {self.config.get('tts_backend')}\nVoice: {os.path.basename(self.config.get('omnivoice_ref_clip', '')) or 'None'}"
        )
        self.log("💾 Settings Saved & Applied!")

    def test_screen_ocr(self):
        self.log("🔍 Capturing Read Zone for OCR test...")
        with mss.mss() as sct:
            frame = self.engine.capture_frame(sct)
            t0 = time.time()
            text = self.engine.extract_text(frame)
            elapsed_ms = round((time.time() - t0) * 1000, 1)

            if text:
                norm = normalize_dialogue_text(text, apply_casing=True)
                self.log(f"✅ OCR SUCCESS ({elapsed_ms}ms)! Detected:\n'{norm}'")
            else:
                self.log(f"ℹ️ OCR Completed ({elapsed_ms}ms) - No speech bubble text found inside the green Read Zone.")

    def inspect_omnivoice(self):
        if isinstance(self.engine.tts, OmniVoiceTTS):
            self.engine.tts.inspect_api(log_fn=self.log)
        else:
            self.log("ℹ️ OmniVoice is not active. Switch Voice Backend to OmniVoice to inspect.")

    def test_tts_playback(self):
        sample_text = "The gate's rank was an unidentifiable black."
        self.log(f"🔊 Testing Voice playback with: '{sample_text}'")
        threading.Thread(
            target=lambda: self.engine.tts.synthesize_and_play_blocking(sample_text, speed=1.0, log_fn=self.log),
            daemon=True
        ).start()

    def toggle_calibration(self):
        if self.overlay_window is None or not self.overlay_window.winfo_exists():
            self.overlay_window = CalibrationOverlay(self, self.engine)
            self.btn_calib.configure(text="📐 Hide Read Zone", fg_color="#10b981")
        else:
            self.overlay_window.destroy()
            self.overlay_window = None
            self.btn_calib.configure(text="📐 Show Read Zone", fg_color="#334155")

    def toggle_reader(self):
        if not self.engine.running:
            self.btn_master.configure(text="⏸ Pause Auto-Reader", fg_color="#f59e0b", hover_color="#d97706")
            self.reader_thread = threading.Thread(target=self.engine.run_loop, daemon=True)
            self.reader_thread.start()
            self.log("▶ Auto-Reader Started.")
        elif self.engine.paused:
            self.engine.paused = False
            self.btn_master.configure(text="⏸ Pause Auto-Reader", fg_color="#f59e0b", hover_color="#d97706")
            self.log("▶ Auto-Reader Resumed.")
        else:
            self.engine.paused = True
            self.btn_master.configure(text="▶ Resume Auto-Reader", fg_color="#10b981", hover_color="#059669")
            self.log("⏸ Auto-Reader Paused.")

    def on_text_detected(self, text):
        self.log(f"🗣️ Reading: '{text}'")

    def log(self, message: str):
        timestamp = time.strftime("[%H:%M:%S]")
        formatted_line = f"{timestamp} {message}\n"
        if hasattr(self, 'log_textbox') and self.log_textbox is not None:
            try:
                self.log_textbox.insert("end", formatted_line)
                self.log_textbox.see("end")
            except Exception:
                print(f"{timestamp} {message}")
        else:
            if hasattr(self, 'pending_logs'):
                self.pending_logs.append(message)
            print(f"{timestamp} {message}")

if __name__ == "__main__":
    app = ManhwaReaderApp()
    app.mainloop()
