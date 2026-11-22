"""Benchmark scenarios loaded through the project's own validated loader."""
from __future__ import annotations
from functools import lru_cache

from connect4.analytics.benchmark import load_scenarios
from .paths import DATASET


@lru_cache(maxsize=1)
def _frame():
    return load_scenarios(DATASET)


def _board(r):
    rows, cols, raw = int(r.board_rows), int(r.board_cols), str(r.board_state_row_major).strip()
    return [[int(raw[i * cols + j]) for j in range(cols)] for i in range(rows)]


def list_scenarios() -> list[dict]:
    out = []
    for _, r in _frame().iterrows():
        out.append({"id": r.scenario_id, "rows": int(r.board_rows), "columns": int(r.board_cols),
                    "phase": r.scenario_phase, "current_player": int(r.current_player),
                    "moves_played": int(r.actual_moves_played),
                    "blocked_cells": int(r.blocked_cells_count), "terminal": bool(r.expected_terminal)})
    return out


def get_scenario(sid: str) -> dict:
    df = _frame()
    hit = df[df.scenario_id == sid]
    if hit.empty:
        raise KeyError(sid)
    r = hit.iloc[0]
    history = [int(x) for x in str(r.move_history_columns_0_indexed).split("|") if x != ""]
    return {"id": r.scenario_id, "rows": int(r.board_rows), "columns": int(r.board_cols),
            "phase": r.scenario_phase, "current_player": int(r.current_player),
            "moves_played": int(r.actual_moves_played), "board": _board(r),
            "move_history": history, "blocked_cells": [], "terminal": bool(r.expected_terminal)}
