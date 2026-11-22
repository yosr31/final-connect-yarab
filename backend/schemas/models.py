"""Request bodies for the REST API."""
from typing import Literal, Optional
from pydantic import BaseModel, Field

Algorithm = Literal["minimax", "alphabeta"]


class NewGame(BaseModel):
    preset: Literal["small", "classic", "large"] = "classic"
    blocked_count: int = Field(0, ge=0, le=10)
    seed: Optional[int] = None
    pop_out_enabled: bool = False
    vs_ai: bool = False


class MoveReq(BaseModel):
    column: int


class RemoveReq(BaseModel):
    row: int
    col: int


class HeavyReq(BaseModel):
    first_column: int
    second_column: int


class UndoReq(BaseModel):
    steps: int = Field(1, ge=1, le=4)


class AIMoveReq(BaseModel):
    algorithm: Algorithm = "alphabeta"
    depth: int = Field(3, ge=1, le=5)
    compare: bool = False


class TreeReq(BaseModel):
    scenario_id: Optional[str] = None
    game_id: Optional[str] = None
    algorithm: Algorithm = "alphabeta"
    depth: int = Field(2, ge=1, le=3)


class BenchmarkRun(BaseModel):
    depth: int = Field(3, ge=1, le=5)
    scenario_ids: Optional[list[str]] = None
