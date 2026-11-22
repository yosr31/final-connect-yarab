# Connect 4 — Part 1 (Python 3)

This package contains the complete game engine and advanced rules. AI search (Minimax/Alpha-Beta) and the Tkinter presentation layer are intentionally not included in Part 1.

## Structure

- `config.py` — player constants, supported presets, and immutable `GameConfig` (`GameConfig.preset("small" | "classic" | "large")`).
- `board.py` — board storage, blocked cells, segmented gravity, legal drops, Pop Out board operations, and win detection.
- `powerups.py` — per-player power-up availability and validated power-up operations.
- `game.py` — turn control, terminal-state calculation, score tracking, action history, snapshots, undo, restart, and state export.
- `main.py` — engine smoke demo.
- `tests/test_game.py` — unit tests.

## Blocked-cell gravity rule

A blocked cell splits its column into independent vertical segments. Pieces fall only within their own segment and never cross a blocker. A normal drop uses the lowest available cell in the lowest segment with space; when that segment is full, an upper segment can still accept a piece. Removing a piece compacts only the segment containing that piece.

## Run

From the directory containing the `connect4` folder:

```bash
python -m connect4.main
python -m unittest discover -s connect4/tests -v
```

Each player has one shared power-up charge: they may choose either Remove Opponent Piece or Heavy Piece, but cannot use both in the same round. Undo restores the charge.

The project uses only the Python standard library. Tkinter UI integration is deferred to the next implementation stage.

## Part 2: AI benchmarking and Data Science

The project now includes instrumented, depth-limited Minimax and Alpha-Beta in
`connect4/ai/search.py`. Both algorithms share the same move ordering and
heuristic. The paired benchmark checks their selected move and score agree
before writing measurements. Search time and node counts are measured during
real executions; no synthetic performance values are inserted.

### Run a benchmark

From the directory containing the `connect4` package:

```bash
python -m connect4.analytics.benchmark connect4_ai_benchmark_dataset(1).csv --depth 4 --output benchmark_results.csv
python -m connect4.analytics.analyze benchmark_results.csv --output-dir analysis_output
python -m unittest discover -s connect4/tests -v
```

`connect4/analytics/gui_panel.py` provides an embeddable Tkinter `BenchmarkPanel`.
It runs experiments on a worker thread and schedules UI updates on Tk's event
loop. Embed it in an existing Tk root with `BenchmarkPanel(root).pack(fill="both", expand=True)`.

**Dataset scope:** the supplied 30 scenarios have no blocked cells and use
standard drop moves. Pop Out and power-up actions are not encoded in this CSV,
so this benchmark does not claim to evaluate those mechanics. Timing is machine-
and load-dependent; node counts are the more reproducible algorithmic measure.
