"""Game orchestration, state transitions, history, and reversible actions."""
from __future__ import annotations
from copy import deepcopy
from typing import Any
from .board import Board, generate_blocked_cells
from .config import GameConfig, RED, YELLOW, PLAYERS
from .powerups import PowerUpManager

class Connect4Game:
    """Rules engine. The Tkinter interface can call these methods in Part 2."""
    def __init__(self, config: GameConfig | None = None) -> None:
        self.config = config or GameConfig()
        self._initial_blocked = self._make_blocked()
        self._history: list[dict[str, Any]] = []
        self.score_history: list[dict[str, Any]] = []
        self.scores = {RED: 0, YELLOW: 0}
        self._create_fresh_state()

    def _make_blocked(self) -> set[tuple[int, int]]:
        return generate_blocked_cells(self.config.rows, self.config.columns,
                                      self.config.blocked_count, self.config.random_seed)

    def _create_fresh_state(self) -> None:
        self.board = Board(self.config.rows, self.config.columns, self._initial_blocked)
        self.current_player = RED
        self.powerups = PowerUpManager()
        self.winner: int | None = None
        self.winning_positions: list[tuple[int, int]] = []
        self.draw = False
        self.move_history: list[dict[str, Any]] = []
        self._history = []

    def _snapshot(self) -> dict[str, Any]:
        return {"board": self.board.clone(), "current_player": self.current_player,
                "powerups": self.powerups.snapshot(), "winner": self.winner,
                "winning_positions": deepcopy(self.winning_positions), "draw": self.draw,
                "move_history": deepcopy(self.move_history), "scores": dict(self.scores),
                "score_history": deepcopy(self.score_history)}

    def _restore(self, state: dict[str, Any]) -> None:
        self.board = state["board"].clone()
        self.current_player = state["current_player"]
        self.powerups.restore(state["powerups"])
        self.winner = state["winner"]
        self.winning_positions = deepcopy(state["winning_positions"])
        self.draw = state["draw"]
        self.move_history = deepcopy(state["move_history"])
        self.scores = dict(state["scores"])
        self.score_history = deepcopy(state["score_history"])

    def _ensure_active(self) -> None:
        if self.is_terminal_state():
            raise ValueError("The game is over. Restart before making another move.")

    def _finish_action(self, action: dict[str, Any], next_player: bool = True) -> None:
        self._update_terminal_status()
        self.move_history.append(action)
        if next_player and not self.is_terminal_state():
            self.current_player = YELLOW if self.current_player == RED else RED

    def _update_terminal_status(self) -> None:
        winners = {p: self.board.winning_positions(p) for p in PLAYERS}
        active = [p for p, positions in winners.items() if positions]
        if len(active) == 1:
            self.winner = active[0]
            self.winning_positions = winners[self.winner]
            self.draw = False
            self.scores[self.winner] += 1
            self.score_history.append({"winner": self.winner, "scores": dict(self.scores)})
        elif len(active) == 2:
            self.winner = None
            self.winning_positions = sorted(set(winners[RED] + winners[YELLOW]))
            self.draw = True
        else:
            self.winner = None
            self.winning_positions = []
            self.draw = self.board.is_full()

    def get_valid_moves(self) -> list[int]:
        return self.board.valid_moves()

    def make_move(self, column: int) -> tuple[int, int]:
        self._ensure_active()
        before = self._snapshot()
        try:
            position = self.board.drop(column, self.current_player)
            self._finish_action({"type": "drop", "player": self.current_player,
                                 "column": column, "position": position})
        except Exception:
            self._restore(before)
            raise
        self._history.append(before)
        return position

    def undo_move(self) -> bool:
        if not self._history:
            return False
        self._restore(self._history.pop())
        return True

    def undo_last_move(self) -> bool:
        return self.undo_move()

    def use_remove_opponent(self, position: tuple[int, int]) -> tuple[int, int]:
        self._ensure_active()
        before = self._snapshot()
        try:
            self.powerups.remove_opponent_piece(self.board, self.current_player, position)
            self._finish_action({"type": "remove_opponent", "player": self.current_player,
                                 "position": position})
        except Exception:
            self._restore(before)
            raise
        self._history.append(before)
        return position

    def use_heavy_piece(self, first_column: int, second_column: int) -> tuple[tuple[int, int], tuple[int, int]]:
        self._ensure_active()
        before = self._snapshot()
        try:
            positions = self.powerups.heavy_piece(self.board, self.current_player,
                                                  first_column, second_column)
            self._finish_action({"type": "heavy_piece", "player": self.current_player,
                                 "columns": (first_column, second_column),
                                 "positions": positions})
        except Exception:
            self._restore(before)
            raise
        self._history.append(before)
        return positions

    def pop_out(self, column: int) -> tuple[int, int]:
        self._ensure_active()
        if not self.config.pop_out_enabled:
            raise ValueError("Pop Out mode is disabled.")
        before = self._snapshot()
        try:
            position = self.board.pop_bottom(column, self.current_player)
            self._finish_action({"type": "pop_out", "player": self.current_player,
                                 "column": column, "position": position})
        except Exception:
            self._restore(before)
            raise
        self._history.append(before)
        return position

    def check_winner(self) -> int | None:
        return self.board.check_winner()

    def check_draw(self) -> bool:
        return self.draw

    def is_terminal_state(self) -> bool:
        return self.winner is not None or self.draw

    def get_winning_positions(self) -> list[tuple[int, int]]:
        return list(self.winning_positions)

    def save_move(self, action: dict[str, Any]) -> None:
        """Append an external annotation; normal actions are saved automatically."""
        self.move_history.append(deepcopy(action))

    def restart_game(self) -> None:
        """Start a fresh round, preserving accumulated scores."""
        scores = dict(self.scores)
        self._create_fresh_state()
        self.scores = scores

    def reset_game(self, regenerate_blocked: bool = False) -> None:
        """Reset board, scores, and histories; optionally regenerate blockers."""
        if regenerate_blocked:
            self._initial_blocked = self._make_blocked()
        self.scores = {RED: 0, YELLOW: 0}
        self.score_history = []
        self._create_fresh_state()

    def get_game_state(self) -> dict[str, Any]:
        return {"board": self.board.as_list(), "current_player": self.current_player,
                "rows": self.board.rows, "columns": self.board.columns,
                "blocked_cells": sorted(self.board.blocked_cells),
                "game_mode": self.config.game_mode,
                "pop_out_enabled": self.config.pop_out_enabled,
                "powerups": self.powerups.snapshot(), "winner": self.winner,
                "winning_positions": self.get_winning_positions(), "draw": self.draw,
                "move_history": deepcopy(self.move_history), "score_history": deepcopy(self.score_history),
                "scores": dict(self.scores), "terminal": self.is_terminal_state()}

# Functional wrappers requested by the specification.
def initialize_board(rows: int = 6, columns: int = 7, blocked_cells=None) -> Board:
    return Board(rows, columns, blocked_cells)

def get_valid_moves(board: Board) -> list[int]:
    return board.valid_moves()

def make_move(board: Board, column: int, player: int) -> tuple[int, int]:
    return board.drop(column, player)

def undo_move(board: Board, row: int, column: int) -> None:
    board.remove_piece(row, column)

def check_winner(board: Board) -> int | None:
    return board.check_winner()

def check_draw(board: Board) -> bool:
    return board.is_full() and board.check_winner() is None

def is_terminal_state(board: Board) -> bool:
    return board.check_winner() is not None or check_draw(board)

def get_winning_positions(board: Board, player: int) -> list[tuple[int, int]]:
    return board.winning_positions(player)
