"""Data-science layer: loads measured benchmark CSVs with pandas/NumPy and derives
every KPI, chart series, statistic and insight shown in the dashboard.

Nothing here is hard-coded: every number is computed from the selected CSV.
The cleaning rules are the same ones used by ``connect4.analytics.analyze``.
"""
from __future__ import annotations
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import pandas as pd

from .paths import DATASET, RUNS_DIR, SHIPPED_RESULTS

REQUIRED = ["scenario_id", "minimax_execution_ms", "minimax_nodes_visited",
            "alphabeta_execution_ms", "alphabeta_nodes_visited", "alphabeta_pruned_branches"]
NUMERIC = REQUIRED[1:]
PHASE_ORDER = ["early", "mid", "late"]


# ----------------------------------------------------------------- sources
def list_sources() -> list[dict]:
    items = []
    if SHIPPED_RESULTS.exists():
        df = pd.read_csv(SHIPPED_RESULTS, usecols=lambda c: c in ("scenario_id", "depth"))
        items.append({"id": "shipped", "label": "Shipped benchmark", "rows": int(len(df)),
                      "depth": int(df.depth.iloc[0]) if "depth" in df and len(df) else None,
                      "kind": "shipped", "created": None})
    for p in sorted(RUNS_DIR.glob("run_*.csv"), reverse=True):
        df = pd.read_csv(p, usecols=lambda c: c in ("scenario_id", "depth"))
        created = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()
        depth = int(df.depth.iloc[0]) if "depth" in df and len(df) else None
        items.append({"id": p.stem, "label": f"Run · depth {depth} · {len(df)} scenarios",
                      "rows": int(len(df)), "depth": depth, "kind": "run", "created": created})
    return items


def _path(source: str):
    if source in (None, "", "shipped"):
        return SHIPPED_RESULTS
    p = RUNS_DIR / f"{source}.csv"
    if not p.resolve().parent == RUNS_DIR.resolve() or not p.exists():
        raise KeyError(source)
    return p


@lru_cache(maxsize=16)
def _load(path_str: str, mtime: float):
    raw = pd.read_csv(path_str)
    missing = set(REQUIRED) - set(raw.columns)
    if missing:
        raise ValueError(f"Results file missing columns: {sorted(missing)}")
    df = raw.copy()
    report = {"rows_loaded": int(len(raw)), "dropped": []}
    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.replace([np.inf, -np.inf], np.nan)
    before = len(df)
    df = df.dropna(subset=NUMERIC)
    report["dropped"].append({"rule": "Missing, non-numeric or infinite measurements",
                              "rows": int(before - len(df))})
    before = len(df)
    df = df[(df.minimax_execution_ms >= 0) & (df.alphabeta_execution_ms >= 0)]
    report["dropped"].append({"rule": "Negative execution times", "rows": int(before - len(df))})
    before = len(df)
    df = df[(df.minimax_nodes_visited > 0) & (df.alphabeta_nodes_visited > 0)]
    report["dropped"].append({"rule": "Non-positive node counts", "rows": int(before - len(df))})
    df = df.copy()
    if "scenario_phase" not in df:
        df["scenario_phase"] = "unknown"
    df["nodes_reduced_pct"] = (1 - df.alphabeta_nodes_visited / df.minimax_nodes_visited) * 100
    df["time_speedup_ratio"] = df.minimax_execution_ms / df.alphabeta_execution_ms.replace(0, np.nan)
    report["rows_clean"] = int(len(df))
    report["duplicates"] = int(raw.scenario_id.duplicated().sum())
    report["columns_in_file"] = list(raw.columns)
    return df.reset_index(drop=True), report


def load(source: str | None = "shipped"):
    p = _path(source)
    return _load(str(p), p.stat().st_mtime)


def filtered(source, phases=None, scenarios=None):
    df, _ = load(source)
    if phases:
        df = df[df.scenario_phase.isin(phases)]
    if scenarios:
        df = df[df.scenario_id.isin(scenarios)]
    return df.reset_index(drop=True)


