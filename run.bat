@echo off
echo ====================================================================
echo Starting V-Reader Pro: Manhwa ^& Book AI Screen Reader...
echo ====================================================================
echo Checking requirements (RapidOCR, ONNX Runtime, WinOCR, OmniVoice)...
pip install -r requirements.txt
echo.
echo Launching Screen Overlay HUD ^& Reader Engine...
python main.py
if errorlevel 1 (
    echo.
    echo ====================================================================
    echo An error occurred while running main.py.
    echo ====================================================================
)
pause
