"""Independent power-up operations; validation occurs before mutation."""
from __future__ import annotations
from .board import Board, Position
from .config import PLAYERS

class PowerUpManager:
    """Tracks one shared power-up charge per player per game."""
    def __init__(self) -> None:
        self.available = {p: {"remove_opponent": True, "heavy_piece": True} for p in PLAYERS}

    def snapshot(self) -> dict:
        return {p: dict(items) for p, items in self.available.items()}

    def restore(self, state: dict) -> None:
        self.available = {p: dict(items) for p, items in state.items()}

    def _validate_available(self, player: int, power: str) -> None:
        if player not in PLAYERS:
            raise ValueError("Invalid player.")
        if power not in self.available[player]:
            raise ValueError("Unknown power-up.")
        if not self.available[player][power]:
            raise ValueError(f"{power} has already been used by player {player}.")

    def _consume(self, player: int) -> None:
        """Consume the player's single shared power-up charge for this game."""
        for power_name in self.available[player]:
            self.available[player][power_name] = False

    def remove_opponent_piece(self, board: Board, player: int,
                              position: Position) -> Position:
        self._validate_available(player, "remove_opponent")
        row, col = position
        if not (0 <= row < board.rows and 0 <= col < board.columns):
            raise ValueError("Selected position is outside the board.")
        if board.is_blocked(row, col) or board.grid[row][col] != 3 - player:
            raise ValueError("Choose a piece belonging to the opponent.")
        board.remove_piece(row, col, expected_player=3 - player)
        self._consume(player)
        return position

    def heavy_piece(self, board: Board, player: int,
                    first_column: int, second_column: int) -> tuple[Position, Position]:
        self._validate_available(player, "heavy_piece")
        if abs(first_column - second_column) != 1:
            raise ValueError("Heavy Piece requires two adjacent columns.")
        first = board.landing_position(first_column)
        second = board.landing_position(second_column)
        if first is None or second is None:
            raise ValueError("Both columns must have an available landing cell.")
        # No mutation occurs until all validation above has succeeded.
        board.grid[first[0]][first[1]] = player
        board.grid[second[0]][second[1]] = player
        self._consume(player)
        return first, second
