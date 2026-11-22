from dataclasses import asdict
from fastapi import APIRouter, HTTPException
from connect4.ai.search import search
from ..schemas.models import TreeReq
from ..services import scenarios as SC, sessions as S
from ..services.tree import build_tree

router = APIRouter(tags=["ai"])


@router.get("/ai/algorithms")
def algorithms():
    return [
        {"id": "minimax", "name": "Minimax",
         "summary": "Explores every legal move to the chosen depth and assumes both players play perfectly."},
        {"id": "alphabeta", "name": "Alpha-Beta Pruning",
         "summary": "Returns the same move as Minimax but stops exploring a branch as soon as it cannot change the result."},
    ]


@router.get("/scenarios")
def scenarios():
    return SC.list_scenarios()


@router.get("/scenarios/{sid}")
def scenario(sid: str):
    try:
        return SC.get_scenario(sid)
    except KeyError:
        raise HTTPException(404, "Unknown scenario")


@router.get("/demo-game")
def demo(seed: int = 0):
    return S.demo_game(seed % 1000)


def _position(sid, game_id):
    if sid:
        try:
            sc = SC.get_scenario(sid)
        except KeyError:
            raise HTTPException(404, "Unknown scenario")
        return sc["board"], sc["current_player"], set(), f"Scenario {sid}"
    if game_id:
        try:
            g = S.get(game_id).game
        except KeyError:
            raise HTTPException(404, "Game not found")
        return g.board.as_list(), g.current_player, set(g.board.blocked_cells), "Live game"
    raise HTTPException(400, "Provide scenario_id or game_id")


@router.post("/ai/tree")
def tree(body: TreeReq):
    board, player, blocked, label = _position(body.scenario_id, body.game_id)
    out = build_tree(board, player, body.depth, body.algorithm, blocked)
    out.update(board=board, player=player, label=label, blocked=sorted(blocked))
    return out


@router.get("/ai/depth-comparison")
def depth_comparison(scenario_id: str | None = None, game_id: str | None = None, max_depth: int = 4):
    if not 1 <= max_depth <= 5:
        raise HTTPException(400, "max_depth must be between 1 and 5")
    board, player, blocked, label = _position(scenario_id, game_id)
    rows = []
    for d in range(1, max_depth + 1):
        mm, ab = (search(board, player, d, a, blocked) for a in ("minimax", "alphabeta"))
        rows.append({"depth": d, "minimax": asdict(mm), "alphabeta": asdict(ab),
                     "reduction_pct": (1 - ab.nodes_visited / mm.nodes_visited) * 100,
                     "same_move": mm.move == ab.move and mm.score == ab.score})
    return {"label": label, "rows": rows}


@router.post("/ai/analyze-scenario")
def analyze_scenario(scenario_id: str, depth: int = 3):
    """Run both algorithms live on a dataset scenario (fresh measurements)."""
    if not 1 <= depth <= 5:
        raise HTTPException(400, "depth must be between 1 and 5")
    board, player, blocked, _ = _position(scenario_id, None)
    return {"minimax": asdict(search(board, player, depth, "minimax", blocked)),
            "alphabeta": asdict(search(board, player, depth, "alphabeta", blocked))}
