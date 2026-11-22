"""Filesystem locations of the existing project data (nothing is moved or renamed)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "connect4_ai_benchmark_dataset.csv"
SHIPPED_RESULTS = ROOT / "benchmark_results.csv"
CLEANED_RESULTS = ROOT / "analysis_output" / "cleaned_benchmark_results.csv"
SUMMARY_METRICS = ROOT / "analysis_output" / "summary_metrics.csv"
RUNS_DIR = ROOT / "data" / "runs"
FRONTEND_DIST = ROOT / "frontend" / "dist"
