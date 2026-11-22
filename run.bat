@echo off
REM Connect 4 AI & Data Science: one-click start (Windows)
cd /d "%~dp0"
if not exist .venv (
  echo Creating virtual environment...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
echo.
echo Open http://127.0.0.1:8000 in your browser. Press Ctrl+C to stop.
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