def _f(x, nd=4):
    if x is None or (isinstance(x, float) and (np.isnan(x) or np.isinf(x))):
        return None
    return round(float(x), nd)


# --------------------------------------------------------------------- KPIs
def kpis(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"empty": True}
    return {
        "empty": False,
        "scenarios": int(len(df)),
        "mean_minimax_ms": _f(df.minimax_execution_ms.mean()),
        "mean_alphabeta_ms": _f(df.alphabeta_execution_ms.mean()),
        "mean_minimax_nodes": _f(df.minimax_nodes_visited.mean(), 2),
        "mean_alphabeta_nodes": _f(df.alphabeta_nodes_visited.mean(), 2),
        "mean_nodes_reduced_pct": _f(df.nodes_reduced_pct.mean()),
        "mean_speedup_ratio": _f(df.time_speedup_ratio.mean()),
        "aggregate_speedup_ratio": _f(df.minimax_execution_ms.sum() / df.alphabeta_execution_ms.sum()),
        "total_pruned_branches": int(df.alphabeta_pruned_branches.sum()),
    }


# ------------------------------------------------------------------- charts
def _stats(s: pd.Series) -> dict:
    return {"mean": _f(s.mean()), "median": _f(s.median()), "min": _f(s.min()),
            "max": _f(s.max()), "std": _f(s.std(ddof=1)) if len(s) > 1 else None}


