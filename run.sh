#!/usr/bin/env bash
# Connect 4 AI & Data Science: one-command start (macOS / Linux)
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install -q -r requirements.txt
echo; echo "Open http://127.0.0.1:8000 in your browser. Press Ctrl+C to stop."
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
