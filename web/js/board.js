// Board rendering only. No game rules live here: legality comes from the Python backend.
import { h } from "./ui.js";

export class Board {
  constructor(container, { onColumn, onCell } = {}) {
    this.root = h("div", { class: "board-wrap" });
    container.append(this.root);
    this.onColumn = onColumn; this.onCell = onCell;
    this.prev = null; this.hoverCol = -1;
  }

  /** state: backend game state. view: { mode, enabledCols, enabledCells, selectedCols, ghostPlayer, locked } */
  update(state, view = {}) {
    const { rows, columns: cols, board } = state;
    const blocked = new Set(state.blocked_cells.map(([r, c]) => `${r},${c}`));
    const win = new Set(state.winning_positions.map(([r, c]) => `${r},${c}`));
    const fresh = this.prev && this.prev.length === rows && this.prev[0].length === cols ? this.prev : null;
    const enabledCols = new Set(view.enabledCols || []);
    const enabledCells = new Set((view.enabledCells || []).map(([r, c]) => `${r},${c}`));
    const selected = new Set(view.selectedCols || []);
    const locked = view.locked || state.terminal;

    this.root.style.setProperty("--cols", cols); this.root.style.setProperty("--rows", rows);
    const heads = h("div", { class: "board-heads" });
    for (let c = 0; c < cols; c++) {
      const can = !locked && enabledCols.has(c);
      heads.append(h("button", { class: `head ${can ? "can" : ""} ${selected.has(c) ? "sel" : ""}`, "aria-label": `Column ${c + 1}`, disabled: !can,
        onClick: () => this.onColumn?.(c),
        onPointerenter: () => this.#hover(c), onPointerleave: () => this.#hover(-1) },
        h("span", { class: `disc ghost p${view.ghostPlayer || state.current_player}` })));
    }
    const grid = h("div", { class: "board-grid" });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`, v = board[r][c];
      const isBlocked = blocked.has(key);
      const clickable = !locked && enabledCells.has(key);
      const cell = h("div", { class: `cell ${isBlocked ? "blocked" : ""} ${clickable ? "can" : ""} col-${c}`, dataset: { col: c },
        onClick: () => { if (clickable) this.onCell?.(r, c); else if (!locked && enabledCols.has(c) && view.mode !== "cells") this.onColumn?.(c); },
        onPointerenter: () => this.#hover(c), onPointerleave: () => this.#hover(-1) });
      if (v) {
        const isNew = fresh && fresh[r][c] !== v;
        const d = h("span", { class: `disc p${v} ${win.has(key) ? "win" : ""} ${isNew ? "drop" : ""} ${clickable ? "target" : ""}` });
        if (isNew) d.style.setProperty("--fall", r + 1);
        cell.append(d);
      }
      grid.append(cell);
    }
    this.root.replaceChildren(heads, grid);
    this.prev = board.map((row) => row.slice());
    this.#hover(this.hoverCol, true);
  }

  #hover(c, keep) {
    this.hoverCol = c;
    this.root.querySelectorAll(".head").forEach((el, i) => el.classList.toggle("hot", i === c && el.classList.contains("can")));
    this.root.querySelectorAll(".cell").forEach((el) => el.classList.toggle("colhot", +el.dataset.col === c));
  }
  reset() { this.prev = null; }
}

/** Static SVG board for scenarios / tree nodes (flat string "0120..." or 2-D array). */
export function miniBoard(board, { size = 22, blocked = [], highlight = null } = {}) {
  const rows = board.length, cols = board[0].length, pad = 6;
  const ns = "http://www.w3.org/2000/svg", W = cols * size + pad * 2, H = rows * size + pad * 2;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("class", "mini-board");
  const bg = document.createElementNS(ns, "rect"); bg.setAttribute("width", W); bg.setAttribute("height", H); bg.setAttribute("rx", 8); bg.setAttribute("fill", "#16307a"); svg.append(bg);
  const bl = new Set(blocked.map(([r, c]) => `${r},${c}`));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const e = document.createElementNS(ns, "circle"), v = board[r][c];
    e.setAttribute("cx", pad + c * size + size / 2); e.setAttribute("cy", pad + r * size + size / 2); e.setAttribute("r", size / 2 - 2.5);
    e.setAttribute("fill", bl.has(`${r},${c}`) ? "#050816" : v === 1 ? "#ef4444" : v === 2 ? "#facc15" : "#0a1330");
    if (highlight && highlight[0] === r && highlight[1] === c) { e.setAttribute("stroke", "#fff"); e.setAttribute("stroke-width", 2.5); }
    svg.append(e);
  }
  return svg;
}
export const flatToBoard = (s, rows, cols) => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => +s[r * cols + c]));
