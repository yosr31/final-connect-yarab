import { h, icon, toast, spinner } from "../ui.js";
import { api } from "../api.js";
import { Board } from "../board.js";
import { statusNode, scoreboard, history, NAME } from "../gameui.js";

let settings = { preset: "classic", blocked_count: 0, seed: "", pop_out_enabled: false };
let saved = null; // keep the current game when navigating away and back

export async function mount(root) {
  let game = null, tool = "drop", first = null, busy = false;
  const stage = h("div", { class: "glass stage" });
  const boardHost = h("div");
  const board = new Board(boardHost, { onColumn: (c) => onColumn(c), onCell: (r, c) => onCell(r, c) });
  const side = h("div", { class: "stack" });
  const setup = h("div", { class: "glass card" });
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Play Connect 4"), h("p", {}, "Two players on one screen. Every move is validated by the Python engine."))),
    h("div", { class: "game-layout" }, h("div", { class: "stack" }, stage, setup), side));

  function renderSetup() {
    const preset = h("select", { id: "preset" }, [["small", "Small · 5 × 6"], ["classic", "Classic · 6 × 7"], ["large", "Large · 7 × 8"]].map(([v, l]) => h("option", { value: v, selected: v === settings.preset }, l)));
    const blocked = h("input", { type: "range", min: 0, max: 8, value: settings.blocked_count });
    const bval = h("b", {}, settings.blocked_count);
    blocked.addEventListener("input", () => (bval.textContent = blocked.value));
    const seed = h("input", { type: "number", placeholder: "random", value: settings.seed });
    const pop = h("input", { type: "checkbox", checked: settings.pop_out_enabled });
    setup.replaceChildren(h("h3", { style: "margin-bottom:14px" }, "New game"),
      h("div", { class: "grid g2" },
        h("label", { class: "field" }, h("span", {}, "Board size"), preset),
        h("label", { class: "field" }, h("span", {}, "Blocked cells: ", bval), blocked),
        h("label", { class: "field" }, h("span", {}, "Blocked-cell seed"), seed),
        h("label", { class: "switch", style: "align-self:end;padding-bottom:8px", "data-tip": "Pop Out lets a player remove their own piece from the bottom row." }, pop, "Pop Out mode")),
      h("div", { class: "row", style: "margin-top:16px" }, h("button", { class: "btn primary", onClick: () => {
        settings = { preset: preset.value, blocked_count: +blocked.value, seed: seed.value, pop_out_enabled: pop.checked };
        start();
      } }, "Start new game")));
  }

  async function start() {
    try {
      board.reset();
      game = await api.newGame({ preset: settings.preset, blocked_count: settings.blocked_count, seed: settings.seed === "" ? null : +settings.seed, pop_out_enabled: settings.pop_out_enabled });
      tool = "drop"; first = null; saved = game.id; render();
      toast("New game started. Red goes first.", "success");
    } catch (e) { toast(e.message, "error"); }
  }

  async function act(fn, after) {
    if (busy) return; busy = true;
    try {
      const prevTerminal = game.terminal;
      game = await fn(); tool = "drop"; first = null; render();
      if (game.terminal && !prevTerminal) toast(game.winner ? `${NAME[game.winner]} wins!` : "The game is a draw.", "success");
      after?.();
    } catch (e) { toast(e.message, "error"); first = null; render(); }
    busy = false;
  }

  function onColumn(c) {
    if (tool === "drop") return act(() => api.move(game.id, c));
    if (tool === "heavy") {
      if (first == null) { first = c; return render(); }
      if (first === c) { first = null; return render(); }
      const a = first; return act(() => api.heavy(game.id, a, c));
    }
  }
  function onCell(r, c) {
    if (tool === "pop") return act(() => api.popOut(game.id, c));
    if (tool === "remove") return act(() => api.removeOpponent(game.id, r, c));
  }

  function view() {
    const s = game, v = { ghostPlayer: s.current_player };
    if (tool === "drop") v.enabledCols = s.valid_moves;
    if (tool === "pop") v.enabledCells = s.pop_moves.map((c) => [s.rows - 1, c]), v.mode = "cells";
    if (tool === "remove") v.enabledCells = s.removable, v.mode = "cells";
    if (tool === "heavy") {
      const pairs = s.heavy_pairs;
      v.enabledCols = first == null ? [...new Set(pairs.flat())] : pairs.filter((p) => p.includes(first)).flat().filter((c) => c !== first);
      v.selectedCols = first == null ? [] : [first];
    }
    return v;
  }

  function toolBtn(id, title, hint, disabled) {
    return h("button", { class: `tool ${tool === id ? "on" : ""}`, disabled, onClick: () => { tool = id; first = null; render(); } }, h("div", {}, title, h("small", {}, hint)));
  }

  function render() {
    const s = game;
    stage.replaceChildren(statusNode(s), boardHost, h("p", { class: "muted", style: "text-align:center;font-size:13.5px" }, hint(s)));
    board.update(s, view());
    const pw = s.powerups_available[s.current_player];
    side.replaceChildren(
      h("div", { class: "glass card" }, h("h3", {}, "Score"), scoreboard(s),
        h("p", { class: "muted", style: "margin-top:10px;font-size:13px" }, `${s.rows} × ${s.columns} board · ${s.blocked_cells.length} blocked · ${s.pop_out_enabled ? "Pop Out on" : "Pop Out off"}`)),
      h("div", { class: "glass card" }, h("h3", {}, "Actions"), h("div", { class: "tools" },
        toolBtn("drop", "Drop piece", "Click a column", false),
        toolBtn("pop", "Pop Out", s.pop_out_enabled ? "Remove your own bottom piece" : "Enable in New game", s.terminal || !s.pop_moves.length),
        toolBtn("remove", "Remove opponent piece", pw.remove_opponent ? "Power-up · one per player per game" : "Charge already used", s.terminal || !s.removable.length),
        toolBtn("heavy", "Heavy piece", pw.heavy_piece ? "Drop two pieces in adjacent columns" : "Charge already used", s.terminal || !s.heavy_pairs.length)),
        h("p", { class: "muted", style: "margin-top:10px;font-size:12.5px" }, "Each player has one shared power-up charge: Remove Opponent or Heavy Piece, not both. Undo restores it.")),
      h("div", { class: "glass card" }, h("h3", {}, "Game"), h("div", { class: "row" },
        h("button", { class: "btn", disabled: !s.move_history.length, onClick: () => act(() => api.undo(s.id)), html: `${icon("undo", 16)} Undo` }),
        h("button", { class: "btn", onClick: () => { board.reset(); act(() => api.restart(s.id)); }, html: `${icon("restart", 16)} Restart round` }),
        h("button", { class: "btn", "data-tip": "Clears the board and both scores.", onClick: () => { board.reset(); act(() => api.reset(s.id)); }, html: `${icon("trash", 16)} Reset scores` }))),
      h("div", { class: "glass card" }, h("h3", {}, `Move history (${s.move_history.length})`), history(s)));
  }

  function hint(s) {
    if (s.terminal) return "Round finished. Restart the round to play again; scores are kept.";
    if (tool === "pop") return "Click one of your pieces in the bottom row to pop it out.";
    if (tool === "remove") return "Click an opponent piece to remove it.";
    if (tool === "heavy") return first == null ? "Heavy piece: choose the first of two adjacent columns." : `Now choose an adjacent column to column ${first + 1}.`;
    return "Click a column to drop a piece. Blocked cells (striped) split a column into separate segments.";
  }

  renderSetup(); stage.append(spinner("Starting game"));
  if (saved) { try { game = await api.state(saved); render(); } catch { await start(); } } else await start();
}
