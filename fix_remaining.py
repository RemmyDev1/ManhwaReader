import re

with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Fix hasattr
text = text.replace('isinstance(self.tts, (OmniVoiceTTS, CosyVoiceTTS))', 'hasattr(self.tts, "prefetch")')

# 2. Remove inspect voice button
text = re.sub(
    r'        btn_inspect_voice = ctk\.CTkButton\(\n            left_panel, text="🔍 Inspect OmniVoice Server",\n            command=self\.inspect_omnivoice, fg_color="#0284c7", hover_color="#0369a1"\n        \)\n        btn_inspect_voice\.pack\(fill="x", padx=12, pady=6\)\n',
    '',
    text
)

# 3. Fix save_and_apply
old_save_tts = '''        tts_selection = self.seg_tts.get()
        if "CosyVoice" in tts_selection:
            backend = "cosyvoice"
        elif "Gemini" in tts_selection:
            backend = "omnivoice"
        elif "Edge-TTS" in tts_selection:
            backend = "edgetts"
        else:
            backend = "pyttsx3"'''

new_save_tts = '''        tts_selection = self.seg_tts.get()
        if "CosyVoice" in tts_selection:
            backend = "cosyvoice"
        elif "Edge-TTS" in tts_selection:
            backend = "edgetts"
        else:
            backend = "gemini"'''
text = text.replace(old_save_tts, new_save_tts)

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

