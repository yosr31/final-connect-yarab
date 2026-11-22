// Shared game UI pieces (status text, scoreboard, history). Display only, no rules.
import { h } from "./ui.js";
export const NAME = { 1: "Red", 2: "Yellow" };
export const dot = (p) => h("span", { class: `pdot p${p}` });

export function statusNode(s, labels = {}) {
  if (s.winner) return h("div", { class: "status-bar" }, dot(s.winner), `${labels[s.winner] || NAME[s.winner]} wins!`);
  if (s.draw) return h("div", { class: "status-bar" }, "Draw. Neither player (or both) completed a line.");
  return h("div", { class: "status-bar" }, dot(s.current_player), `${labels[s.current_player] || NAME[s.current_player]}'s turn`);
}

export function scoreboard(s, labels = {}) {
  return h("div", { class: "scoreboard" }, [1, 2].map((p) => h("div", { class: `score ${!s.terminal && s.current_player === p ? "turn" : ""}` },
    h("span", {}, dot(p), " ", labels[p] || NAME[p]), h("b", {}, s.scores[p]))));
}

export function describe(a) {
  const p = NAME[a.player];
  switch (a.type) {
    case "drop": return `${p} dropped in column ${a.column + 1}`;
    case "pop_out": return `${p} popped out column ${a.column + 1}`;
    case "remove_opponent": return `${p} removed piece at row ${a.position[0] + 1}, column ${a.position[1] + 1}`;
    case "heavy_piece": return `${p} heavy piece in columns ${a.columns[0] + 1} and ${a.columns[1] + 1}`;
    default: return a.type;
  }
}

export function history(s, empty = "No moves yet. Click a column to drop a piece.") {
  if (!s.move_history.length) return h("p", { class: "muted" }, empty);
  const box = h("div", { class: "history" });
  s.move_history.forEach((a, i) => box.append(h("div", { class: "hist" }, h("span", { class: "n" }, i + 1), dot(a.player), h("span", {}, describe(a)),
    a.ai ? h("span", { class: "ai" }, `${a.ai.nodes_visited.toLocaleString()} nodes`) : null)));
  requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  return box;
}
