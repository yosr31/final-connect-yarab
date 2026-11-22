"""Pandas/NumPy EDA and charts for measured benchmark output."""
from pathlib import Path
import argparse
import numpy as np
import pandas as pd

def analyze(results_csv, output_dir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    out=Path(output_dir); out.mkdir(parents=True,exist_ok=True)
    df=pd.read_csv(results_csv)
    required=["scenario_id","minimax_execution_ms","minimax_nodes_visited","alphabeta_execution_ms","alphabeta_nodes_visited","alphabeta_pruned_branches"]
    missing=set(required)-set(df.columns)
    if missing: raise ValueError(f"Results file missing columns: {sorted(missing)}")
    numeric=required[1:]
    for col in numeric: df[col]=pd.to_numeric(df[col],errors="coerce")
    df=df.replace([np.inf,-np.inf],np.nan).dropna(subset=numeric).copy()
    df=df[(df.minimax_execution_ms>=0)&(df.alphabeta_execution_ms>=0)&(df.minimax_nodes_visited>0)&(df.alphabeta_nodes_visited>0)]
    if df.empty: raise ValueError("No valid measured benchmark rows remain after cleaning")
    df["nodes_reduced_pct"]=(1-df.alphabeta_nodes_visited/df.minimax_nodes_visited)*100
    df["time_speedup_ratio"]=df.minimax_execution_ms/df.alphabeta_execution_ms.replace(0,np.nan)
    df.to_csv(out/"cleaned_benchmark_results.csv",index=False)
    summary=pd.DataFrame({"metric":["scenarios","mean_minimax_ms","mean_alphabeta_ms","median_minimax_nodes","median_alphabeta_nodes","mean_nodes_reduced_pct","median_nodes_reduced_pct","mean_speedup_ratio","minimax_wins_on_time","alphabeta_wins_on_time"],
      "value":[len(df),df.minimax_execution_ms.mean(),df.alphabeta_execution_ms.mean(),df.minimax_nodes_visited.median(),df.alphabeta_nodes_visited.median(),df.nodes_reduced_pct.mean(),df.nodes_reduced_pct.median(),df.time_speedup_ratio.mean(),int((df.minimax_execution_ms<df.alphabeta_execution_ms).sum()),int((df.alphabeta_execution_ms<df.minimax_execution_ms).sum())]})
    summary.to_csv(out/"summary_metrics.csv",index=False)
    phase=df.groupby("scenario_phase",dropna=False).agg(scenarios=("scenario_id","count"),minimax_nodes_mean=("minimax_nodes_visited","mean"),alphabeta_nodes_mean=("alphabeta_nodes_visited","mean"),nodes_reduced_pct_mean=("nodes_reduced_pct","mean"),minimax_ms_mean=("minimax_execution_ms","mean"),alphabeta_ms_mean=("alphabeta_execution_ms","mean")).reset_index()
    phase.to_csv(out/"phase_analysis.csv",index=False)
    # Each chart is generated from actual measured output.
    fig,ax=plt.subplots(); ax.bar(["Minimax","Alpha-Beta"],[df.minimax_nodes_visited.mean(),df.alphabeta_nodes_visited.mean()]); ax.set_ylabel("Mean nodes visited"); ax.set_title("Mean search nodes (measured)"); fig.tight_layout(); fig.savefig(out/"mean_nodes.png",dpi=150); plt.close(fig)
    fig,ax=plt.subplots(); ax.scatter(df.minimax_execution_ms,df.alphabeta_execution_ms); lim=max(df.minimax_execution_ms.max(),df.alphabeta_execution_ms.max()); ax.plot([0,lim],[0,lim],linestyle="--"); ax.set_xlabel("Minimax time (ms)"); ax.set_ylabel("Alpha-Beta time (ms)"); ax.set_title("Paired execution time"); fig.tight_layout(); fig.savefig(out/"paired_time.png",dpi=150); plt.close(fig)
    fig,ax=plt.subplots(); ax.hist(df.nodes_reduced_pct,bins=min(12,max(3,len(df)//2))); ax.set_xlabel("Nodes reduced (%)"); ax.set_ylabel("Scenario count"); ax.set_title("Alpha-Beta node reduction"); fig.tight_layout(); fig.savefig(out/"node_reduction_distribution.png",dpi=150); plt.close(fig)
    if "scenario_phase" in df.columns:
        fig,ax=plt.subplots(); phase.set_index("scenario_phase")[["minimax_nodes_mean","alphabeta_nodes_mean"]].plot(kind="bar",ax=ax); ax.set_ylabel("Mean nodes visited"); ax.set_title("Search nodes by game phase"); fig.tight_layout(); fig.savefig(out/"nodes_by_phase.png",dpi=150); plt.close(fig)
    insights=[f"Analyzed {len(df)} valid measured scenarios.",f"Mean node reduction from Alpha-Beta: {df.nodes_reduced_pct.mean():.2f}%.",f"Alpha-Beta visited fewer nodes in {(df.alphabeta_nodes_visited<df.minimax_nodes_visited).sum()} of {len(df)} scenarios.",f"Alpha-Beta was faster in {(df.alphabeta_execution_ms<df.minimax_execution_ms).sum()} of {len(df)} scenarios; timing can vary due to runtime noise."]
    (out/"insights.txt").write_text("\n".join(insights)+"\n",encoding="utf-8")
    return summary,phase,insights

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("results_csv"); p.add_argument("--output-dir",default="analysis_output"); a=p.parse_args(); s,_,i=analyze(a.results_csv,a.output_dir); print(s.to_string(index=False)); print("\n".join(i))
