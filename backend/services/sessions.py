"""In-memory game sessions wrapping the existing ``Connect4Game`` engine.

All rules live in ``connect4.game`` / ``connect4.powerups``; this module only
adds identifiers, serialisation, and the AI hook.
"""
from __future__ import annotations
import threading
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field, asdict

from connect4.ai.search import search
from connect4.config import GameConfig, PLAYERS
from connect4.game import Connect4Game

MAX_SESSIONS = 200
_lock = threading.Lock()


@dataclass
class Session:
    id: str
    game: Connect4Game
    vs_ai: bool = False
    last_ai: dict | None = field(default=None)


_sessions: "OrderedDict[str, Session]" = OrderedDict()


def create(preset, blocked_count, seed, pop_out_enabled, vs_ai) -> Session:
    if vs_ai:
        pop_out_enabled = False  # the search does not model Pop Out
    cfg = GameConfig.preset(preset, blocked_count=blocked_count, random_seed=seed,
                            pop_out_enabled=pop_out_enabled)
    s = Session(uuid.uuid4().hex[:12], Connect4Game(cfg), vs_ai=vs_ai)
    with _lock:
        _sessions[s.id] = s
        while len(_sessions) > MAX_SESSIONS:
            _sessions.popitem(last=False)
    return s


def get(game_id: str) -> Session:
    with _lock:
        s = _sessions.get(game_id)
        if s:
            _sessions.move_to_end(game_id)
    if s is None:
        raise KeyError(game_id)
    return s


def serialize(s: Session) -> dict:
    g = s.game
    state = g.get_game_state()
    active = not g.is_terminal_state()
    me, rows, cols = g.current_player, g.board.rows, g.board.columns
    avail = g.powerups.available[me]

    pop_moves = []
    if active and g.config.pop_out_enabled:
        r = rows - 1
        pop_moves = [c for c in range(cols)
                     if not g.board.is_blocked(r, c) and g.board.grid[r][c] == me]
    removable = []
    if active and not s.vs_ai and avail["remove_opponent"]:
        removable = [[r, c] for r in range(rows) for c in range(cols)
                     if not g.board.is_blocked(r, c) and g.board.grid[r][c] == 3 - me]
    heavy_pairs = []
    if active and not s.vs_ai and avail["heavy_piece"]:
        heavy_pairs = [[c, c + 1] for c in range(cols - 1)
                       if g.board.landing_position(c) and g.board.landing_position(c + 1)]
    state.update({
        "id": s.id, "vs_ai": s.vs_ai,
        "valid_moves": g.get_valid_moves() if active else [],
        "pop_moves": pop_moves, "removable": removable, "heavy_pairs": heavy_pairs,
        "powerups_available": {str(p): g.powerups.available[p] for p in PLAYERS},
        "last_ai": s.last_ai,
    })
    return state


def _forbid_special_in_ai(s: Session) -> None:
    if s.vs_ai:
        raise ValueError("Power-ups and Pop Out are disabled in AI games: the search "
                         "algorithms only model standard drops.")


def drop(s, column):
    s.game.make_move(column)


def pop_out(s, column):
    _forbid_special_in_ai(s)
    s.game.pop_out(column)


def remove_opponent(s, row, col):
    _forbid_special_in_ai(s)
    s.game.use_remove_opponent((row, col))


def heavy(s, a, b):
    _forbid_special_in_ai(s)
    s.game.use_heavy_piece(a, b)


def undo(s, steps=1):
    done = 0
    for _ in range(steps):
        if not s.game.undo_move():
            break
        done += 1
    s.last_ai = None
    if done == 0:
        raise ValueError("Nothing to undo.")
    return done


def ai_move(s: Session, algorithm: str, depth: int, compare: bool) -> dict:
    g = s.game
    if g.is_terminal_state():
        raise ValueError("The game is over.")
    board, blocked, player = g.board.as_list(), set(g.board.blocked_cells), g.current_player
    res = search(board, player, depth, algorithm, blocked)
    if res.move is None:
        raise ValueError("The AI has no legal move.")
    other = None
    if compare:
        other_algo = "minimax" if algorithm == "alphabeta" else "alphabeta"
        other = asdict(search(board, player, depth, other_algo, blocked))
    row, col = g.make_move(res.move)
    info = {"player": player, "position": [row, col], "chosen": asdict(res), "other": other}
    g.move_history[-1]["ai"] = {"algorithm": algorithm, "depth": depth,
                                "nodes_visited": res.nodes_visited,
                                "execution_ms": round(res.execution_ms, 3), "score": res.score}
    s.last_ai = info
    return info


def demo_game(seed: int = 0, depth: int = 3) -> dict:
    """AI-vs-AI replay (random opening, then Alpha-Beta) used by the landing page."""
    import random
    rng = random.Random(seed)
    g = Connect4Game(GameConfig.preset("classic"))
    moves = []
    while not g.is_terminal_state() and len(moves) < 42:
        if len(moves) < 2:
            col = rng.choice(g.get_valid_moves())
        else:
            col = search(g.board.as_list(), g.current_player, depth, "alphabeta").move
        player = g.current_player
        row, col2 = g.make_move(col)
        moves.append({"player": player, "row": row, "column": col2})
    return {"rows": g.board.rows, "columns": g.board.columns, "moves": moves,
            "winner": g.winner, "winning_positions": g.get_winning_positions(), "draw": g.draw}
