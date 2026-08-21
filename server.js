const express = require('express');
const app = express();
const port = 3000;

app.get('*', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Python Desktop App</title>
      <style>
        body { 
          font-family: system-ui, -apple-system, sans-serif; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          height: 100vh; 
          margin: 0; 
          background-color: #0f172a; 
          color: #f8fafc; 
          text-align: center; 
        }
        .container { 
          max-width: 600px; 
          padding: 2.5rem; 
          border-radius: 16px; 
          background: #1e293b; 
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); 
          border: 1px solid #334155;
        }
        h1 { color: #38bdf8; margin-top: 0; }
        p { line-height: 1.6; color: #cbd5e1; margin-bottom: 1.5rem; }
        .instructions {
          background: #0f172a;
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid #334155;
          text-align: left;
          font-family: monospace;
          color: #10b981;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Python Desktop Application</h1>
        <p>This workspace contains a Python desktop application (<code>main.py</code>).</p>
        <p>Because it requires screen-recording permissions (for OCR) and native audio playback hardware, it cannot run inside this cloud browser preview.</p>
        <p><strong>To use this application:</strong></p>
        <div class="instructions">
          1. Click the "Export" or "Download" button in the AI Studio editor<br><br>
          2. Install dependencies locally: pip install -r requirements.txt<br><br>
          3. Set your Gemini API key in your terminal<br><br>
          4. Run the app: python main.py
        </div>
      </div>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Placeholder server listening on port ${port}`);
});
