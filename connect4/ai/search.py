"""Instrumented, deterministic Connect-4 Minimax and Alpha-Beta search."""
from __future__ import annotations
from dataclasses import dataclass
from time import perf_counter_ns
from typing import Callable

@dataclass
class SearchResult:
    algorithm: str
    move: int | None
    score: int
    depth: int
    execution_ms: float
    nodes_visited: int
    pruned_branches: int = 0

@dataclass
class _Stats:
    nodes: int = 0
    pruned: int = 0


def legal_moves(board: list[list[int]], blocked: set[tuple[int, int]] | None = None) -> list[int]:
    blocked = blocked or set()
    rows, cols = len(board), len(board[0])
    out=[]
    for c in range(cols):
        # Match Board.landing_position: inspect bottom-most blocker-bounded segment first.
        segments=[]; cur=[]
        for r in range(rows):
            if (r,c) in blocked:
                if cur: segments.append(cur); cur=[]
            else: cur.append(r)
        if cur: segments.append(cur)
        if any(board[r][c] == 0 for seg in reversed(segments) for r in reversed(seg)):
            out.append(c)
    return out


def drop(board: list[list[int]], col: int, player: int,
         blocked: set[tuple[int, int]] | None = None) -> int | None:
    blocked = blocked or set(); rows=len(board)
    segments=[]; cur=[]
    for r in range(rows):
        if (r,col) in blocked:
            if cur: segments.append(cur); cur=[]
        else: cur.append(r)
    if cur: segments.append(cur)
    for seg in reversed(segments):
        for r in reversed(seg):
            if board[r][col] == 0:
                board[r][col]=player
                return r
    return None


def winner(board: list[list[int]], blocked: set[tuple[int, int]] | None = None) -> int | None:
    blocked=blocked or set(); R,C=len(board),len(board[0])
    for r in range(R):
        for c in range(C):
            p=board[r][c]
            if not p: continue
            for dr,dc in ((0,1),(1,0),(1,1),(1,-1)):
                cells=[(r+i*dr,c+i*dc) for i in range(4)]
                if all(0<=rr<R and 0<=cc<C and (rr,cc) not in blocked and board[rr][cc]==p for rr,cc in cells):
                    return p
    return None


def evaluate(board: list[list[int]], player: int, blocked: set[tuple[int, int]] | None = None) -> int:
    """Symmetric window heuristic; positive favors player, negative favors opponent."""
    blocked=blocked or set(); R,C=len(board),len(board[0]); opp=3-player; score=0
    center=C//2
    score += sum(3 if C%2 else 2 for r in range(R) if board[r][center]==player)
    score -= sum(3 if C%2 else 2 for r in range(R) if board[r][center]==opp)
    for r in range(R):
        for c in range(C):
            for dr,dc in ((0,1),(1,0),(1,1),(1,-1)):
                cells=[(r+i*dr,c+i*dc) for i in range(4)]
                if not all(0<=rr<R and 0<=cc<C and (rr,cc) not in blocked for rr,cc in cells): continue
                vals=[board[rr][cc] for rr,cc in cells]
                own,other=vals.count(player),vals.count(opp)
                if own and other: continue
                if own==4: score+=100000
                elif other==4: score-=100000
                elif own==3 and vals.count(0)==1: score+=120
                elif own==2 and vals.count(0)==2: score+=12
                elif other==3 and vals.count(0)==1: score-=140
                elif other==2 and vals.count(0)==2: score-=14
    return score


def _ordered(moves: list[int], cols: int) -> list[int]:
    mid=(cols-1)/2
    return sorted(moves,key=lambda c:(abs(c-mid),c))


def _terminal_score(board, root, ply, blocked):
    w=winner(board,blocked)
    if w==root: return 1_000_000-ply
    if w==3-root: return -1_000_000+ply
    return None


def search(board: list[list[int]], player: int, depth: int, algorithm: str="alphabeta",
           blocked: set[tuple[int,int]] | None=None) -> SearchResult:
    if depth < 1: raise ValueError("depth must be >= 1")
    if player not in (1,2): raise ValueError("player must be 1 or 2")
    if algorithm not in ("minimax","alphabeta"): raise ValueError("unknown algorithm")
    blocked=set(blocked or ()); root=player; stats=_Stats(); cols=len(board[0]); work=[row[:] for row in board]
    def visit(turn, remaining, ply, alpha, beta):
        stats.nodes+=1
        terminal=_terminal_score(work,root,ply,blocked)
        if terminal is not None: return terminal
        moves=_ordered(legal_moves(work,blocked),cols)
        if remaining==0 or not moves: return evaluate(work,root,blocked)
        maximizing=(turn==root); best=-10**9 if maximizing else 10**9
        for i,col in enumerate(moves):
            row=drop(work,col,turn,blocked)
            if row is None: continue
            value=visit(3-turn,remaining-1,ply+1,alpha,beta)
            work[row][col]=0
            if maximizing: best=max(best,value); alpha=max(alpha,best)
            else: best=min(best,value); beta=min(beta,best)
            if algorithm=="alphabeta" and alpha>=beta:
                stats.pruned += len(moves)-i-1
                break
        return best
    started=perf_counter_ns(); moves=_ordered(legal_moves(work,blocked),cols)
    if not moves:
        score=visit(player,0,0,-10**9,10**9); best_move=None
    else:
        best_move=None; best_score=-10**9; root_alpha=-10**9
        for i,col in enumerate(moves):
            row=drop(work,col,player,blocked)
            score=visit(3-player,depth-1,1,root_alpha,10**9)
            work[row][col]=0
            if score>best_score: best_score,best_move=score,col
            if algorithm=="alphabeta": root_alpha=max(root_alpha,best_score)
    elapsed=(perf_counter_ns()-started)/1_000_000
    return SearchResult(algorithm,best_move,int(best_score),depth,elapsed,stats.nodes,stats.pruned)


def minimax(board, player, depth, blocked=None): return search(board,player,depth,"minimax",blocked)
def alphabeta(board, player, depth, blocked=None): return search(board,player,depth,"alphabeta",blocked)
