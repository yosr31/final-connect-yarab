import { h, icon, toast, fmt, spinner, empty, countUp, modal } from "../ui.js";
import { api } from "../api.js";
import { chart, PALETTE } from "../charts.js";
import { miniBoard } from "../board.js";

const PH = { early: "#22d3ee", mid: "#8b5cf6", late: "#f472b6" };
const phaseColor = (p) => PH[p] || PALETTE.blue;
const SERIES = (a, b, algo) => [{ key: a, label: "Minimax", color: PALETTE.minimax, id: "minimax" }, { key: b, label: "Alpha-Beta", color: PALETTE.alphabeta, id: "alphabeta" }].filter((s) => algo === "both" || s.id === algo);
const KEY = "c4-dash-filters";
let F = (() => { try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; } })() || { source: "shipped", phases: [], scenarios: [] };
let algoSel = "both";
const save = () => sessionStorage.setItem(KEY, JSON.stringify(F));

export async function mount(root, { sub }) {
  const section = sub || "overview";
  let alive = true, seq = 0, sources = [], options = { phases: [], scenarios: [] };
  const body = h("div"), bar = h("div", { class: "filters glass" });
  const TITLES = { overview: ["Overview", "Key measurements from the Minimax vs Alpha-Beta benchmark."], performance: ["Performance comparison", "Interactive charts built from measured results."], data: ["Data analysis", "Dataset, cleaning, statistics and algorithm comparison."], insights: ["Insights", "Observations generated from the selected data."], explorer: ["Scenario explorer", "Inspect individual benchmark results and re-run them live."] };
  root.append(h("div", { class: "page-head" }, h("div", {}, h("h1", {}, TITLES[section]?.[0] || "Dashboard"), h("p", {}, TITLES[section]?.[1]))), bar, body);

  try { [sources, options] = await Promise.all([api.sources(), api.charts({ source: F.source }).then((c) => ({ phases: [...new Set(c.scenarios.map((s) => s.phase))], scenarios: c.scenarios.map((s) => s.scenario_id) }))]); }
  catch (e) { body.append(empty("The backend is not reachable", e.message)); return; }
  if (!sources.find((s) => s.id === F.source)) { F.source = "shipped"; save(); }
  renderBar(); load();

  // ---------------------------------------------------------------- filter bar
  function renderBar() {
    const src = h("select", { "aria-label": "Data source" }, sources.map((s) => h("option", { value: s.id, selected: s.id === F.source }, s.label + (s.depth && s.kind === "shipped" ? ` · depth ${s.depth}` : ""))));
    src.addEventListener("change", async () => { F.source = src.value; save(); await refreshOptions(); load(); });
    const chips = h("div", { class: "chips" }, options.phases.map((p) => h("button", { class: `chip ${F.phases.includes(p) ? "on" : ""}`, "aria-pressed": F.phases.includes(p), onClick: () => { F.phases = F.phases.includes(p) ? F.phases.filter((x) => x !== p) : [...F.phases, p]; save(); renderBar(); load(); } }, p)));
    const panel = h("div", { class: "glass", style: "display:none;position:absolute;top:44px;left:0;z-index:50;width:260px;max-height:320px;overflow:auto;padding:10px;background:#0b1330" });
    const sc = h("button", { class: "btn sm", onClick: () => (panel.style.display = panel.style.display === "none" ? "block" : "none"), html: `${icon("filter", 14)} Scenarios${F.scenarios.length ? ` (${F.scenarios.length})` : " (all)"}` });
    panel.append(h("div", { class: "row", style: "margin-bottom:8px" }, h("button", { class: "btn sm", onClick: () => { F.scenarios = []; save(); renderBar(); load(); } }, "All")),
      ...options.scenarios.map((id) => { const cb = h("input", { type: "checkbox", checked: F.scenarios.includes(id) }); cb.addEventListener("change", () => { F.scenarios = cb.checked ? [...F.scenarios, id] : F.scenarios.filter((x) => x !== id); save(); sc.innerHTML = `${icon("filter", 14)} Scenarios${F.scenarios.length ? ` (${F.scenarios.length})` : " (all)"}`; clearTimeout(panel._t); panel._t = setTimeout(load, 250); }); return h("label", { class: "switch", style: "padding:3px 4px;font-size:13px" }, cb, id); }));
    bar.replaceChildren(h("label", { class: "field", style: "min-width:210px" }, src), chips, h("div", { style: "position:relative" }, sc, panel),
      (F.phases.length || F.scenarios.length) ? h("button", { class: "btn sm", onClick: () => { F.phases = []; F.scenarios = []; save(); renderBar(); load(); } }, "Clear filters") : null,
      h("button", { class: "btn primary sm", style: "margin-left:auto", onClick: runBenchmarkDialog, html: `${icon("zap", 14)} Run new benchmark` }));
  }
  async function refreshOptions() {
    const c = await api.charts({ source: F.source });
    options = { phases: [...new Set(c.scenarios.map((s) => s.phase))], scenarios: c.scenarios.map((s) => s.scenario_id) };
    F.phases = F.phases.filter((p) => options.phases.includes(p)); F.scenarios = F.scenarios.filter((s) => options.scenarios.includes(s)); save(); renderBar();
  }

  // ---------------------------------------------------------------- loading
  async function load() {
    const my = ++seq; body.replaceChildren(h("div", { class: "kpis" }, Array.from({ length: 6 }, () => h("div", { class: "skeleton", style: "height:120px" }))), spinner("Loading measurements"));
    const f = { source: F.source, phases: F.phases, scenarios: F.scenarios };
    try {
      const C = await api.charts(f);
      if (!alive || my !== seq) return;
      if (C.empty) return body.replaceChildren(empty("No scenarios match these filters", "Clear a filter or choose different scenarios to see results.", h("button", { class: "btn", onClick: () => { F.phases = []; F.scenarios = []; save(); renderBar(); load(); } }, "Clear filters")));
      const fn = { overview, performance, data, insights, explorer }[section] || overview;
      const out = await fn(f, C);
      if (alive && my === seq) body.replaceChildren(...[].concat(out));
    } catch (e) { if (my === seq) body.replaceChildren(empty("Could not load the dashboard", e.message)); }
  }

  // ---------------------------------------------------------------- helpers
  function card({ title, sub, options: opts, initial, render, height }) {
    let choice = initial ?? opts?.[0]?.[0]; const holder = h("div", { style: height ? `min-height:${height}px` : "" }), seg = h("div", { class: "seg" });
    const draw = () => { seg.replaceChildren(...(opts || []).map(([v, l]) => h("button", { class: choice === v ? "on" : "", onClick: () => { choice = v; draw(); } }, l))); holder.replaceChildren(); render(holder, choice); };
    const el = h("div", { class: "glass chart-card" }, h("div", { class: "row spread", style: "align-items:flex-start" }, h("div", {}, h("h3", {}, title), h("p", { class: "sub" }, sub)), opts ? seg : null), holder);
    requestAnimationFrame(draw); return el;
  }
  const scen = (C) => C.scenarios;
  const tipX = (d) => `${d.scenario_id} · ${d.phase}`;
  const algoSwitch = () => { const s = h("div", { class: "seg" }); const d = () => s.replaceChildren(...[["both", "Compare both"], ["minimax", "Minimax only"], ["alphabeta", "Alpha-Beta only"]].map(([v, l]) => h("button", { class: algoSel === v ? "on" : "", onClick: () => { algoSel = v; load(); } }, l))); d(); return h("div", { class: "row", style: "margin-bottom:16px" }, h("span", { class: "lbl" }, "Algorithm comparison"), s); };

  // ---------------------------------------------------------------- KPIs
  function kpiCards(k) {
    const num = (v, o) => { const el = h("span", {}, "0"); countUp(el, v, o); return el; };
    const mk = (label, ic, accent, valEl, sub, unit) => h("div", { class: "kpi glass", style: `--accent:${accent}` }, h("div", { class: "k-lbl", html: `${icon(ic, 16)}<span>${label}</span>` }), h("div", { class: "k-val" }, valEl, unit ? h("small", {}, unit) : null), h("div", { class: "k-sub" }, sub));
    const nodes = h("div", { class: "split-val k-val", style: "font-size:26px;margin:8px 0 2px" }, h("div", {}, num(k.mean_minimax_nodes, { decimals: 0 }), h("em", { style: "color:var(--mm)" }, "Minimax")), h("div", {}, num(k.mean_alphabeta_nodes, { decimals: 0 }), h("em", { style: "color:var(--ab)" }, "Alpha-Beta")));
    return h("div", { class: "kpis" },
      mk("Benchmark scenarios", "database", PALETTE.blue, num(k.scenarios), "positions after cleaning"),
      mk("Avg Minimax time", "cpu", PALETTE.minimax, num(k.mean_minimax_ms, { decimals: 1 }), "mean execution per search", "ms"),
      mk("Avg Alpha-Beta time", "bolt", PALETTE.alphabeta, num(k.mean_alphabeta_ms, { decimals: 1 }), "mean execution per search", "ms"),
      h("div", { class: "kpi glass", style: "--accent:#f472b6" }, h("div", { class: "k-lbl", html: `${icon("layers", 16)}<span>Avg nodes visited</span>` }), nodes, h("div", { class: "k-sub" }, "mean per scenario")),
      mk("Avg node reduction", "target", PALETTE.green, num(k.mean_nodes_reduced_pct, { decimals: 1 }), `${fmt.int(k.total_pruned_branches)} branches pruned in total`, "%"),
      mk("Avg speedup", "zap", PALETTE.amber, num(k.mean_speedup_ratio, { decimals: 1 }), `${fmt.num(k.aggregate_speedup_ratio, 1)}× on total time`, "×"));
  }

  // ---------------------------------------------------------------- sections
  async function overview(f, C) {
    const k = await api.kpis(f), ins = await api.insights(f);
    const a = h("div"), b = h("div");
    const top = ins.slice(0, 3);
    return [kpiCards(k), h("div", { class: "grid g2" },
      card({ title: "Execution time across scenarios", sub: "Milliseconds per search, each scenario", options: [["line", "Line"], ["area", "Area"], ["bar", "Bar"]], initial: "area", render: (el, t) => chart(el, { type: t, data: scen(C), x: "scenario_id", series: SERIES("minimax_ms", "alphabeta_ms", "both"), yLabel: "ms", tipTitle: tipX, tipFmt: fmt.ms, showLegend: true }) }),
      card({ title: "Alpha-Beta node reduction", sub: "Share of Minimax's nodes that were not visited", render: (el) => chart(el, { type: "bar", data: scen(C), x: "scenario_id", series: [{ key: "reduction_pct", label: "Reduction", color: PALETTE.green }], colorBy: (d) => phaseColor(d.phase), yFmt: (v) => v + "%", tipFmt: (v) => fmt.pct(v), tipTitle: tipX, ref: { value: k.mean_nodes_reduced_pct, label: `mean ${fmt.pct(k.mean_nodes_reduced_pct)}` } }) })),
      h("div", { class: "row spread", style: "margin:28px 0 12px" }, h("h3", {}, "Highlights"), h("a", { class: "btn sm", href: "#/dashboard/insights" }, "All insights")),
      h("div", { class: "insights" }, top.map(insightCard))];
  }

  async function performance(f, C) {
    const sw = algoSwitch(), P = C.phases, ts = C.time_stats;
    const statRows = ["mean", "median", "min", "max"].map((m) => ({ label: m[0].toUpperCase() + m.slice(1), minimax: ts.minimax[m], alphabeta: ts.alphabeta[m] }));
    return [sw, h("div", { class: "grid g2" },
      card({ title: "1 · Execution time by algorithm", sub: "Mean, median, fastest and slowest search", render: (el) => chart(el, { type: "bar", data: statRows, x: "label", series: SERIES("minimax", "alphabeta", algoSel), yLabel: "ms", tipFmt: fmt.ms, showLegend: true }) }),
      card({ title: "2 · Nodes visited", sub: "Positions examined per scenario", options: [["lin", "Linear"], ["log", "Log scale"]], render: (el, c) => chart(el, { type: "bar", data: scen(C), x: "scenario_id", series: SERIES("minimax_nodes", "alphabeta_nodes", algoSel), log: c === "log", tipTitle: tipX, tipFmt: fmt.int, showLegend: true }) }),
      card({ title: "3 · Alpha-Beta node reduction", sub: "Per scenario or as a distribution", options: [["bar", "Per scenario"], ["hist", "Distribution"]], render: (el, c) => c === "bar"
        ? chart(el, { type: "bar", data: scen(C), x: "scenario_id", series: [{ key: "reduction_pct", label: "Reduction", color: PALETTE.green }], colorBy: (d) => phaseColor(d.phase), yFmt: (v) => v + "%", tipFmt: (v) => fmt.pct(v), tipTitle: tipX, ref: { value: scen(C).reduce((a, d) => a + d.reduction_pct, 0) / scen(C).length, label: "mean" } })
        : chart(el, { type: "bar", data: C.reduction_histogram, x: "label", series: [{ key: "count", label: "Scenarios", color: PALETTE.green }], yLabel: "scenarios", tipFmt: fmt.int }) }),
      card({ title: "4 · Execution time across scenarios", sub: "Choose how to draw it", options: [["line", "Line"], ["area", "Area"], ["bar", "Bar"]], initial: "line", render: (el, t) => chart(el, { type: t, data: scen(C), x: "scenario_id", series: SERIES("minimax_ms", "alphabeta_ms", algoSel), yLabel: "ms", tipTitle: tipX, tipFmt: fmt.ms, showLegend: true }) }),
      card({ title: "5 · Performance by game phase", sub: "Average per phase", options: [["nodes", "Nodes"], ["ms", "Time"], ["red", "Reduction"]], render: (el, c) => c === "red"
        ? chart(el, { type: "bar", data: P, x: "phase", series: [{ key: "reduction_pct", label: "Node reduction", color: PALETTE.green }], colorBy: (d) => phaseColor(d.phase), yFmt: (v) => v + "%", tipFmt: (v) => fmt.pct(v), tipExtra: (d) => `<div class="tt-row">Scenarios<b>${d.scenarios}</b></div>` })
        : chart(el, { type: "bar", data: P, x: "phase", series: SERIES(`minimax_${c}`, `alphabeta_${c}`, algoSel), yLabel: c === "ms" ? "ms" : "nodes", tipFmt: c === "ms" ? fmt.ms : fmt.int, showLegend: true, tipExtra: (d) => `<div class="tt-row">Scenarios<b>${d.scenarios}</b></div>` }) }),
      card({ title: "6 · Pruned branches", sub: "Sibling branches skipped by Alpha-Beta", options: [["bar", "Per scenario"], ["scatter", "vs Minimax nodes"]], render: (el, c) => c === "bar"
        ? chart(el, { type: "bar", data: scen(C), x: "scenario_id", series: [{ key: "pruned", label: "Pruned branches", color: "#f87171" }], colorBy: (d) => phaseColor(d.phase), tipTitle: tipX, tipFmt: fmt.int, legendItems: Object.entries(PH).filter(([p]) => P.some((x) => x.phase === p)).map(([p, c2]) => ({ label: p, color: c2 })), showLegend: true })
        : chart(el, { type: "scatter", data: scen(C), scatter: { xKey: "minimax_nodes", yKey: "pruned", label: "Scenario" }, xLabel: "Minimax nodes visited", yLabel: "Branches pruned", colorBy: (d) => phaseColor(d.phase), tipTitle: tipX, legendItems: Object.entries(PH).map(([p, c2]) => ({ label: p, color: c2 })), showLegend: true }) })),
      h("div", { style: "margin-top:18px" }, card({ title: "Paired execution time", sub: "Each dot is one scenario. Points below the dashed line mean Alpha-Beta was faster.", render: (el) => chart(el, { type: "scatter", data: scen(C), scatter: { xKey: "minimax_ms", yKey: "alphabeta_ms", label: "Scenario", diagonal: "equal time" }, xLabel: "Minimax time (ms)", yLabel: "Alpha-Beta time (ms)", colorBy: (d) => phaseColor(d.phase), tipTitle: tipX, legendItems: Object.entries(PH).map(([p, c2]) => ({ label: p, color: c2 })), showLegend: true }) }))];
  }

  async function data(f, C) {
    const O = await api.overview(f), ins = await api.insights(f), d = O.dataset, cl = O.cleaning;
    const kv = (l, v) => h("div", { class: "row spread", style: "padding:6px 0;border-bottom:1px solid var(--line);font-size:14px" }, h("span", { class: "muted" }, l), h("b", {}, v));
    const tbl = (head, rows) => h("div", { class: "tbl-wrap" }, h("table", { class: "data" }, h("thead", {}, h("tr", {}, head.map((t, i) => h("th", { class: i ? "" : "l" }, t)))), h("tbody", {}, rows)));
    const missing = d.missing.filter((m) => /execution|nodes|pruned/.test(m.column));
    return [h("div", { class: "grid g2" },
      h("div", { class: "glass card" }, h("h3", { style: "margin-bottom:10px" }, "Dataset overview"),
        kv("File", d.file), kv("Positions", fmt.int(d.rows)), kv("Columns", d.columns), kv("Phases", Object.entries(d.phases).map(([k, v]) => `${k} ${v}`).join(" · ")), kv("Board sizes", Object.entries(d.board_sizes).map(([k, v]) => `${k} ×${v}`).join(" · ")),
        kv("Blocked cells per position", Object.entries(d.blocked_cells).map(([k, v]) => `${k}: ${v}`).join(" · ")), kv("Moves played (min / mean / max)", `${d.moves_played.min} / ${d.moves_played.mean} / ${d.moves_played.max}`), kv("Terminal positions", d.terminal_positions),
        missing.length ? h("p", { class: "muted", style: "font-size:13px;margin-top:10px" }, `${missing.length} measurement columns in the scenario file are empty by design (${missing[0].missing_pct}% missing). They are filled by running the benchmark, which produces the results analysed here.`) : null),
      h("div", { class: "glass card" }, h("h3", { style: "margin-bottom:10px" }, "Data cleaning summary"),
        kv("Rows loaded from results file", fmt.int(cl.rows_loaded)),
        ...cl.dropped.map((r) => kv(`Dropped: ${r.rule}`, r.rows)), kv("Duplicate scenario IDs", cl.duplicates), kv("Rows after cleaning", fmt.int(cl.rows_clean)),
        h("p", { class: "muted", style: "font-size:13px;margin-top:10px" }, "Rows are removed only if a measurement is missing, infinite, negative (time) or non-positive (node counts). Node reduction and speedup are then derived for every remaining row."),
        h("p", { class: "muted", style: "font-size:13px;margin-top:6px" }, `Selection analysed below: ${C.scenarios.length} scenarios.`))),
      h("div", { class: "glass card", style: "margin-top:18px" }, h("h3", { style: "margin-bottom:10px" }, "Statistical summary"),
        tbl(["Metric", "Mean", "Median", "Min", "Max", "Std dev"], O.statistics.map((r) => h("tr", {}, h("td", {}, r.metric), ...["mean", "median", "min", "max", "std"].map((k) => h("td", {}, r[k] == null ? "–" : fmt.num(r[k], r[k] > 100 ? 0 : 2))))))),
      h("div", { class: "grid g2", style: "margin-top:18px" },
        h("div", { class: "glass card" }, h("h3", { style: "margin-bottom:10px" }, "Algorithm comparison"),
          tbl(["Measure", "Minimax", "Alpha-Beta", "Better"], O.comparison.map((r) => h("tr", {}, h("td", {}, r.metric), h("td", {}, fmt.num(r.minimax, r.minimax > 100 ? 0 : 1)), h("td", {}, fmt.num(r.alphabeta, r.alphabeta > 100 ? 0 : 1)), h("td", {}, h("span", { class: `tag ${r.better === "alphabeta" ? "ab" : r.better === "minimax" ? "mm" : ""}` }, r.better === "alphabeta" ? "Alpha-Beta" : r.better === "minimax" ? "Minimax" : "Tie")))))),
        h("div", { class: "glass card" }, h("h3", { style: "margin-bottom:10px" }, "Performance insights"), h("div", { class: "stack", style: "gap:12px" }, ins.slice(0, 4).map((i) => h("div", {}, h("b", {}, i.title), h("p", { class: "muted", style: "font-size:13.5px" }, i.text))))))];
  }

  const insightCard = (i) => h("div", { class: `insight glass ${i.tone}` }, h("h3", {}, i.title), h("p", {}, i.text), h("div", { class: "im" }, h("span", {}, i.metric.label), h("b", {}, i.metric.value)));
  async function insights(f) {
    const ins = await api.insights(f);
    return [h("p", { class: "muted", style: "margin-bottom:16px" }, "Generated from the filtered rows each time: change a filter and the text and numbers update."), h("div", { class: "insights" }, ins.map(insightCard))];
  }

  async function explorer(f, C) {
    let sortKey = "scenario_id", dir = 1, q = "";
    const cols = [["scenario_id", "Scenario", (v) => v], ["phase", "Phase", (v) => v], ["minimax_ms", "Minimax ms", (v) => fmt.num(v, 1)], ["alphabeta_ms", "Alpha-Beta ms", (v) => fmt.num(v, 1)], ["minimax_nodes", "Minimax nodes", fmt.int], ["alphabeta_nodes", "Alpha-Beta nodes", fmt.int], ["pruned", "Pruned", fmt.int], ["reduction_pct", "Reduction", (v) => fmt.pct(v)], ["speedup", "Speedup", (v) => (v == null ? "–" : v.toFixed(1) + "×")]];
    const tb = h("tbody"), head = h("tr");
    const draw = () => {
      head.replaceChildren(...cols.map(([k, l], i) => h("th", { class: `sortable ${i ? "" : "l"}`, onClick: () => { dir = sortKey === k ? -dir : 1; sortKey = k; draw(); }, "aria-sort": sortKey === k ? (dir > 0 ? "ascending" : "descending") : "none" }, l + (sortKey === k ? (dir > 0 ? " ▲" : " ▼") : ""))));
      const rows = scen(C).filter((r) => r.scenario_id.toLowerCase().includes(q) || r.phase.includes(q)).sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * dir);
      tb.replaceChildren(...rows.map((r) => h("tr", { tabindex: 0, onClick: () => open(r), onKeydown: (e) => e.key === "Enter" && open(r) }, ...cols.map(([k, , fm], i) => h("td", { class: i ? "" : "l" }, k === "phase" ? h("span", { class: "tag", style: `color:${phaseColor(r.phase)};border-color:${phaseColor(r.phase)}66` }, r.phase) : fm(r[k]))))));
      if (!rows.length) tb.append(h("tr", {}, h("td", { colspan: cols.length, class: "l" }, "No scenarios match this search.")));
    };
    const search = h("input", { type: "text", placeholder: "Search scenario or phase", style: "max-width:260px", "aria-label": "Search scenarios" });
    search.addEventListener("input", () => { q = search.value.toLowerCase(); draw(); });
    draw();
    return h("div", { class: "glass card" }, h("div", { class: "row spread", style: "margin-bottom:12px" }, h("p", { class: "muted" }, "Click a row to see its board and re-run both algorithms live."), search), h("div", { class: "tbl-wrap" }, h("table", { class: "data click" }, h("thead", {}, head), tb)));
  }

  async function open(r) {
    const drawer = h("aside", { class: "drawer", role: "dialog", "aria-label": `Scenario ${r.scenario_id}` }); document.body.append(drawer);
    requestAnimationFrame(() => drawer.classList.add("in"));
    const close = () => { drawer.classList.remove("in"); setTimeout(() => drawer.remove(), 300); document.removeEventListener("keydown", esc); };
    const esc = (e) => e.key === "Escape" && close(); document.addEventListener("keydown", esc);
    drawer.append(spinner("Loading scenario"));
    try {
      const sc = await api.scenario(r.scenario_id);
      const live = h("div"), depth = h("select", { "aria-label": "Search depth" }, [1, 2, 3, 4, 5].map((d) => h("option", { value: d, selected: d === 3 }, `Depth ${d}`)));
      const run = h("button", { class: "btn primary sm", onClick: async () => {
        live.replaceChildren(spinner("Running both algorithms")); run.disabled = true;
        try {
          const o = await api.analyzeScenario(sc.id, +depth.value), mm = o.minimax, ab = o.alphabeta;
          live.replaceChildren(h("div", { class: "metric-grid", style: "margin-top:10px" }, [["Minimax nodes", fmt.int(mm.nodes_visited)], ["Alpha-Beta nodes", fmt.int(ab.nodes_visited)], ["Minimax time", fmt.ms(mm.execution_ms)], ["Alpha-Beta time", fmt.ms(ab.execution_ms)]].map(([l, v]) => h("div", { class: "metric" }, h("span", {}, l), h("b", {}, v)))),
            h("p", { class: "explain", style: "margin-top:10px" }, `Alpha-Beta visited ${fmt.pct((1 - ab.nodes_visited / mm.nodes_visited) * 100)} fewer nodes and ${mm.move === ab.move && mm.score === ab.score ? "agreed with Minimax on move " + (mm.move + 1) + " (score " + mm.score + ")" : "chose a different move"}.`));
        } catch (e) { toast(e.message, "error"); live.replaceChildren(); }
        run.disabled = false;
      } }, "Run live");
      const m = (l, v) => h("div", { class: "metric" }, h("span", {}, l), h("b", {}, v));
      drawer.replaceChildren(h("div", { class: "row spread", style: "margin-bottom:14px" }, h("h3", {}, `Scenario ${sc.id}`), h("button", { class: "icon-btn", "aria-label": "Close", onClick: close, html: icon("x") })),
        h("div", { style: "display:grid;place-items:center;margin-bottom:12px" }, miniBoard(sc.board, { size: 30 })),
        h("p", { class: "muted", style: "font-size:13.5px;margin-bottom:14px" }, `${sc.phase} phase · ${sc.rows}×${sc.columns} · ${sc.moves_played} moves played · ${NAME(sc.current_player)} to move`),
        h("h4", { style: "margin-bottom:8px" }, "Stored benchmark result"),
        h("div", { class: "metric-grid" }, m("Minimax nodes", fmt.int(r.minimax_nodes)), m("Alpha-Beta nodes", fmt.int(r.alphabeta_nodes)), m("Minimax time", fmt.ms(r.minimax_ms)), m("Alpha-Beta time", fmt.ms(r.alphabeta_ms)), m("Pruned branches", fmt.int(r.pruned)), m("Node reduction", fmt.pct(r.reduction_pct))),
        h("div", { class: "bar-meter", "aria-hidden": "true" }, h("i", { style: `width:${r.reduction_pct}%` })),
        h("h4", { style: "margin:20px 0 8px" }, "Run it again now"), h("div", { class: "row" }, depth, run), live,
        h("p", { class: "dim", style: "font-size:12.5px;margin-top:10px" }, "Live runs are fresh measurements on this machine. Node counts are deterministic; times vary."));
    } catch (e) { toast(e.message, "error"); close(); }
  }
  const NAME = (p) => (p === 1 ? "Red" : "Yellow");

  // ---------------------------------------------------------------- run benchmark
  function runBenchmarkDialog() {
    const depth = h("select", {}, [[2, "Depth 2 · seconds"], [3, "Depth 3 · about 10 s"], [4, "Depth 4 · about 15–30 s"], [5, "Depth 5 · a few minutes"]].map(([v, l]) => h("option", { value: v, selected: v === 3 }, l)));
    const scope = h("select", {}, [["all", `All ${options.scenarios.length} scenarios`], ["sel", F.scenarios.length ? `Selected scenarios (${F.scenarios.length})` : "Selected scenarios (none chosen)"]].map(([v, l]) => h("option", { value: v, disabled: v === "sel" && !F.scenarios.length }, l)));
    const status = h("div"), go = h("button", { class: "btn primary", onClick: start, html: `${icon("zap", 16)} Start benchmark` });
    const m = modal("Run a new benchmark", h("div", { class: "stack" }, h("p", { class: "muted", style: "font-size:14px" }, "Runs your Minimax and Alpha-Beta search on the dataset positions and checks they agree. Results are saved to data/runs and appear in the data source list. The shipped results are never overwritten."),
      h("label", { class: "field" }, h("span", {}, "Search depth"), depth), h("label", { class: "field" }, h("span", {}, "Scenarios"), scope), status, go));
    async function start() {
      go.disabled = true; depth.disabled = scope.disabled = true;
      try {
        let job = await api.runBenchmark(+depth.value, scope.value === "sel" ? F.scenarios : null);
        const meter = h("div", { class: "bar-meter" }, h("i", { style: "width:0" })), label = h("p", { class: "muted", style: "font-size:13px" }, "Starting…");
        status.replaceChildren(label, meter);
        while (job.status === "running") {
          await new Promise((r) => setTimeout(r, 500)); job = await api.job(job.id);
          meter.firstChild.style.width = `${(job.done / job.total) * 100}%`; label.textContent = `Completed ${job.done} of ${job.total}${job.current ? ` · ${job.current}` : ""}`;
        }
        if (job.status === "error") throw new Error(job.error);
        sources = await api.sources(); F.source = job.source; save(); await refreshOptions(); m.close();
        toast("Benchmark finished. Showing the new run.", "success"); if (alive) load();
      } catch (e) { toast(e.message, "error"); status.replaceChildren(h("p", { style: "color:#fca5a5" }, e.message)); go.disabled = false; depth.disabled = scope.disabled = false; }
    }
  }
  return () => { alive = false; document.querySelectorAll(".drawer").forEach((d) => d.remove()); };
}
