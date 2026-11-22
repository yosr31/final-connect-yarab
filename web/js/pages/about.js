import { h } from "../ui.js";

const EP = [
  ["POST", "/api/games", "Start a game (size, blocked cells, Pop Out, vs AI)"], ["GET", "/api/games/{id}", "Current board state"],
  ["GET", "/api/games/{id}/valid-moves", "Legal drops, pop-outs, removals, heavy pairs"], ["POST", "/api/games/{id}/move", "Drop a piece"],
  ["POST", "/api/games/{id}/pop-out", "Pop Out"], ["POST", "/api/games/{id}/remove-opponent", "Power-up"], ["POST", "/api/games/{id}/heavy-piece", "Power-up"],
  ["POST", "/api/games/{id}/undo", "Undo"], ["POST", "/api/games/{id}/restart", "Restart round (keeps scores)"], ["POST", "/api/games/{id}/ai-move", "AI plays (algorithm, depth)"],
  ["POST", "/api/ai/tree", "Instrumented search tree"], ["GET", "/api/ai/depth-comparison", "Both algorithms across depths"],
  ["POST", "/api/benchmark/run", "Run a real benchmark job"], ["GET", "/api/dashboard/kpis", "KPIs"], ["GET", "/api/dashboard/charts", "Chart series"],
  ["GET", "/api/dashboard/overview", "Dataset, cleaning, statistics"], ["GET", "/api/dashboard/insights", "Generated insights"],
];

export function mount(root) {
  root.append(
    h("div", { class: "page-head" }, h("div", {}, h("h1", {}, "About the project"), h("p", {}, "A web front end for the Connect 4 AI and Data Science project."))),
    h("div", { class: "grid g2" },
      h("div", { class: "glass card prose" },
        h("h3", {}, "Architecture"),
        h("p", {}, "The ", h("code", {}, "connect4/"), " package is unchanged: board, rules, power-ups, Minimax and Alpha-Beta. A FastAPI layer in ", h("code", {}, "backend/"), " exposes it over REST. This website is plain HTML, CSS and JavaScript in ", h("code", {}, "web/"), ", with no game logic in the browser."),
        h("h3", {}, "How the algorithms differ"),
        h("p", {}, "Minimax scores every move down to the chosen depth. Alpha-Beta keeps two bounds, alpha (best score the maximizer can already force) and beta (best the minimizer can force). When alpha reaches beta the rest of that branch cannot change the decision, so it is skipped. Both use the same move ordering and heuristic, and the benchmark checks that they pick the same move and score."),
        h("h3", {}, "Data"),
        h("p", {}, "The dashboard reads ", h("code", {}, "benchmark_results.csv"), " (30 positions, depth 4) or any run you start from the dashboard. Cleaning uses the same rules as ", h("code", {}, "analyze.py"), ". Node counts are deterministic; timings depend on your machine."),
        h("h3", {}, "Scope and limits"),
        h("p", {}, "The search models standard drops only. In AI games Pop Out and power-ups are disabled so the AI never faces moves it cannot reason about. The benchmark dataset has no blocked cells and no power-up moves, so it makes no claims about those mechanics.")),
      h("div", { class: "glass card" }, h("h3", { style: "margin-bottom:12px" }, "API endpoints"), h("div", { class: "endpoints" }, EP.map(([m, p, d]) => h("div", {}, h("b", {}, m), h("code", {}, p), h("span", {}, d)))),
        h("p", { class: "muted", style: "margin-top:12px;font-size:13px" }, "Interactive API docs are available at /docs."))));
}
