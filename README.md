# ManhwaReader (Gemini TTS Edition)

This is the original Python desktop application for the Manhwa/Book Screen Reader. 
The TTS engine has been upgraded to support the Gemini API.

## Setup

1. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

2. Set your Gemini API key securely:
   * Create a new file named `.env` in the same folder as `main.py`
   * Open it in a text editor and add: `GEMINI_API_KEY=your_key_here`
   * *(Note: The `.env` file is ignored by git, keeping your key safe!)*

3. Run the app:
   ```bash
   python main.py
   ```
   (Or double-click `run.bat` on Windows)

## Usage
1. Open the settings panel and select **"Gemini API (GenAI)"** as your Voice Engine Backend.
2. Position the transparent green read zone over your manga/comic speech bubbles.
3. The app will automatically OCR the text, deduplicate it, and stream it to the Gemini TTS engine for high-quality playback.

# ALL RIGHTS RESERVED - CUSTOM PROPRIETARY LICENSE

Copyright (c) [Year] [Your Name]. All Rights Reserved.

This software and its source code are provided for private, personal use only. By accessing this repository, you agree to the following terms:

1. **No Commercial Use:** You may not use, modify, distribute, or integrate this code for any commercial purpose, monetary gain, or business operation.
2. **No Content Creation:** You may not create derivative software, modifications, or public content based on this software. This explicitly prohibits the creation, publication, or monetization of videos, reviews, tutorials, or public commentary utilizing footage or code from this application. 
3. **Private Use Only:** You may run this software privately for your own personal use. Public redistribution is strictly prohibited.
4. **Educational Exception:** The only exception to the above terms is for formal educational purposes. A teacher, instructor, or educator may use, run, or display this application to students in a non-profit classroom or academic setting. 

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
