import re

with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update seg_tts values and parsing
old_seg_tts = '''        self.seg_tts = ctk.CTkSegmentedButton(
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
        self.seg_tts.pack(fill="x", pady=4)'''

new_seg_tts = '''        self.seg_tts = ctk.CTkSegmentedButton(
            scroll, values=["Gemini API (GenAI)", "Edge-TTS (Studio HD)", "CosyVoice (Local Clone)"],
            command=self.save_and_apply
        )
        current_tts = self.config.get("tts_backend")
        if current_tts == "cosyvoice":
            self.seg_tts.set("CosyVoice (Local Clone)")
        elif current_tts == "edgetts":
            self.seg_tts.set("Edge-TTS (Studio HD)")
        else:
            self.seg_tts.set("Gemini API (GenAI)")
        self.seg_tts.pack(fill="x", pady=4)'''

text = text.replace(old_seg_tts, new_seg_tts)


# 2. Remove OmniVoice GUI Fields in build_tts_tab
# Find where the OmniVoice section starts and remove it
text = re.sub(
    r'        # OmniVoice Section\n        ctk\.CTkLabel\(scroll, text="OmniVoice Gradio Endpoint".*?self\.ent_url\.pack\(fill="x", pady=4\)\n',
    '',
    text,
    flags=re.DOTALL
)

# Replace 'omnivoice_ref_clip' with 'cosyvoice_ref_clip' and 'omnivoice_ref_text' with 'cosyvoice_ref_text' in the UI
text = text.replace('self.config.get("omnivoice_ref_clip", "audio.wav")', 'self.config.get("cosyvoice_ref_clip", "audio.wav")')
text = text.replace('self.config.get("omnivoice_ref_text", "")', 'self.config.get("cosyvoice_ref_text", "")')

# Remove OmniVoice Duration Cushion entirely
text = re.sub(
    r'        # OmniVoice Duration Cushion.*?self\.sld_dur\.pack\(fill="x", pady=4\)\n',
    '',
    text,
    flags=re.DOTALL
)

# 3. Fix save_and_apply
old_save_tts = '''        tts_sel = self.seg_tts.get()
        if "CosyVoice" in tts_sel:
            backend = "cosyvoice"
        elif "Gemini" in tts_sel:
            backend = "omnivoice"
        elif "Edge-TTS" in tts_sel:
            backend = "edgetts"
        else:
            backend = "pyttsx3"
        self.config["tts_backend"] = backend'''

new_save_tts = '''        tts_sel = self.seg_tts.get()
        if "CosyVoice" in tts_sel:
            backend = "cosyvoice"
        elif "Edge-TTS" in tts_sel:
            backend = "edgetts"
        else:
            backend = "gemini"
        self.config["tts_backend"] = backend'''
text = text.replace(old_save_tts, new_save_tts)

# Remove url and dur savings
text = re.sub(r'        self\.config\["omnivoice_url"\] = self\.ent_url\.get\(\)\.strip\(\)\n', '', text)
text = re.sub(r'        self\.config\["omnivoice_duration_scale"\] = round\(float\(self\.sld_dur\.get\(\)\), 2\) if hasattr\(self, \'sld_dur\'\) else 1\.0\n', '', text)

text = text.replace('self.config["omnivoice_ref_clip"] = self.ent_ref.get().strip()', 'self.config["cosyvoice_ref_clip"] = self.ent_ref.get().strip()')
text = text.replace('self.config["omnivoice_ref_text"] = self.ent_transcript.get().strip()', 'self.config["cosyvoice_ref_text"] = self.ent_transcript.get().strip()')


# 4. Remove inspect_omnivoice
text = re.sub(r'    def inspect_omnivoice\(self\):.*?            self\.log\("ℹ️ OmniVoice is not active\. Switch Voice Backend to OmniVoice to inspect\."\)\n\n', '', text, flags=re.DOTALL)


# 5. Fix references to omnivoice_ref_clip in status text updates
text = text.replace("self.config.get('omnivoice_ref_clip', '')", "self.config.get('cosyvoice_ref_clip', '')")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)
