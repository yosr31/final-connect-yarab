"""Board representation, gravity, legal placements, and Connect 4 detection."""
from __future__ import annotations
from copy import deepcopy
from random import Random
from typing import Iterable
from .config import EMPTY, PLAYERS

Position = tuple[int, int]

class Board:
    """A grid whose blocked cells are stored separately from player pieces.

    Gravity rule: blocked cells partition each column into independent vertical
    segments. A piece falls to the lowest empty cell in the segment containing
    the selected landing space; it never passes through or crosses a blocker.
    """
    def __init__(self, rows: int = 6, columns: int = 7,
                 blocked_cells: Iterable[Position] | None = None) -> None:
        if rows < 4 or columns < 4:
            raise ValueError("Board dimensions must both be at least 4.")
        self.rows, self.columns = rows, columns
        self.grid = [[EMPTY for _ in range(columns)] for _ in range(rows)]
        self.blocked_cells: set[Position] = set(blocked_cells or ())
        for row, col in self.blocked_cells:
            self._validate_position(row, col)

    def _validate_position(self, row: int, col: int) -> None:
        if not (0 <= row < self.rows and 0 <= col < self.columns):
            raise IndexError(f"Position ({row}, {col}) is outside the board.")

    def clone(self) -> "Board":
        return deepcopy(self)

    def cell(self, row: int, col: int) -> int | None:
        self._validate_position(row, col)
        return None if (row, col) in self.blocked_cells else self.grid[row][col]

    def is_blocked(self, row: int, col: int) -> bool:
        return (row, col) in self.blocked_cells

    def _segments(self, col: int) -> list[list[int]]:
        """Return row-index segments separated by blockers, top to bottom."""
        segments: list[list[int]] = []
        current: list[int] = []
        for row in range(self.rows):
            if (row, col) in self.blocked_cells:
                if current:
                    segments.append(current)
                    current = []
            else:
                current.append(row)
        if current:
            segments.append(current)
        return segments

    def landing_position(self, col: int) -> Position | None:
        if not 0 <= col < self.columns:
            return None
        # Gravity is local to the lowest (bottom-most) segment that has space.
        # If the bottom segment is full, upper segments remain playable above blockers.
        for segment in reversed(self._segments(col)):
            for row in reversed(segment):
                if self.grid[row][col] == EMPTY:
                    return row, col
        return None

    def valid_moves(self) -> list[int]:
        return [c for c in range(self.columns) if self.landing_position(c) is not None]

    def drop(self, col: int, player: int) -> Position:
        self._validate_player(player)
        pos = self.landing_position(col)
        if pos is None:
            raise ValueError(f"Column {col} is invalid or has no available cell.")
        self.grid[pos[0]][pos[1]] = player
        return pos

    @staticmethod
    def _validate_player(player: int) -> None:
        if player not in PLAYERS:
            raise ValueError("Player must be RED (1) or YELLOW (2).")

    def remove_piece(self, row: int, col: int, expected_player: int | None = None) -> int:
        self._validate_position(row, col)
        if (row, col) in self.blocked_cells:
            raise ValueError("Cannot remove a blocked cell.")
        piece = self.grid[row][col]
        if piece == EMPTY:
            raise ValueError("Selected cell is empty.")
        if expected_player is not None and piece != expected_player:
            raise ValueError("Selected piece does not belong to the required player.")
        self.grid[row][col] = EMPTY
        self._settle_segment(row, col)
        return piece

    def undo_move(self, row: int, col: int) -> int:
        """Remove a piece at a coordinate and restore gravity in its segment."""
        return self.remove_piece(row, col)

    def _settle_segment(self, row: int, col: int) -> None:
        """Compact pieces downward only inside the selected blocker-bounded segment."""
        segment = next(s for s in self._segments(col) if row in s)
        pieces = [self.grid[r][col] for r in segment if self.grid[r][col] != EMPTY]
        for r in segment:
            self.grid[r][col] = EMPTY
        for r, piece in zip(reversed(segment), reversed(pieces)):
            self.grid[r][col] = piece

    def pop_bottom(self, col: int, player: int) -> Position:
        self._validate_player(player)
        if not 0 <= col < self.columns:
            raise ValueError("Column is outside the board.")
        row = self.rows - 1
        if (row, col) in self.blocked_cells or self.grid[row][col] != player:
            raise ValueError("Pop Out requires your own piece in the physical bottom cell.")
        self.grid[row][col] = EMPTY
        self._settle_segment(row, col)
        return row, col

    def winning_positions(self, player: int) -> list[Position]:
        self._validate_player(player)
        found: set[Position] = set()
        directions = ((0, 1), (1, 0), (1, 1), (1, -1))
        for r in range(self.rows):
            for c in range(self.columns):
                if self.grid[r][c] != player:
                    continue
                for dr, dc in directions:
                    line = [(r + i * dr, c + i * dc) for i in range(4)]
                    if all(0 <= rr < self.rows and 0 <= cc < self.columns
                           and (rr, cc) not in self.blocked_cells
                           and self.grid[rr][cc] == player for rr, cc in line):
                        found.update(line)
        return sorted(found)

    def check_winner(self) -> int | None:
        winners = [p for p in PLAYERS if self.winning_positions(p)]
        if len(winners) > 1:
            # Simultaneous lines can arise after removal mechanics; callers must
            # resolve this as a draw-like terminal ambiguity rather than guess.
            return None
        return winners[0] if winners else None

    def is_full(self) -> bool:
        return not self.valid_moves()

    def as_list(self) -> list[list[int]]:
        return deepcopy(self.grid)


def initialize_board(rows: int = 6, columns: int = 7,
                     blocked_cells: Iterable[Position] | None = None) -> Board:
    return Board(rows, columns, blocked_cells)


def generate_blocked_cells(rows: int, columns: int, count: int,
                            seed: int | None = None) -> set[Position]:
    if count < 0 or count >= rows * columns:
        raise ValueError("Invalid blocked cell count.")
    candidates = [(r, c) for r in range(rows) for c in range(columns)]
    return set(Random(seed).sample(candidates, count))
