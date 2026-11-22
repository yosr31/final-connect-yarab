import { h, icon, toast, fmt, spinner } from "../ui.js";
import { api } from "../api.js";
import { Board } from "../board.js";
import { statusNode, scoreboard, history, NAME, dot } from "../gameui.js";

const ALGO = { minimax: "Minimax", alphabeta: "Alpha-Beta" };
const LEVEL = ["", "Beginner", "Easy", "Medium", "Hard", "Expert"];
let cfg = { mode: "hva", human: 1, preset: "classic", blocked_count: 0, compare: true,
  ai: { algorithm: "alphabeta", depth: 3 }, red: { algorithm: "alphabeta", depth: 3 }, yellow: { algorithm: "minimax", depth: 3 } };
let saved = null;

export async function mount(root) {
  let game = null, busy = false, alive = true, thinking = null, running = false, timer = 0, speed = 700, log = [];
  const stageBox = h("div", { class: "glass stage" }), boardHost = h("div");
  const board = new Board(boardHost, { onColumn: (c) => humanMove(c) });
  const setup = h("div", { class: "glass card" }), side = h("div", { class: "stack" });
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "Play against the AI"), h("p", {}, "Choose Minimax or Alpha-Beta Pruning and a search depth. Every AI decision reports the time and nodes it measured."))),
    h("div", { class: "game-layout" }, h("div", { class: "stack" }, stageBox, setup), side));

  const aiConf = (p) => (cfg.mode === "ava" ? (p === 1 ? cfg.red : cfg.yellow) : cfg.ai);
  const isAI = (p) => cfg.mode === "ava" || p !== cfg.human;
  const labels = () => (cfg.mode === "ava" ? { 1: `Red · ${ALGO[cfg.red.algorithm]} d${cfg.red.depth}`, 2: `Yellow · ${ALGO[cfg.yellow.algorithm]} d${cfg.yellow.depth}` }
    : { [cfg.human]: `You (${NAME[cfg.human]})`, [3 - cfg.human]: `AI (${NAME[3 - cfg.human]})` });

  function aiPicker(title, c, color) {
    const alg = h("select", {}, Object.entries(ALGO).map(([v, l]) => h("option", { value: v, selected: v === c.algorithm }, l)));
    const depth = h("input", { type: "range", min: 1, max: 5, value: c.depth });
    const dl = h("b", {}, `${c.depth} · ${LEVEL[c.depth]}`);
    alg.addEventListener("change", () => (c.algorithm = alg.value));
    depth.addEventListener("input", () => { c.depth = +depth.value; dl.textContent = `${c.depth} · ${LEVEL[c.depth]}`; });
    return h("div", { class: "stack", style: "gap:10px" }, h("div", { class: "lbl" }, color ? dot(color) : null, " ", title),
      h("label", { class: "field" }, h("span", {}, "Algorithm"), alg), h("label", { class: "field" }, h("span", {}, "Search depth: ", dl), depth));
  }

  function renderSetup() {
    const mode = h("div", { class: "seg" }, [["hva", "Human vs AI"], ["ava", "AI vs AI demo"]].map(([v, l]) => h("button", { class: cfg.mode === v ? "on" : "", onClick: () => { cfg.mode = v; renderSetup(); } }, l)));
    const preset = h("select", {}, [["small", "Small · 5 × 6"], ["classic", "Classic · 6 × 7"], ["large", "Large · 7 × 8"]].map(([v, l]) => h("option", { value: v, selected: v === cfg.preset }, l)));
    const blocked = h("input", { type: "range", min: 0, max: 6, value: cfg.blocked_count }), bv = h("b", {}, cfg.blocked_count);
    blocked.addEventListener("input", () => (bv.textContent = blocked.value));
    const cmp = h("input", { type: "checkbox", checked: cfg.compare });
    const human = h("div", { class: "seg" }, [[1, "Red (first)"], [2, "Yellow (second)"]].map(([v, l]) => h("button", { class: cfg.human === v ? "on" : "", onClick: () => { cfg.human = v; renderSetup(); } }, l)));
    setup.replaceChildren(h("div", { class: "row spread", style: "margin-bottom:14px" }, h("h3", {}, "Match setup"), mode),
      h("div", { class: "grid g2" },
        cfg.mode === "hva" ? h("div", { class: "stack", style: "gap:10px" }, h("div", { class: "lbl" }, "You play as"), human, aiPicker("AI opponent", cfg.ai)) : aiPicker("Red player", cfg.red, 1),
        cfg.mode === "ava" ? aiPicker("Yellow player", cfg.yellow, 2) : h("div", { class: "stack", style: "gap:10px" },
          h("label", { class: "field" }, h("span", {}, "Board size"), preset), h("label", { class: "field" }, h("span", {}, "Blocked cells: ", bv), blocked))),
      cfg.mode === "ava" ? h("div", { class: "grid g2", style: "margin-top:12px" }, h("label", { class: "field" }, h("span", {}, "Board size"), preset), h("label", { class: "field" }, h("span", {}, "Blocked cells: ", bv), blocked)) : null,
      h("label", { class: "switch", style: "margin-top:14px", "data-tip": "Runs the other algorithm on the same position to show a measured comparison. Doubles the thinking time." }, cmp, "Also run the other algorithm to compare"),
      h("p", { class: "muted", style: "margin-top:10px;font-size:13px" }, "Depth counts moves looked ahead. Each extra level multiplies the work by roughly the number of open columns. Depth 5 can take a few seconds. Pop Out and power-ups are off in AI games because the search does not model them."),
      h("div", { class: "row", style: "margin-top:14px" }, h("button", { class: "btn primary", onClick: () => { cfg.preset = preset.value; cfg.blocked_count = +blocked.value; cfg.compare = cmp.checked; start(); }, html: `${icon("bolt", 16)} Start match` })));
  }

  async function start() {
    running = false; clearTimeout(timer); log = [];
    try {
      board.reset();
      game = await api.newGame({ preset: cfg.preset, blocked_count: cfg.blocked_count, vs_ai: true });
      saved = game.id; render();
      toast(cfg.mode === "ava" ? "Match ready. Press Play to watch." : "Match started.", "success");
      if (cfg.mode === "hva" && isAI(game.current_player)) await aiTurn();
    } catch (e) { toast(e.message, "error"); }
  }

  async function aiTurn() {
    if (busy || !game || game.terminal || !alive) return false;
    busy = true; const p = game.current_player, c = aiConf(p);
    thinking = { p, ...c }; render();
    try {
      game = await api.aiMove(game.id, { ...c, compare: cfg.compare });
      const a = game.last_ai;
      log.push({ n: game.move_history.length, p, algorithm: c.algorithm, depth: c.depth, move: a.chosen.move, ms: a.chosen.execution_ms, nodes: a.chosen.nodes_visited, pruned: a.chosen.pruned_branches });
    } catch (e) { toast(e.message, "error"); running = false; }
    thinking = null; busy = false; if (alive) render();
    if (game?.terminal) { running = false; toast(game.winner ? `${NAME[game.winner]} wins!` : "The game is a draw.", "success"); }
    return true;
  }

  async function humanMove(c) {
    if (busy || game.terminal || isAI(game.current_player)) return;
    busy = true;
    try { game = await api.move(game.id, c); } catch (e) { toast(e.message, "error"); busy = false; return; }
    busy = false; render();
    if (game.terminal) return toast(game.winner ? `You win!` : "The game is a draw.", "success");
    await aiTurn();
    if (game.terminal && game.winner && isAI(game.winner)) toast("The AI wins this round.", "info");
  }

  function loop() {
    if (!running || !alive) return;
    aiTurn().then((ok) => { if (running && alive && ok && !game.terminal) timer = setTimeout(loop, speed); else render(); });
  }

  function render() {
    const s = game; if (!s) return;
    const L = labels();
    const canClick = !busy && !s.terminal && cfg.mode === "hva" && !isAI(s.current_player);
    stageBox.replaceChildren(statusNode(s, L), boardHost,
      thinking ? h("div", { class: "thinking" }, h("div", { class: "spin" }), h("div", {}, h("b", {}, `${ALGO[thinking.algorithm]} is thinking…`), h("div", { class: "muted", style: "font-size:13px" }, `${NAME[thinking.p]} · searching ${thinking.depth} moves ahead`)))
        : h("p", { class: "muted", style: "text-align:center;font-size:13.5px" }, s.terminal ? "Round finished. Start a new match from the setup panel or restart below." : canClick ? "Your move: click a column." : cfg.mode === "ava" ? "Use Play or Step to run the demonstration." : "Waiting for the AI."));
    board.update(s, { enabledCols: canClick ? s.valid_moves : [], locked: !canClick, ghostPlayer: s.current_player });

    const demo = cfg.mode === "ava" ? h("div", { class: "glass card" }, h("h3", {}, "Demonstration"), h("div", { class: "row" },
      h("button", { class: "btn primary", disabled: s.terminal || busy && !running, onClick: () => { running = !running; if (running) loop(); render(); }, html: running ? `${icon("pause", 16)} Pause` : `${icon("play", 16)} Play` }),
      h("button", { class: "btn", disabled: s.terminal || busy || running, onClick: () => aiTurn(), html: `${icon("step", 16)} Step` }),
      h("label", { class: "field", style: "min-width:130px" }, h("select", { onChange: (e) => (speed = +e.target.value) }, [[1200, "Slow"], [700, "Normal"], [250, "Fast"]].map(([v, l]) => h("option", { value: v, selected: v === speed }, l)))))) : null;

    side.replaceChildren(
      h("div", { class: "glass card" }, h("h3", {}, "Score"), scoreboard(s, L)),
      demo,
      resultCard(s),
      h("div", { class: "glass card" }, h("h3", {}, "Match"), h("div", { class: "row" },
        cfg.mode === "hva" ? h("button", { class: "btn", disabled: busy || !s.move_history.length, onClick: undo, html: `${icon("undo", 16)} Undo` }) : null,
        h("button", { class: "btn", disabled: busy && !running, onClick: async () => { running = false; clearTimeout(timer); log = []; board.reset(); game = await api.restart(s.id); render(); if (cfg.mode === "hva" && isAI(game.current_player)) aiTurn(); }, html: `${icon("restart", 16)} Restart round` }))),
      explain(), logCard(), h("div", { class: "glass card" }, h("h3", {}, `Move history (${s.move_history.length})`), history(s, "No moves yet.")));
  }

  async function undo() {
    if (busy) return; busy = true;
    try { game = await api.undo(game.id, game.move_history.length >= 2 ? 2 : 1); } catch (e) { toast(e.message, "error"); }
    busy = false; board.reset(); render();
    if (isAI(game.current_player)) aiTurn();
  }

  function resultCard(s) {
    const a = s.last_ai;
    if (!a) return h("div", { class: "glass card" }, h("h3", {}, "AI decision"), h("p", { class: "muted" }, "The AI's chosen move, search time and nodes visited will appear here after it plays."));
    const c = a.chosen, o = a.other;
    const bar = (label, v, max, color) => h("div", { class: "cbar" }, h("div", { class: "row spread" }, h("span", {}, label), h("b", {}, v)), h("div", { class: "track" }, h("div", { class: "fill", style: `width:${Math.max(2, (parseFloat(String(v).replace(/,/g, "")) / max) * 100)}%;background:${color}` })));
    let cmp = h("p", { class: "muted", style: "margin-top:10px;font-size:13px" }, "Turn on the comparison switch in the setup to measure the other algorithm on the same position.");
    if (o) {
      const mm = c.algorithm === "minimax" ? c : o, ab = c.algorithm === "alphabeta" ? c : o;
      const maxN = Math.max(mm.nodes_visited, ab.nodes_visited), maxT = Math.max(mm.execution_ms, ab.execution_ms);
      cmp = h("div", { class: "compare-bars" },
        h("div", { class: "lbl" }, "Same position, both algorithms (measured now)"),
        bar("Minimax nodes", fmt.int(mm.nodes_visited), maxN, "var(--mm)"), bar("Alpha-Beta nodes", fmt.int(ab.nodes_visited), maxN, "var(--ab)"),
        bar("Minimax time", fmt.ms(mm.execution_ms), maxT, "var(--mm)"), bar("Alpha-Beta time", fmt.ms(ab.execution_ms), maxT, "var(--ab)"),
        h("p", { class: "explain" }, h("strong", {}, `Alpha-Beta visited ${fmt.pct((1 - ab.nodes_visited / mm.nodes_visited) * 100)} fewer nodes`), ` and chose ${mm.move === ab.move ? "the same column" : "a different column"} (${mm.move + 1} vs ${ab.move + 1}).`));
    }
    return h("div", { class: "glass card" }, h("div", { class: "row spread", style: "margin-bottom:10px" }, h("h3", {}, "AI decision"), h("span", { class: `tag ${c.algorithm === "minimax" ? "mm" : "ab"}` }, `${ALGO[c.algorithm]} · depth ${c.depth}`)),
      h("div", { class: "metric-grid" },
        [["Selected column", c.move + 1], ["Search time", fmt.ms(c.execution_ms)], ["Nodes visited", fmt.int(c.nodes_visited)], [c.algorithm === "alphabeta" ? "Branches pruned" : "Evaluation score", c.algorithm === "alphabeta" ? fmt.int(c.pruned_branches) : c.score]]
          .map(([l, v]) => h("div", { class: "metric" }, h("span", {}, l), h("b", {}, v)))), cmp);
  }

  function explain() {
    return h("div", { class: "glass card explain" }, h("h3", { style: "margin-bottom:8px" }, "Why Alpha-Beta can be faster"),
      h("p", {}, "Minimax checks every continuation. Alpha-Beta returns the ", h("strong", {}, "same move"), " but tracks two bounds while it searches:"),
      h("ol", {}, h("li", {}, h("strong", {}, "Alpha"), ": the best score the AI is already guaranteed."), h("li", {}, h("strong", {}, "Beta"), ": the best score the opponent can hold the AI to."),
        h("li", {}, "When alpha ≥ beta, the opponent would never allow this line, so the remaining siblings are skipped along with everything under them.")),
      h("p", { style: "margin-top:8px" }, "Trying central columns first makes cut-offs happen sooner. Open ", h("a", { href: "#/analytics", style: "color:var(--cyan)" }, "AI Analytics"), " to see a real tree with the pruned branches marked."));
  }

  function logCard() {
    if (!log.length) return null;
    return h("div", { class: "glass card" }, h("h3", {}, "Search log"), h("div", { class: "log" }, log.slice().reverse().map((l) => h("div", { class: "hist" }, h("span", { class: "n" }, l.n), dot(l.p), h("span", {}, `col ${l.move + 1} · ${ALGO[l.algorithm]} d${l.depth}`), h("span", { class: "ai" }, `${fmt.int(l.nodes)} nodes · ${fmt.ms(l.ms)}`)))));
  }

  renderSetup(); stageBox.append(spinner("Starting match"));
  if (saved) { try { game = await api.state(saved); render(); } catch { await start(); } } else await start();
  return () => { alive = false; running = false; clearTimeout(timer); };
}
