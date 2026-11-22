"""Configuration and shared constants for Connect 4."""
from dataclasses import dataclass
from typing import Any

EMPTY = 0
RED = 1
YELLOW = 2
PLAYERS = (RED, YELLOW)
BOARD_SIZES = {"small": (5, 6), "classic": (6, 7), "large": (7, 8)}

@dataclass(frozen=True)
class GameConfig:
    rows: int = 6
    columns: int = 7
    blocked_count: int = 0
    random_seed: int | None = None
    pop_out_enabled: bool = False
    game_mode: str = "classic"

    @classmethod
    def preset(cls, name: str, **overrides: Any) -> "GameConfig":
        """Build a config from ``small``, ``classic``, or ``large`` presets."""
        if name not in BOARD_SIZES:
            raise ValueError(f"Unknown board preset: {name}")
        rows, columns = BOARD_SIZES[name]
        return cls(rows=rows, columns=columns, game_mode=name, **overrides)

    def __post_init__(self) -> None:
        if self.rows < 4 or self.columns < 4:
            raise ValueError("Board dimensions must both be at least 4.")
        if self.blocked_count < 0 or self.blocked_count >= self.rows * self.columns:
            raise ValueError("blocked_count must be non-negative and smaller than the board area.")
