# Connect 4 AI & Data Science — Website

A website built around your existing Python project. **No React, no Vite, no Node.js**: the front end is plain HTML, CSS and JavaScript in `web/`, served by FastAPI together with the REST API. You only need Python 3.10+.

## Run it

**Windows:** double-click `run.bat` (or run it in a terminal).
**macOS / Linux:** `./run.sh`

Then open **http://127.0.0.1:8000**.

Manual way:

```bash
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload
```

Interactive API docs: http://127.0.0.1:8000/docs

## Pages

| Page | What it does |
|---|---|
| Home | Hero board replaying a real AI-vs-AI game from the engine, features, stack, live benchmark stats |
| Play Game | Two-player game: 3 board sizes, blocked cells, Pop Out, Remove Opponent, Heavy Piece, undo, restart, scores, move history |
| Play Against AI | Human vs AI and AI vs AI. Pick Minimax or Alpha-Beta and depth 1–5. Shows chosen column, time, nodes, pruned branches, and a measured side-by-side comparison with the other algorithm |
| AI Analytics | Interactive search tree (expand/collapse, chosen line, pruned nodes), decision table, explored-vs-pruned charts, depth 1–5 comparison |
| Data Science Dashboard | Overview KPIs (animated), Performance (6 charts + extras), Data analysis (dataset, cleaning, statistics, comparison), Insights, Scenario explorer. Filters: data source, phase, scenarios, algorithm, chart type. "Run new benchmark" executes your real benchmark |
| About Project | Architecture and endpoint list |

## Project layout

```
connect4/        your engine + AI + analytics (unchanged; one pandas-3 fix, see below)
backend/         FastAPI: main.py, api/, services/, schemas/, tests/
web/             index.html, css/, js/ (ES modules, no build)
benchmark_results.csv, connect4_ai_benchmark_dataset.csv, analysis_output/   your data (not moved)
data/runs/       new benchmark runs started from the dashboard
```

## Where the numbers come from

* All game rules and AI search run in Python (`connect4/`). The browser never decides legality.
* Dashboard figures are computed by pandas/NumPy in `backend/services/analytics.py` from `benchmark_results.csv` (or a run you start). Cleaning rules match `connect4/analytics/analyze.py`.
* The search tree in AI Analytics mirrors `connect4/ai/search.py` step for step; tests assert node counts, pruned counts, move and score are identical to the real search.
* Nothing is hard-coded or random. Timings depend on your machine; node counts are deterministic.

## Limits (by design, so nothing is faked)

* The search models standard drops only, so **Pop Out and power-ups are disabled in AI games**. They work fully in Play Game.
* The benchmark dataset has no blocked cells or power-up moves, so the dashboard makes no claims about them.
* Search trees are limited to depth 3 for readability; depth comparison and AI play go to depth 5 (Minimax at depth 5 can take several seconds on the large board).

## Tests

```bash
python -m unittest discover -s connect4/tests -v     # your 26 original tests
python -m pytest backend/tests -q                    # 9 API / data-science tests
```

## Change to your existing code

`connect4/analytics/benchmark.py`, `load_scenarios`: the CSV is now read with `dtype={"board_state_row_major": str}`. With pandas 3 the 30-digit board strings lost their leading zeros and your own test `test_dataset_and_real_benchmark` failed. This is the only edit to existing files.
