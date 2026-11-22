"""Background benchmark runs using the project's own ``run_benchmark``."""
from __future__ import annotations
import tempfile, threading, uuid
from datetime import datetime
from pathlib import Path

import pandas as pd

from connect4.analytics.benchmark import run_benchmark
from .paths import DATASET, RUNS_DIR

_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def start(depth: int, scenario_ids: list[str] | None) -> dict:
    with _lock:
        if any(j["status"] == "running" for j in _jobs.values()):
            raise RuntimeError("A benchmark is already running.")
        ds = pd.read_csv(DATASET, dtype={"board_state_row_major": str})
        if scenario_ids:
            unknown = set(scenario_ids) - set(ds.scenario_id)
            if unknown:
                raise ValueError(f"Unknown scenarios: {sorted(unknown)}")
            ds = ds[ds.scenario_id.isin(scenario_ids)]
        if ds.empty:
            raise ValueError("No scenarios selected.")
        job = {"id": uuid.uuid4().hex[:10], "status": "running", "done": 0, "total": int(len(ds)),
               "current": None, "depth": depth, "source": None, "error": None}
        _jobs[job["id"]] = job
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    out = RUNS_DIR / f"run_{stamp}_d{depth}_n{len(ds)}.csv"

    def progress(done, total, sid):
        job.update(done=done, total=total, current=sid)

    def work():
        try:
            with tempfile.TemporaryDirectory() as td:
                tmp = Path(td) / "subset.csv"
                ds.to_csv(tmp, index=False)
                run_benchmark(tmp, out, depth, progress)
            job.update(status="done", source=out.stem)
        except Exception as exc:  # surfaced to the UI
            job.update(status="error", error=str(exc))

    threading.Thread(target=work, daemon=True).start()
    return dict(job)


def status(job_id: str) -> dict:
    with _lock:
        if job_id not in _jobs:
            raise KeyError(job_id)
        return dict(_jobs[job_id])
