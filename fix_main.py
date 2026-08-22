import re

with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update DEFAULT_CONFIG
text = re.sub(
    r'    "tts_backend": "omnivoice",.*?"allow_pyttsx3_fallback": False, # Prevent silent robotic fallback\n',
    r'''    "tts_backend": "gemini",         # "gemini", "edgetts", "cosyvoice"
    "cosyvoice_url": "http://127.0.0.1:50000",
    "cosyvoice_ref_clip": "audio.wav",
    "cosyvoice_ref_text": "",
    "cosyvoice_mode": "zero_shot",
    "enable_gemini_prefetch": True,
    "max_tts_queue": 2,
''',
    text,
    flags=re.DOTALL
)

# 2. Update load_config migration
text = text.replace(
    '''            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                merged = DEFAULT_CONFIG.copy()
                merged.update(cfg)
                return merged''',
    '''            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if cfg.get("tts_backend") == "omnivoice":
                    cfg["tts_backend"] = "gemini"
                if "omnivoice_ref_clip" in cfg and "cosyvoice_ref_clip" not in cfg:
                    cfg["cosyvoice_ref_clip"] = cfg["omnivoice_ref_clip"]
                if "omnivoice_ref_text" in cfg and "cosyvoice_ref_text" not in cfg:
                    cfg["cosyvoice_ref_text"] = cfg["omnivoice_ref_text"]
                merged = DEFAULT_CONFIG.copy()
                merged.update(cfg)
                return merged'''
)

# 3. Remove OmniVoiceTTS class
text = re.sub(r'class OmniVoiceTTS\(BaseTTS\):.*?class CosyVoiceTTS\(BaseTTS\):', 'class CosyVoiceTTS(BaseTTS):', text, flags=re.DOTALL)

# 4. Remove LocalPyttsx3TTS class
text = re.sub(r'class LocalPyttsx3TTS\(BaseTTS\):.*?class GeminiTTSBackend\(BaseTTS\):', 'class GeminiTTSBackend(BaseTTS):', text, flags=re.DOTALL)

# 5. Fix init_tts
text = re.sub(
    r'        backend = self\.config\.get\("tts_backend", "omnivoice"\)\n        if backend == "omnivoice":\n            self\.tts = GeminiTTSBackend\(voice_name="Aoede"\)',
    r'        backend = self.config.get("tts_backend", "gemini")\n        if backend == "gemini":\n            self.tts = GeminiTTSBackend(voice_name="Aoede")',
    text
)

text = re.sub(
    r'                ref_clip=self\.config\.get\("omnivoice_ref_clip", "audio\.wav"\),\n                ref_text=self\.config\.get\("omnivoice_ref_text", ""\),',
    r'                ref_clip=self.config.get("cosyvoice_ref_clip", "audio.wav"),\n                ref_text=self.config.get("cosyvoice_ref_text", ""),',
    text
)

text = re.sub(
    r'        elif backend == "edgetts":\n            self\.tts = EdgeTTSBackend\(\n                voice_name=self\.config\.get\("edge_tts_voice", "en-US-ChristopherNeural"\)\n            \)\n        else:\n            self\.tts = LocalPyttsx3TTS\(\)',
    r'        elif backend == "edgetts":\n            self.tts = EdgeTTSBackend(\n                voice_name=self.config.get("edge_tts_voice", "en-US-ChristopherNeural")\n            )\n        else:\n            self.tts = GeminiTTSBackend(voice_name="Aoede")',
    text
)

# 6. Fix enable_omnivoice_prefetch check
text = text.replace('"enable_omnivoice_prefetch"', '"enable_gemini_prefetch"')

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

