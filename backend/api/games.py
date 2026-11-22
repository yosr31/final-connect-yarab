from fastapi import APIRouter, HTTPException
from ..schemas.models import (AIMoveReq, HeavyReq, MoveReq, NewGame, RemoveReq, UndoReq)
from ..services import sessions as S

router = APIRouter(prefix="/games", tags=["game"])


def _s(game_id):
    try:
        return S.get(game_id)
    except KeyError:
        raise HTTPException(404, "Game not found. Start a new game.")


@router.post("")
def new_game(body: NewGame):
    return S.serialize(S.create(body.preset, body.blocked_count, body.seed,
                                body.pop_out_enabled, body.vs_ai))


@router.get("/{game_id}")
def state(game_id: str):
    return S.serialize(_s(game_id))


@router.get("/{game_id}/valid-moves")
def valid_moves(game_id: str):
    st = S.serialize(_s(game_id))
    return {k: st[k] for k in ("valid_moves", "pop_moves", "removable", "heavy_pairs")}


@router.post("/{game_id}/move")
def move(game_id: str, body: MoveReq):
    s = _s(game_id); S.drop(s, body.column); return S.serialize(s)


@router.post("/{game_id}/pop-out")
def pop_out(game_id: str, body: MoveReq):
    s = _s(game_id); S.pop_out(s, body.column); return S.serialize(s)


@router.post("/{game_id}/remove-opponent")
def remove_opponent(game_id: str, body: RemoveReq):
    s = _s(game_id); S.remove_opponent(s, body.row, body.col); return S.serialize(s)


@router.post("/{game_id}/heavy-piece")
def heavy(game_id: str, body: HeavyReq):
    s = _s(game_id); S.heavy(s, body.first_column, body.second_column); return S.serialize(s)


@router.post("/{game_id}/undo")
def undo(game_id: str, body: UndoReq = UndoReq()):
    s = _s(game_id); S.undo(s, body.steps); return S.serialize(s)


@router.post("/{game_id}/restart")
def restart(game_id: str):
    s = _s(game_id); s.game.restart_game(); s.last_ai = None; return S.serialize(s)


@router.post("/{game_id}/reset")
def reset(game_id: str):
    s = _s(game_id); s.game.reset_game(); s.last_ai = None; return S.serialize(s)


@router.post("/{game_id}/ai-move")
def ai_move(game_id: str, body: AIMoveReq):
    s = _s(game_id)
    S.ai_move(s, body.algorithm, body.depth, body.compare)
    return S.serialize(s)
