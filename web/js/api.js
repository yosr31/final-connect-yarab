// Thin REST client. All game rules and AI search run in Python.
async function call(method, url, body) {
  let res;
  try {
    res = await fetch("/api" + url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Cannot reach the backend. Is `uvicorn backend.main:app` running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed");
  return data;
}
const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) p.set(k, Array.isArray(v) ? v.join(",") : v); const s = p.toString(); return s ? "?" + s : ""; };

export const api = {
  health: () => call("GET", "/health"),
  newGame: (o) => call("POST", "/games", o),
  state: (id) => call("GET", `/games/${id}`),
  move: (id, column) => call("POST", `/games/${id}/move`, { column }),
  popOut: (id, column) => call("POST", `/games/${id}/pop-out`, { column }),
  removeOpponent: (id, row, col) => call("POST", `/games/${id}/remove-opponent`, { row, col }),
  heavy: (id, a, b) => call("POST", `/games/${id}/heavy-piece`, { first_column: a, second_column: b }),
  undo: (id, steps = 1) => call("POST", `/games/${id}/undo`, { steps }),
  restart: (id) => call("POST", `/games/${id}/restart`),
  reset: (id) => call("POST", `/games/${id}/reset`),
  aiMove: (id, o) => call("POST", `/games/${id}/ai-move`, o),
  demo: (seed) => call("GET", `/demo-game?seed=${seed}`),
  scenarios: () => call("GET", "/scenarios"),
  scenario: (id) => call("GET", `/scenarios/${id}`),
  tree: (o) => call("POST", "/ai/tree", o),
  depthComparison: (sid, max) => call("GET", `/ai/depth-comparison${qs({ scenario_id: sid, max_depth: max })}`),
  analyzeScenario: (sid, depth) => call("POST", `/ai/analyze-scenario${qs({ scenario_id: sid, depth })}`),
  sources: () => call("GET", "/dashboard/sources"),
  kpis: (f) => call("GET", "/dashboard/kpis" + qs(f)),
  charts: (f) => call("GET", "/dashboard/charts" + qs(f)),
  overview: (f) => call("GET", "/dashboard/overview" + qs(f)),
  insights: (f) => call("GET", "/dashboard/insights" + qs(f)),
  runBenchmark: (depth, scenario_ids) => call("POST", "/benchmark/run", { depth, scenario_ids }),
  job: (id) => call("GET", `/benchmark/jobs/${id}`),
};
