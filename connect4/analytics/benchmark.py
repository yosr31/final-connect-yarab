"""Run paired, real Minimax/Alpha-Beta experiments on the supplied CSV scenarios."""
from __future__ import annotations
import argparse, ast, json
from pathlib import Path
import pandas as pd
from ..ai.search import minimax, alphabeta, winner

REQUIRED={"scenario_id","board_rows","board_cols","current_player","board_state_row_major","expected_terminal"}

def load_scenarios(path):
    df=pd.read_csv(path,dtype={"board_state_row_major":str})
    missing=REQUIRED-set(df.columns)
    if missing: raise ValueError(f"Dataset missing required columns: {sorted(missing)}")
    if df.scenario_id.duplicated().any(): raise ValueError("scenario_id values must be unique")
    for _,r in df.iterrows():
        rows,cols=int(r.board_rows),int(r.board_cols); raw=str(r.board_state_row_major).strip()
        if len(raw)!=rows*cols or any(ch not in "012" for ch in raw):
            raise ValueError(f"{r.scenario_id}: invalid row-major board encoding")
        board=[[int(raw[i*cols+j]) for j in range(cols)] for i in range(rows)]
        if int(r.current_player) not in (1,2): raise ValueError(f"{r.scenario_id}: invalid current_player")
        actual=winner(board)
        expected=bool(r.expected_terminal)
        if expected != (actual is not None):
            raise ValueError(f"{r.scenario_id}: expected_terminal conflicts with board winner")
    return df

def run_benchmark(input_csv, output_csv, depth=4, progress=None):
    if depth<1: raise ValueError("depth must be >= 1")
    df=load_scenarios(input_csv); records=[]
    for index, r in df.iterrows():
        rows,cols=int(r.board_rows),int(r.board_cols); raw=str(r.board_state_row_major).strip()
        board=[[int(raw[i*cols+j]) for j in range(cols)] for i in range(rows)]
        player=int(r.current_player)
        # Same board, player, depth, move ordering and heuristic for a paired comparison.
        mm=minimax(board,player,depth); ab=alphabeta(board,player,depth)
        if mm.score != ab.score or mm.move != ab.move:
            raise AssertionError(f"{r.scenario_id}: Minimax/Alpha-Beta mismatch (possible search bug)")
        records.append({"scenario_id":r.scenario_id,"board_rows":rows,"board_cols":cols,
          "scenario_phase":r.get("scenario_phase","unknown"),"current_player":player,"depth":depth,
          "minimax_best_move":mm.move,"alphabeta_best_move":ab.move,"minimax_score":mm.score,"alphabeta_score":ab.score,
          "minimax_execution_ms":mm.execution_ms,"minimax_nodes_visited":mm.nodes_visited,
          "alphabeta_execution_ms":ab.execution_ms,"alphabeta_nodes_visited":ab.nodes_visited,
          "alphabeta_pruned_branches":ab.pruned_branches,
          "nodes_reduced_pct":(1-ab.nodes_visited/mm.nodes_visited)*100 if mm.nodes_visited else 0,
          "time_speedup_ratio":mm.execution_ms/ab.execution_ms if ab.execution_ms else None,
          "search_agreement":True})
        if progress: progress(index+1,len(df),str(r.scenario_id))
    result=pd.DataFrame(records)
    output=Path(output_csv); output.parent.mkdir(parents=True,exist_ok=True); result.to_csv(output,index=False)
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument("input_csv"); p.add_argument("--output",default="benchmark_results.csv"); p.add_argument("--depth",type=int,default=4)
    a=p.parse_args(); out=run_benchmark(a.input_csv,a.output,a.depth)
    print(f"Completed {len(out)} paired scenarios. Results: {a.output}")
    print(out[["minimax_nodes_visited","alphabeta_nodes_visited","nodes_reduced_pct","time_speedup_ratio"]].describe().round(3))
if __name__=="__main__": main()
