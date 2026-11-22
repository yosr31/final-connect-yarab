"""Instrumented search tree.

Mirrors ``connect4.ai.search.search`` step for step (same move ordering,
heuristic, terminal scoring, and pruning rule) but records every visited node
so the UI can show how Minimax and Alpha-Beta explore the game. Tests assert
that node counts, pruned counts, move and score equal the real ``search``.
"""
from __future__ import annotations
from time import perf_counter_ns

from connect4.ai.search import (_ordered, _terminal_score, drop, evaluate,
                                legal_moves)

INF = 10**9


def _flat(board):
    return "".join(str(v) for row in board for v in row)


def build_tree(board, player, depth, algorithm, blocked=None):
    blocked = set(blocked or ())
    work = [r[:] for r in board]
    cols = len(work[0])
    root = player
    counter = {"id": 0, "nodes": 0, "pruned": 0}
    ab = algorithm == "alphabeta"

    def new_node(move, row, mover, turn, ply):
        nid = counter["id"]          # root is id 0
        counter["id"] += 1
        return {"id": nid, "move": move, "row": row, "mover": mover, "turn": turn,
                "ply": ply, "value": None, "alpha": None, "beta": None, "kind": "leaf",
                "terminal": None, "pruned": False, "cutoff": False, "best_child": None,
                "on_path": False, "board": _flat(work), "children": []}

    def lim(x):
        return None if abs(x) >= INF else x

    def visit(turn, remaining, ply, alpha, beta, move, row, mover):
        counter["nodes"] += 1
        node = new_node(move, row, mover, turn, ply)
        node["alpha"], node["beta"] = lim(alpha), lim(beta)
        t = _terminal_score(work, root, ply, blocked)
        if t is not None:
            node.update(value=t, terminal="win" if t > 0 else "loss")
            return node
        moves = _ordered(legal_moves(work, blocked), cols)
        if remaining == 0 or not moves:
            node["value"] = evaluate(work, root, blocked)
            return node
        maximizing = turn == root
        node["kind"] = "max" if maximizing else "min"
        best = -INF if maximizing else INF
        for i, col in enumerate(moves):
            r = drop(work, col, turn, blocked)
            if r is None:
                continue
            child = visit(3 - turn, remaining - 1, ply + 1, alpha, beta, col, r, turn)
            work[r][col] = 0
            node["children"].append(child)
            improved = value_better(child["value"], best, maximizing)
            if maximizing:
                best = max(best, child["value"]); alpha = max(alpha, best)
            else:
                best = min(best, child["value"]); beta = min(beta, best)
            if improved:
                node["best_child"] = child["id"]
            if ab and alpha >= beta:
                skipped = moves[i + 1:]
                counter["pruned"] += len(skipped)
                node["cutoff"] = True
                for sc in skipped:
                    stub = new_node(sc, None, turn, 3 - turn, ply + 1)
                    stub.update(pruned=True, board="", kind="pruned")
                    node["children"].append(stub)
                break
        node["value"] = best
        return node

    def value_better(v, best, maximizing):
        return v > best if maximizing else v < best

    started = perf_counter_ns()
    moves = _ordered(legal_moves(work, blocked), cols)
    tree = new_node(None, None, None, player, 0)
    tree["kind"] = "max"
    best_score, best_move, root_alpha = -INF, None, -INF
    for col in moves:
        r = drop(work, col, player, blocked)
        child = visit(3 - player, depth - 1, 1, root_alpha, INF, col, r, player)
        work[r][col] = 0
        tree["children"].append(child)
        if child["value"] > best_score:
            best_score, best_move = child["value"], col
            tree["best_child"] = child["id"]
        if ab:
            root_alpha = max(root_alpha, best_score)
    tree["value"] = best_score if moves else evaluate(work, root, blocked)
    elapsed = (perf_counter_ns() - started) / 1_000_000

    # mark the principal variation (decision path)
    node = tree
    while node:
        node["on_path"] = True
        nxt = node["best_child"]
        node = next((c for c in node["children"] if c["id"] == nxt), None)

    by_ply: dict[int, int] = {}

    def count(n):
        if n["pruned"]:
            return
        if n["ply"] > 0:
            by_ply[n["ply"]] = by_ply.get(n["ply"], 0) + 1
        for c in n["children"]:
            count(c)
    count(tree)
    stats = {"algorithm": algorithm, "depth": depth, "move": best_move, "score": int(best_score),
             "nodes_visited": counter["nodes"], "pruned_branches": counter["pruned"],
             "build_ms": round(elapsed, 3),
             "by_ply": [{"ply": p, "nodes": by_ply[p]} for p in sorted(by_ply)]}
    return {"tree": tree, "stats": stats}
