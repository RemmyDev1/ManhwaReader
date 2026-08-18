"""
===================================================================
Standalone Diagnostic & Direct Voice Clone Test Script (v2.6)
===================================================================
Run this directly to test voice synthesis without starting the full app:
    python test_clone.py
===================================================================
"""
import os
import sys
import time
import requests
import json
import base64
import tempfile
import re
import numpy as np

SERVER_URL = "http://127.0.0.1:8001"
# The exact manhwa dialogue text
TEST_TEXT = "But the requests were denied due to the fact that the difficulty of the gate was unknown."

# Find any .wav in current directory if audio.wav is missing
ref_clip = "audio.wav"
if not os.path.exists(ref_clip):
    for f in os.listdir("."):
        if f.endswith(".wav"):
            ref_clip = f
            break

def clean_tts_text(text: str) -> str:
    t = text
    t = re.sub(r'(\b[a-zA-Z]{2,})\s*-\s*([a-zA-Z]{2,}\b)', r'\1\2', t)
    t = re.sub(r'(\s*[-—–]+\s*)+', ', ', t)
    t = re.sub(r'(\.\.\.+|\…+)', ', ', t)
    t = re.sub(r'[~^#@*_\[\]{}\\\/<>\$|•►★☆♪♫="`]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def estimate_speech_duration(text: str, speed: float = 1.0, duration_scale: float = 1.0) -> float:
    """Calculates tight, exact speech duration for diffusion TTS models (OmniVoice)."""
    words = text.split()
    if not words:
        return 1.8
    syllables = 0
    for w in words:
        w_clean = re.sub(r'[^a-zA-Z]', '', w).lower()
        s_count = len(re.findall(r'[aeiouy]+', w_clean))
        syllables += max(1, s_count)
    
    # Tight baseline calculation prevents loop repetition
    base_dur = (syllables * 0.22) + (len(words) * 0.06) + 0.35
    final_dur = max(1.2, round((base_dur * duration_scale) / max(0.2, speed), 2))
    return final_dur

CLEAN_TEXT = clean_tts_text(TEST_TEXT)
exact_duration = estimate_speech_duration(CLEAN_TEXT, speed=1.0, duration_scale=1.0)

print(f"=======================================================")
print(f"🎯 OmniVoice Diagnostic & Natural Voice Clone Tester v2.6")
print(f"=======================================================")
print(f"🌐 Target Server: {SERVER_URL}")
print(f"📁 Reference Audio Clip: {ref_clip} ({'EXISTS ✅' if os.path.exists(ref_clip) else 'MISSING ❌'})")
print(f"📝 Test Sentence: \"{TEST_TEXT}\"")
print(f"⏱️ Calculated Natural Duration: {exact_duration}s (Full Syllable Breathing Cushion)")

def play_audio(filepath):
    if sys.platform.startswith("win"):
        try:
            import winsound
            print(f"🔊 Playing audio via Windows Winsound...")
            winsound.PlaySound(filepath, winsound.SND_FILENAME)
            return True
        except Exception as e:
            print(f"Winsound note: {e}")
    try:
        import subprocess
        if sys.platform.startswith("win"):
            subprocess.run(["powershell", "-c", f"(New-Object Media.SoundPlayer '{filepath}').PlaySync()"])
        else:
            subprocess.run(["aplay", filepath])
        return True
    except Exception as se:
        print(f"Play error: {se}")
    return False

# 1. Try OmniVoice Voice Cloning
try:
    from gradio_client import Client, handle_file
    print(f"\n🔌 Connecting to Gradio Client at {SERVER_URL}...")
    client = Client(SERVER_URL)
    print("✅ Connected to Gradio successfully!")

    print(f"🚀 Calling '/_clone_fn' with {exact_duration}s duration headroom (prevents rushing & truncation)...")
    audio_arg = handle_file(ref_clip) if os.path.exists(ref_clip) else None
    
    result = client.predict(
        text=TEST_TEXT,
        lang="English",
        ref_aud=audio_arg,
        ref_text="",
        instruct="",
        ns=32.0,                  # Sampling steps
        gs=2.2,                   # Guidance scale
        dn=True,                  # Denoise
        sp=1.0,                   # Speed
        du=float(exact_duration), # Natural headroom duration prevents rushing & truncation
        pp=True,                  # Post-processing
        po=True,                  # Post-optimization
        api_name="/_clone_fn"
    )
    print(f"📦 Raw Result Returned: {result}")

    # Process and play
    output_audio = result[0] if isinstance(result, (list, tuple)) else result
    if isinstance(output_audio, str) and os.path.exists(output_audio):
        print(f"✅ Audio file generated at: {output_audio}")
        play_audio(output_audio)
    elif isinstance(output_audio, tuple) and len(output_audio) == 2 and isinstance(output_audio[1], np.ndarray):
        sr, arr = output_audio
        import scipy.io.wavfile as wavfile
        temp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        temp.close()
        if np.issubdtype(arr.dtype, np.floating):
            arr = (arr / np.max(np.abs(arr)) * 32767).astype(np.int16)
        wavfile.write(temp.name, int(sr), arr)
        print(f"✅ Saved numpy audio array to: {temp.name}")
        play_audio(temp.name)

except Exception as e:
    print(f"\n❌ OmniVoice Server error: {e}")
    print("\n💡 Testing Instant Microsoft Edge-TTS Neural HD as Studio Alternative...")
    try:
        import edge_tts
        import asyncio
        temp_mp3 = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        temp_mp3.close()
        
        async def _run():
            com = edge_tts.Communicate(TEST_TEXT, "en-US-ChristopherNeural")
            await com.save(temp_mp3.name)
            
        asyncio.run(_run())
        print(f"✅ Edge-TTS synthesized crystal-clear human studio speech!")
        play_audio(temp_mp3.name)
    except Exception as ee:
        print(f"Edge-TTS note: {ee}")
        print("Tip: Run 'pip install edge-tts' for instant studio-quality voices.")