def charts(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"empty": True}
    scen = [{
        "scenario_id": r.scenario_id, "phase": r.scenario_phase,
        "minimax_ms": _f(r.minimax_execution_ms), "alphabeta_ms": _f(r.alphabeta_execution_ms),
        "minimax_nodes": int(r.minimax_nodes_visited), "alphabeta_nodes": int(r.alphabeta_nodes_visited),
        "pruned": int(r.alphabeta_pruned_branches), "reduction_pct": _f(r.nodes_reduced_pct),
        "speedup": _f(r.time_speedup_ratio),
    } for r in df.itertuples()]
    phases = []
    order = [p for p in PHASE_ORDER if p in set(df.scenario_phase)] + \
            sorted(set(df.scenario_phase) - set(PHASE_ORDER))
    for p in order:
        g = df[df.scenario_phase == p]
        phases.append({"phase": p, "scenarios": int(len(g)),
                       "minimax_nodes": _f(g.minimax_nodes_visited.mean(), 2),
                       "alphabeta_nodes": _f(g.alphabeta_nodes_visited.mean(), 2),
                       "minimax_ms": _f(g.minimax_execution_ms.mean()),
                       "alphabeta_ms": _f(g.alphabeta_execution_ms.mean()),
                       "reduction_pct": _f(g.nodes_reduced_pct.mean()),
                       "pruned": _f(g.alphabeta_pruned_branches.mean(), 2),
                       "speedup": _f(g.time_speedup_ratio.mean())})
    bins = min(10, max(3, len(df) // 3))
    counts, edges = np.histogram(df.nodes_reduced_pct, bins=bins)
    hist = [{"label": f"{edges[i]:.0f}–{edges[i+1]:.0f}%", "count": int(counts[i])} for i in range(len(counts))]
    return {"empty": False, "scenarios": scen, "phases": phases, "reduction_histogram": hist,
            "time_stats": {"minimax": _stats(df.minimax_execution_ms), "alphabeta": _stats(df.alphabeta_execution_ms)},
            "node_stats": {"minimax": _stats(df.minimax_nodes_visited), "alphabeta": _stats(df.alphabeta_nodes_visited)}}


# ----------------------------------------------------------------- overview
def overview(source: str, df_filtered: pd.DataFrame) -> dict:
    _, report = load(source)
    ds = pd.read_csv(DATASET, dtype={"board_state_row_major": str})
    miss = ds.isna().mean().mul(100).round(1)
    dataset = {
        "file": DATASET.name, "rows": int(len(ds)), "columns": int(ds.shape[1]),
        "phases": {k: int(v) for k, v in ds.scenario_phase.value_counts().items()},
        "board_sizes": {f"{int(r)}×{int(c)}": int(n) for (r, c), n in
                        ds.groupby(["board_rows", "board_cols"]).size().items()},
        "blocked_cells": {str(int(k)): int(v) for k, v in ds.blocked_cells_count.value_counts().items()},
        "moves_played": {"min": int(ds.actual_moves_played.min()), "mean": _f(ds.actual_moves_played.mean(), 2),
                         "max": int(ds.actual_moves_played.max())},
        "terminal_positions": int(ds.expected_terminal.sum()),
        "missing": [{"column": c, "missing_pct": float(miss[c])} for c in ds.columns if miss[c] > 0],
    }
    metrics = {"minimax_execution_ms": "Minimax time (ms)", "alphabeta_execution_ms": "Alpha-Beta time (ms)",
               "minimax_nodes_visited": "Minimax nodes", "alphabeta_nodes_visited": "Alpha-Beta nodes",
               "alphabeta_pruned_branches": "Alpha-Beta pruned branches",
               "nodes_reduced_pct": "Node reduction (%)", "time_speedup_ratio": "Speedup (×)"}
    table = []
    for col, label in metrics.items():
        s = df_filtered[col].dropna()
        if len(s):
            table.append({"metric": label, **_stats(s)})
    comparison = []
    if len(df_filtered):
        d = df_filtered
        def row(label, a, b, lower_better=True):
            win = "alphabeta" if (a > b) == lower_better else "minimax"
            if a == b: win = "tie"
            comparison.append({"metric": label, "minimax": _f(a, 3), "alphabeta": _f(b, 3), "better": win})
        row("Mean time (ms)", d.minimax_execution_ms.mean(), d.alphabeta_execution_ms.mean())
        row("Median time (ms)", d.minimax_execution_ms.median(), d.alphabeta_execution_ms.median())
        row("Mean nodes visited", d.minimax_nodes_visited.mean(), d.alphabeta_nodes_visited.mean())
        row("Median nodes visited", d.minimax_nodes_visited.median(), d.alphabeta_nodes_visited.median())
        row("Max nodes visited", d.minimax_nodes_visited.max(), d.alphabeta_nodes_visited.max())
        row("Worst-case time (ms)", d.minimax_execution_ms.max(), d.alphabeta_execution_ms.max())
    return {"dataset": dataset, "cleaning": report, "statistics": table, "comparison": comparison}


# ----------------------------------------------------------------- insights
def insights(df: pd.DataFrame, source_meta: dict | None = None) -> list[dict]:
    n = len(df)
    if n == 0:
        return []
    out = []
    def add(id_, title, text, label, value, tone="info"):
        out.append({"id": id_, "title": title, "text": text, "metric": {"label": label, "value": value}, "tone": tone})

    fewer = int((df.alphabeta_nodes_visited < df.minimax_nodes_visited).sum())
    mm_fewer = int((df.minimax_nodes_visited < df.alphabeta_nodes_visited).sum())
    tot_mm, tot_ab = df.minimax_nodes_visited.sum(), df.alphabeta_nodes_visited.sum()
    if fewer == n:
        who = f"Alpha-Beta visited fewer nodes than Minimax in all {n} scenarios."
    elif mm_fewer == n:
        who = f"Minimax visited fewer nodes than Alpha-Beta in all {n} scenarios."
    else:
        who = f"Alpha-Beta visited fewer nodes in {fewer} of {n} scenarios; Minimax in {mm_fewer}."
    add("nodes", "Which algorithm visited fewer nodes?",
        f"{who} Across the selection Minimax expanded {int(tot_mm):,} nodes and Alpha-Beta {int(tot_ab):,}.",
        "Total nodes (Minimax → Alpha-Beta)", f"{int(tot_mm):,} → {int(tot_ab):,}", "good" if fewer >= mm_fewer else "warn")

    faster = int((df.alphabeta_execution_ms < df.minimax_execution_ms).sum())
    slower = int((df.minimax_execution_ms < df.alphabeta_execution_ms).sum())
    sp = df.time_speedup_ratio.dropna()
    add("time", "Which algorithm was faster?",
        (f"Alpha-Beta was faster in {faster} of {n} scenarios" + (f" and slower in {slower}." if slower else ".") +
         f" Median speedup {sp.median():.1f}×, mean {sp.mean():.1f}×, best {sp.max():.1f}× "
         f"({df.loc[sp.idxmax(), 'scenario_id']}).") if len(sp) else "Timing ratios are unavailable.",
        "Median speedup", f"{sp.median():.1f}×" if len(sp) else "–", "good" if faster >= slower else "warn")

    red = df.nodes_reduced_pct
    add("reduction", "How much did Alpha-Beta reduce the search space?",
        f"Node reduction averaged {red.mean():.1f}% (median {red.median():.1f}%), ranging from "
        f"{red.min():.1f}% ({df.loc[red.idxmin(), 'scenario_id']}) to {red.max():.1f}% "
        f"({df.loc[red.idxmax(), 'scenario_id']}). Overall {100 * (1 - tot_ab / tot_mm):.1f}% of Minimax's nodes were avoided.",
        "Mean reduction", f"{red.mean():.1f}%", "good")

    ph = df.groupby("scenario_phase")
    if ph.ngroups > 1:
        pr = ph.nodes_reduced_pct.mean()
        pn = ph.minimax_nodes_visited.mean()
        hi, lo = pr.idxmax(), pr.idxmin()
        add("phase", "How does performance change across game phases?",
            f"Pruning was most effective in the {hi} phase ({pr[hi]:.1f}% reduction) and least effective in the "
            f"{lo} phase ({pr[lo]:.1f}%). Minimax's average workload was largest in the {pn.idxmax()} phase "
            f"({pn.max():,.0f} nodes) and smallest in the {pn.idxmin()} phase ({pn.min():,.0f}).",
            "Best phase for pruning", f"{hi} · {pr[hi]:.1f}%")

    pruned = int(df.alphabeta_pruned_branches.sum())
    add("pruned", "How many branches were cut?",
        f"Alpha-Beta skipped {pruned:,} sibling branches in total, {pruned / n:,.0f} per scenario on average. "
        "Each skipped branch also removes the whole subtree beneath it.",
        "Pruned branches", f"{pruned:,}")

    if n > 2 and df.minimax_nodes_visited.nunique() > 1 and sp.nunique() > 1:
        m = df.loc[sp.index]
        c = float(np.corrcoef(m.minimax_nodes_visited, sp)[0, 1])
        strength = "strong" if abs(c) >= .7 else "moderate" if abs(c) >= .4 else "weak"
        sign = "positive" if c > 0 else "negative"
        add("corr", "Does a bigger search tree mean a bigger speedup?",
            f"Minimax node count and time speedup show a {strength} {sign} correlation (r = {c:.2f}) in this selection.",
            "Pearson r", f"{c:.2f}")

    if "search_agreement" in df:
        agree = int(df.search_agreement.astype(str).str.lower().eq("true").sum())
        add("agree", "Do both algorithms choose the same move?",
            f"Minimax and Alpha-Beta returned the same move and score in {agree} of {n} scenarios, which is what a correct "
            "pruning implementation must do.", "Agreement", f"{agree}/{n}", "good" if agree == n else "warn")

    depth = f" at depth {int(df.depth.iloc[0])}" if "depth" in df and df.depth.nunique() == 1 else ""
    add("caveat", "How reliable are the timings?",
        f"Execution times are wall-clock measurements{depth} and depend on the machine and its load; node counts are "
        "deterministic and are the more reproducible measure of search effort.",
        "Scenarios analysed", str(n), "note")
    return out
