"""API + data-science verification. Run from project root:  python -m pytest backend/tests -q"""
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services import analytics as A
from backend.services.paths import SUMMARY_METRICS, CLEANED_RESULTS
from backend.services.tree import build_tree
from backend.services import scenarios as SC
from connect4.ai.search import search

c = TestClient(app)


def new(**kw):
    return c.post("/api/games", json=kw).json()


def test_classic_game_and_win():
    g = new(); gid = g["id"]
    assert g["valid_moves"] == list(range(7))
    for col in (0, 1, 0, 1, 0, 1):
        g = c.post(f"/api/games/{gid}/move", json={"column": col}).json()
    g = c.post(f"/api/games/{gid}/move", json={"column": 0}).json()
    assert g["winner"] == 1 and g["scores"]["1"] == 1 and len(g["winning_positions"]) == 4
    assert c.post(f"/api/games/{gid}/move", json={"column": 3}).status_code == 400
    g = c.post(f"/api/games/{gid}/undo").json()
    assert g["winner"] is None and g["scores"]["1"] == 0
    assert c.post(f"/api/games/{gid}/restart").json()["move_history"] == []


def test_presets_and_blocked():
    g = new(preset="large", blocked_count=4, seed=3)
    assert (g["rows"], g["columns"]) == (7, 8) and len(g["blocked_cells"]) == 4


def test_powerups_and_popout():
    g = new(pop_out_enabled=True); gid = g["id"]
    c.post(f"/api/games/{gid}/move", json={"column": 2})            # red bottom col 2
    c.post(f"/api/games/{gid}/move", json={"column": 3})
    g = c.get(f"/api/games/{gid}").json()
    assert g["pop_moves"] == [2] and [5, 3] in g["removable"] and [2, 3] in [[a, a + 1] for a in (2,)]
    g = c.post(f"/api/games/{gid}/pop-out", json={"column": 2}).json()
    assert g["board"][5][2] == 0 and g["current_player"] == 2
    c.post(f"/api/games/{gid}/move", json={"column": 0})              # yellow drops, red to move
    g = c.post(f"/api/games/{gid}/remove-opponent", json={"row": 5, "col": 3}).json()
    assert g["board"][5][3] == 0
    assert g["powerups_available"]["1"] == {"remove_opponent": False, "heavy_piece": False}   # one shared charge
    assert g["powerups_available"]["2"]["heavy_piece"] is True
    r = c.post(f"/api/games/{gid}/heavy-piece", json={"first_column": 0, "second_column": 1})  # yellow
    assert r.status_code == 200
    assert c.post(f"/api/games/{gid}/heavy-piece", json={"first_column": 4, "second_column": 5}).status_code == 400  # red already used


def test_ai_game_and_restrictions():
    g = new(vs_ai=True, pop_out_enabled=True); gid = g["id"]
    assert g["pop_out_enabled"] is False
    r = c.post(f"/api/games/{gid}/ai-move", json={"algorithm": "alphabeta", "depth": 3, "compare": True}).json()
    ai = r["last_ai"]
    assert ai["chosen"]["nodes_visited"] < ai["other"]["nodes_visited"]
    assert ai["chosen"]["move"] == ai["other"]["move"] and r["current_player"] == 2
    assert c.post(f"/api/games/{gid}/remove-opponent", json={"row": 5, "col": 0}).status_code == 400
    assert c.post(f"/api/games/{gid}/undo", json={"steps": 1}).json()["move_history"] == []


def test_tree_matches_real_search():
    for sid in ("SC001", "SC003", "SC020"):
        sc = SC.get_scenario(sid)
        for algo in ("minimax", "alphabeta"):
            for d in (1, 2, 3):
                st = build_tree(sc["board"], sc["current_player"], d, algo)["stats"]
                real = search(sc["board"], sc["current_player"], d, algo)
                assert (st["nodes_visited"], st["pruned_branches"], st["move"], st["score"]) == \
                       (real.nodes_visited, real.pruned_branches, real.move, real.score), (sid, algo, d)


def test_kpis_match_existing_analysis_output():
    k = c.get("/api/dashboard/kpis").json()
    m = dict(pd.read_csv(SUMMARY_METRICS).values)
    assert k["scenarios"] == int(m["scenarios"])
    assert k["mean_minimax_ms"] == pytest.approx(m["mean_minimax_ms"], abs=1e-3)
    assert k["mean_alphabeta_ms"] == pytest.approx(m["mean_alphabeta_ms"], abs=1e-3)
    assert k["mean_nodes_reduced_pct"] == pytest.approx(m["mean_nodes_reduced_pct"], abs=1e-3)
    assert k["mean_speedup_ratio"] == pytest.approx(m["mean_speedup_ratio"], abs=1e-3)
    cl = pd.read_csv(CLEANED_RESULTS)
    df, _ = A.load("shipped")
    assert len(cl) == len(df) and cl.nodes_reduced_pct.mean() == pytest.approx(df.nodes_reduced_pct.mean())


def test_filters_charts_insights_overview():
    ch = c.get("/api/dashboard/charts?phases=early").json()
    assert {s["phase"] for s in ch["scenarios"]} == {"early"} and len(ch["scenarios"]) == 10
    assert c.get("/api/dashboard/kpis?scenarios=SC001,SC002").json()["scenarios"] == 2
    assert c.get("/api/dashboard/kpis?phases=nope").json()["empty"] is True
    ins = c.get("/api/dashboard/insights").json()
    assert len(ins) >= 6 and all(i["text"] for i in ins)
    ov = c.get("/api/dashboard/overview").json()
    assert ov["dataset"]["rows"] == 30 and ov["cleaning"]["rows_clean"] == 30
    assert c.get("/api/dashboard/sources").json()[0]["id"] == "shipped"
    assert c.get("/api/dashboard/kpis?source=../x").status_code == 404


def test_benchmark_job_and_scenarios_endpoints():
    import time
    r = c.post("/api/benchmark/run", json={"depth": 2, "scenario_ids": ["SC001", "SC002"]}).json()
    for _ in range(100):
        j = c.get(f"/api/benchmark/jobs/{r['id']}").json()
        if j["status"] != "running":
            break
        time.sleep(0.1)
    assert j["status"] == "done", j
    k = c.get(f"/api/dashboard/kpis?source={j['source']}").json()
    assert k["scenarios"] == 2
    from backend.services.paths import RUNS_DIR
    (RUNS_DIR / f"{j['source']}.csv").unlink()
    assert len(c.get("/api/scenarios").json()) == 30
    assert c.get("/api/scenarios/SC001").json()["board"]
    assert c.get("/api/demo-game?seed=1").json()["moves"]
    d = c.get("/api/ai/depth-comparison?scenario_id=SC001&max_depth=3").json()
    assert [x["depth"] for x in d["rows"]] == [1, 2, 3] and all(x["same_move"] for x in d["rows"])


def test_tree_ids_root_zero_unique_and_best_path():
    t = c.post("/api/ai/tree", json={"scenario_id": "SC003", "algorithm": "alphabeta", "depth": 3}).json()
    ids = []
    def walk(n):
        ids.append(n["id"]); [walk(k) for k in n["children"]]
    walk(t["tree"])
    assert t["tree"]["id"] == 0 and len(ids) == len(set(ids))
    assert t["tree"]["on_path"] and any(k["on_path"] for k in t["tree"]["children"])
    assert t["stats"]["nodes_visited"] + t["stats"]["pruned_branches"] <= len(ids)
