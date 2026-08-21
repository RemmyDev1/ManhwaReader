# ManhwaReader (Gemini TTS Edition)

This is the original Python desktop application for the Manhwa/Book Screen Reader. 
The TTS engine has been upgraded to support the Gemini API.

## Setup

1. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

2. Set your Gemini API key in your environment variables:
   * **Windows Command Prompt:** `set GEMINI_API_KEY=your_key_here`
   * **Windows PowerShell:** `$env:GEMINI_API_KEY="your_key_here"`
   * **Mac/Linux:** `export GEMINI_API_KEY="your_key_here"`

3. Run the app:
   ```bash
   python main.py
   ```
   (Or run `run.bat` on Windows)

## Usage
1. Open the settings panel and select **"Gemini API (GenAI)"** as your Voice Engine Backend.
2. Position the transparent green read zone over your manga/comic speech bubbles.
3. The app will automatically OCR the text, deduplicate it, and stream it to the Gemini TTS engine for high-quality playback.
