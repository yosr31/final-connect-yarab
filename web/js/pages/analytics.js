import { h, icon, toast, fmt, spinner, empty } from "../ui.js";
import { api } from "../api.js";
import { chart, PALETTE } from "../charts.js";
import { miniBoard, flatToBoard } from "../board.js";
import { NAME } from "../gameui.js";

const ALGO = { minimax: "Minimax", alphabeta: "Alpha-Beta" };
const val = (v) => (v == null ? "–" : v > 900000 ? "WIN" : v < -900000 ? "LOSS" : v);
const bound = (b) => (b == null ? "" : b);
let sel = { sid: "SC001", algo: "alphabeta", depth: 2 };

export async function mount(root) {
  let scenarios = [], trees = {}, pos = null, expanded = new Set(), picked = null, alive = true;
  const controls = h("div", { class: "glass card" });
  const treeCard = h("div", { class: "glass card" });
  const detail = h("div", { class: "glass card" });
  const decision = h("div", { class: "glass card" });
  const compareHost = h("div", { class: "grid g2" });
  const depthHost = h("div", { class: "glass card" });
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "AI Analytics"), h("p", {}, "Expand a real search tree and compare how Minimax and Alpha-Beta explore it. Every node comes from the Python search, and the node counts match the real algorithm."))),
    controls, h("div", { class: "grid", style: "grid-template-columns:minmax(0,1fr) 340px;margin-top:18px;align-items:start" }, treeCard, detail),
    h("div", { style: "margin-top:18px" }, decision), h("h2", { style: "margin:34px 0 14px;font-size:22px" }, "Explored vs pruned"), compareHost,
    h("h2", { style: "margin:34px 0 14px;font-size:22px" }, "Search depth comparison"), depthHost);
  if (matchMedia("(max-width:1100px)").matches) root.querySelector(".grid").style.gridTemplateColumns = "1fr";

  try { scenarios = await api.scenarios(); } catch (e) { controls.append(empty("Backend unavailable", e.message)); return; }
  if (!scenarios.find((s) => s.id === sel.sid)) sel.sid = scenarios[0].id;

  function renderControls() {
    const sc = h("select", {}, scenarios.map((s) => h("option", { value: s.id, selected: s.id === sel.sid }, `${s.id} · ${s.phase} · ${s.rows}×${s.columns} · ${s.moves_played} moves`)));
    sc.addEventListener("change", () => { sel.sid = sc.value; build(); depthHost.replaceChildren(depthIntro()); });
    const alg = h("div", { class: "seg" }, Object.entries(ALGO).map(([v, l]) => h("button", { class: sel.algo === v ? "on" : "", onClick: () => { sel.algo = v; renderControls(); showTree(); } }, l)));
    const dep = h("div", { class: "seg" }, [1, 2, 3].map((d) => h("button", { class: sel.depth === d ? "on" : "", onClick: () => { sel.depth = d; renderControls(); build(); } }, `Depth ${d}`)));
    controls.replaceChildren(h("div", { class: "row", style: "align-items:flex-end;gap:18px" },
      h("label", { class: "field", style: "min-width:260px;flex:1" }, h("span", {}, "Starting position (benchmark scenario)"), sc),
      h("div", { class: "field" }, h("span", {}, "Algorithm shown in the tree"), alg), h("div", { class: "field" }, h("span", {}, "Tree depth"), dep)),
      h("p", { class: "muted", style: "font-size:13px;margin-top:10px" }, "Trees are limited to depth 3 so they stay readable. Use the depth comparison below for deeper searches."));
  }

  async function build() {
    treeCard.replaceChildren(spinner("Building search tree"));
    try {
      const [mm, ab] = await Promise.all(["minimax", "alphabeta"].map((a) => api.tree({ scenario_id: sel.sid, algorithm: a, depth: sel.depth })));
      if (!alive) return;
      trees = { minimax: mm, alphabeta: ab }; pos = mm;
      expanded = new Set([0]); picked = 0;
      showTree(); renderCompare();
    } catch (e) { treeCard.replaceChildren(empty("Could not build the tree", e.message)); }
  }

  const findNode = (n, id) => (n.id === id ? n : n.children.map((c) => findNode(c, id)).find(Boolean));
  const walk = (n, f) => { f(n); n.children.forEach((c) => walk(c, f)); };

  function showTree() {
    const T = trees[sel.algo]; if (!T) return;
    const root0 = T.tree, rows = pos.board.length, cols = pos.board[0].length;
    const X = 196, ROW = 40, W = 158, Hh = 32, PAD = 16;
    let leafY = 0, maxX = 0; const place = new Map();
    (function lay(n, d) {
      const kids = expanded.has(n.id) ? n.children : [];
      if (!kids.length) { place.set(n.id, { n, x: d * X, y: leafY++ * ROW }); }
      else { kids.forEach((k) => lay(k, d + 1)); place.set(n.id, { n, x: d * X, y: (place.get(kids[0].id).y + place.get(kids[kids.length - 1].id).y) / 2 }); }
      maxX = Math.max(maxX, d * X);
    })(root0, 0);
    const width = maxX + W + PAD * 2, height = Math.max(leafY * ROW + PAD * 2, 120);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg"); svg.setAttribute("width", width); svg.setAttribute("height", height); svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const g = document.createElementNS(ns, "g"); g.setAttribute("transform", `translate(${PAD},${PAD})`); svg.append(g);
    const mk = (tag, a, p) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); (p || g).append(e); return e; };
    for (const { n, x, y } of place.values()) if (expanded.has(n.id)) n.children.forEach((c) => {
      const p = place.get(c.id); if (!p) return;
      const x1 = x + W, y1 = y + Hh / 2, x2 = p.x, y2 = p.y + Hh / 2, mx = (x1 + x2) / 2;
      mk("path", { d: `M${x1} ${y1} C${mx} ${y1},${mx} ${y2},${x2} ${y2}`, class: `t-link ${c.pruned ? "pruned" : n.on_path && c.on_path ? "path" : ""}` });
    });
    for (const { n, x, y } of place.values()) {
      const cls = `t-node ${n.pruned ? "pruned" : n.kind} ${n.on_path ? "path" : ""} ${picked === n.id ? "sel" : ""}`;
      const grp = mk("g", { class: cls, transform: `translate(${x},${y})`, tabindex: 0, role: "button", "aria-label": nodeLabel(n) });
      mk("rect", { width: W, height: Hh }, grp);
      if (n.mover) mk("circle", { cx: 14, cy: Hh / 2, r: 6, fill: n.mover === 1 ? "#ef4444" : "#facc15" }, grp);
      mk("text", { x: n.mover ? 28 : 12, y: 20 }, grp).textContent = n.id === 0 ? "Current position" : `col ${n.move + 1}`;
      const right = n.pruned ? "pruned" : val(n.value);
      const t = mk("text", { x: W - 10, y: 20, "text-anchor": "end" }, grp); t.textContent = right;
      if (!n.pruned && n.children.length && !expanded.has(n.id)) mk("text", { x: W - 50, y: 20, "text-anchor": "end", class: "t-exp" }, grp).textContent = `+${n.children.length}`;
      const act = () => { picked = n.id; if (!n.pruned && n.children.length) expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id); showTree(); };
      grp.addEventListener("click", act); grp.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), act()));
    }
    const wrap = h("div", { class: "tree-wrap" }); wrap.append(svg);
    const ctl = h("div", { class: "row" },
      h("button", { class: "btn sm", onClick: () => { walk(root0, (n) => !n.pruned && n.children.length && expanded.add(n.id)); showTree(); } }, "Expand all"),
      h("button", { class: "btn sm", onClick: () => { expanded = new Set([0]); showTree(); } }, "Collapse"),
      h("button", { class: "btn sm", onClick: () => { expanded = new Set(); walk(root0, (n) => n.on_path && n.children.length && expanded.add(n.id)); showTree(); } }, "Show best line"));
    const s = T.stats;
    treeCard.replaceChildren(h("div", { class: "row spread", style: "margin-bottom:12px" }, h("div", {}, h("h3", {}, `${ALGO[sel.algo]} search tree`), h("p", { class: "muted", style: "font-size:13px" }, `${pos.label} · ${NAME[pos.player]} to move · ${fmt.int(s.nodes_visited)} nodes visited` + (sel.algo === "alphabeta" ? ` · ${s.pruned_branches} branches pruned` : ""))), ctl), wrap,
      h("div", { class: "key", style: "margin-top:12px" },
        h("span", {}, h("i", { style: "border-color:var(--blue);background:rgba(79,140,255,.2)" }), "MAX node (AI picks highest)"), h("span", {}, h("i", { style: "border-color:#f472b6;background:rgba(244,114,182,.15)" }), "MIN node (opponent picks lowest)"),
        h("span", {}, h("i", { style: "border-color:var(--green)" }), "Chosen line"), sel.algo === "alphabeta" ? h("span", {}, h("i", { style: "border-color:#ef4444;border-style:dashed" }), "Pruned (never visited)") : null),
      h("p", { class: "muted", style: "font-size:13px;margin-top:8px" }, "Click a node to inspect it and expand or collapse its children. Values are scored from the root player's point of view."));
    renderDetail(findNode(root0, picked ?? 0), rows, cols);
    renderDecision();
  }

  const nodeLabel = (n) => (n.id === 0 ? "Root position" : `${n.pruned ? "Pruned " : ""}move column ${n.move + 1} by ${NAME[n.mover]}, value ${val(n.value)}`);

  function renderDetail(n, rows, cols) {
    if (!n) return;
    const bd = n.board ? flatToBoard(n.board, rows, cols) : pos.board;
    let why;
    if (n.pruned) why = "Alpha-Beta never visited this move. An earlier sibling had already shown that this branch cannot change the result (alpha ≥ beta at the parent), so the whole subtree was skipped.";
    else if (n.terminal) why = n.terminal === "win" ? "Terminal position: the root player has four in a row. Scored as a win, earlier wins score higher." : "Terminal position: the opponent has four in a row. Scored as a loss.";
    else if (!n.children.length) why = "Depth limit reached. The position is scored by the evaluation heuristic (center control and open 2- and 3-piece windows).";
    else {
      const vis = n.children.filter((c) => !c.pruned);
      const list = vis.map((c) => `col ${c.move + 1} → ${val(c.value)}`).join(", ");
      why = `${n.kind === "max" ? "MAX picks the highest" : "MIN picks the lowest"} child value. Visited children: ${list}. Result: ${val(n.value)}.` + (n.cutoff ? " A cut-off happened here, so the remaining moves were skipped." : "");
    }
    const row = (l, v) => h("div", { class: "row spread", style: "font-size:13.5px;padding:3px 0" }, h("span", { class: "muted" }, l), h("b", {}, v));
    detail.replaceChildren(h("h3", { style: "margin-bottom:10px" }, n.id === 0 ? "Root position" : `Node: ${NAME[n.mover]} plays column ${n.move + 1}`),
      n.board || n.id === 0 ? h("div", { style: "display:grid;place-items:center;margin-bottom:10px" }, miniBoard(bd, { size: 24, blocked: pos.blocked, highlight: n.row != null ? [n.row, n.move] : null })) : h("p", { class: "muted", style: "margin-bottom:10px" }, "No board: this move was never played."),
      row("Ply (depth)", n.ply), row("Node type", n.pruned ? "Pruned" : n.kind === "leaf" ? "Leaf" : n.kind.toUpperCase()), row("Value", n.pruned ? "–" : val(n.value)),
      sel.algo === "alphabeta" && !n.pruned ? row("Window (α, β)", `${bound(n.alpha) === "" ? "−∞" : n.alpha}, ${bound(n.beta) === "" ? "+∞" : n.beta}`) : null,
      n.children.length && !n.pruned ? row("Children", `${n.children.filter((c) => !c.pruned).length} visited${n.children.some((c) => c.pruned) ? `, ${n.children.filter((c) => c.pruned).length} pruned` : ""}`) : null,
      h("p", { class: "explain", style: "margin-top:12px" }, why));
  }

  function renderDecision() {
    const T = trees[sel.algo], r = T.tree;
    const rowsHtml = r.children.map((c) => h("tr", { class: c.on_path ? "best" : "" }, h("td", { class: "l" }, `Column ${c.move + 1}`),
      h("td", {}, (sel.algo === "alphabeta" && c.cutoff ? "≤ " : "") + val(c.value)), h("td", {}, c.on_path ? h("span", { class: "tag good" }, "chosen") : h("span", { class: "tag" }, "not chosen")),
      h("td", {}, fmt.int(countNodes(c)))));
    decision.replaceChildren(h("h3", {}, `${ALGO[sel.algo]} decision process`),
      h("p", { class: "muted", style: "margin:6px 0 12px;font-size:14px" }, `${NAME[pos.player]} evaluates each legal column to depth ${sel.depth}, assuming the opponent always replies with the move that is worst for ${NAME[pos.player]}, then plays the column with the highest value: column ${T.stats.move + 1} (score ${T.stats.score}).` +
        (sel.algo === "alphabeta" ? " “≤” marks a bound: that column was cut off once it was proven no better than the best found so far, so its exact value was never needed." : "")),
      h("div", { class: "tbl-wrap" }, h("table", { class: "data" }, h("thead", {}, h("tr", {}, ["Candidate move", "Value", "Result", "Nodes searched below"].map((t, i) => h("th", { class: i ? "" : "l" }, t)))), h("tbody", {}, rowsHtml))));
  }
  const countNodes = (n) => (n.pruned ? 0 : 1 + n.children.reduce((a, c) => a + countNodes(c), 0));

  function renderCompare() {
    const mm = trees.minimax.stats, ab = trees.alphabeta.stats;
    const red = (1 - ab.nodes_visited / mm.nodes_visited) * 100;
    const plies = [...new Set([...mm.by_ply, ...ab.by_ply].map((p) => p.ply))].sort();
    const byPly = plies.map((p) => ({ label: `Ply ${p}`, minimax: mm.by_ply.find((x) => x.ply === p)?.nodes || 0, alphabeta: ab.by_ply.find((x) => x.ply === p)?.nodes || 0 }));
    const totals = [{ label: "Minimax visited", v: mm.nodes_visited, c: PALETTE.minimax }, { label: "Alpha-Beta visited", v: ab.nodes_visited, c: PALETTE.alphabeta }, { label: "Alpha-Beta branches pruned", v: ab.pruned_branches, c: "#f87171" }];
    const c1 = h("div"), c2 = h("div");
    compareHost.replaceChildren(
      h("div", { class: "glass chart-card" }, h("h3", {}, "Explored vs pruned"), h("p", { class: "sub" }, `${pos.label}, depth ${sel.depth}: Alpha-Beta visited ${fmt.pct(red)} fewer nodes and chose ${mm.move === ab.move && mm.score === ab.score ? "the same move and score" : "a different result"}.`), c1),
      h("div", { class: "glass chart-card" }, h("h3", {}, "Nodes visited at each ply"), h("p", { class: "sub" }, "How many positions each algorithm examined at every level of the tree."), c2));
    chart(c1, { type: "bar", data: totals, x: "label", series: [{ key: "v", label: "Count", color: PALETTE.blue }], colorBy: (d) => d.c, height: 280, tipFmt: fmt.int });
    chart(c2, { type: "bar", data: byPly, x: "label", series: [{ key: "minimax", label: "Minimax", color: PALETTE.minimax }, { key: "alphabeta", label: "Alpha-Beta", color: PALETTE.alphabeta }], height: 280, tipFmt: fmt.int, showLegend: true });
  }

  const depthIntro = () => h("div", { class: "empty" }, h("div", { class: "empty-mark", html: icon("layers", 26) }), h("strong", {}, "See how search effort grows with depth"), h("p", {}, `Runs both algorithms on ${sel.sid} at every depth up to the one you choose, and measures nodes and time.`),
    h("div", { class: "row" }, [3, 4, 5].map((d) => h("button", { class: "btn", onClick: () => runDepth(d) }, `Run up to depth ${d}`))), h("p", { class: "dim", style: "font-size:12.5px" }, "Depth 5 can take several seconds."));

  async function runDepth(max) {
    depthHost.replaceChildren(spinner(`Searching depths 1–${max} with both algorithms`));
    try {
      const d = await api.depthComparison(sel.sid, max); if (!alive) return;
      const rows = d.rows.map((r, i) => ({ label: `Depth ${r.depth}`, depth: r.depth, mn: r.minimax.nodes_visited, an: r.alphabeta.nodes_visited, mt: r.minimax.execution_ms, at: r.alphabeta.execution_ms, red: r.reduction_pct,
        gm: i ? r.minimax.nodes_visited / d.rows[i - 1].minimax.nodes_visited : null, ga: i ? r.alphabeta.nodes_visited / d.rows[i - 1].alphabeta.nodes_visited : null, same: r.same_move }));
      const a = h("div"), b = h("div");
      depthHost.replaceChildren(h("div", { class: "row spread", style: "margin-bottom:12px" }, h("h3", {}, `${d.label}: both algorithms, depth 1–${max}`), h("div", { class: "row" }, [3, 4, 5].map((m) => h("button", { class: `btn sm ${m === max ? "active" : ""}`, onClick: () => runDepth(m) }, `Up to ${m}`)))),
        h("div", { class: "grid g2" }, h("div", {}, h("p", { class: "sub muted" }, "Nodes visited (log scale)"), a), h("div", {}, h("p", { class: "sub muted" }, "Search time (log scale)"), b)),
        h("div", { class: "tbl-wrap", style: "margin-top:16px" }, h("table", { class: "data" }, h("thead", {}, h("tr", {}, ["Depth", "Minimax nodes", "Alpha-Beta nodes", "Reduction", "Minimax growth", "Alpha-Beta growth", "Same move"].map((t, i) => h("th", { class: i ? "" : "l" }, t)))),
          h("tbody", {}, rows.map((r) => h("tr", {}, h("td", {}, r.depth), h("td", {}, fmt.int(r.mn)), h("td", {}, fmt.int(r.an)), h("td", {}, fmt.pct(r.red)), h("td", {}, r.gm ? `×${r.gm.toFixed(1)}` : "–"), h("td", {}, r.ga ? `×${r.ga.toFixed(1)}` : "–"), h("td", {}, r.same ? "yes" : "no")))))));
      const ser = (k1, k2) => [{ key: k1, label: "Minimax", color: PALETTE.minimax }, { key: k2, label: "Alpha-Beta", color: PALETTE.alphabeta }];
      chart(a, { type: "bar", data: rows, x: "label", series: ser("mn", "an"), log: true, height: 260, tipFmt: fmt.int, showLegend: true });
      chart(b, { type: "bar", data: rows.map((r) => ({ ...r, mt: Math.max(r.mt, 0.1), at: Math.max(r.at, 0.1) })), x: "label", series: ser("mt", "at"), log: true, height: 260, yFmt: (v) => `${v} ms`, tipFmt: fmt.ms, showLegend: true });
    } catch (e) { toast(e.message, "error"); depthHost.replaceChildren(depthIntro()); }
  }

  renderControls(); depthHost.append(depthIntro()); await build();
  return () => { alive = false; };
}
