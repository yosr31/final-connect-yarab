// Small DOM helpers, icons, toasts, counters, modal. No dependencies.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

const P = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  play: "M6 4l14 8-14 8z",
  cpu: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M7 7h10v10H7z",
  tree: "M12 3v6M12 9H5v4M12 9h7v4M5 13v4M19 13v4M3 17h4M17 17h4",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  info: "M12 8h.01M11 12h1v5h1M12 22a10 10 0 100-20 10 10 0 000 20z",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  restart: "M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5",
  zap: "M13 2L3 14h8l-1 8 10-12h-8z",
  menu: "M4 6h16M4 12h16M4 18h16",
  x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  pause: "M8 5v14M16 5v14",
  step: "M5 4l10 8-10 8zM19 5v14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  arrow: "M5 12h14M13 6l6 6-6 6",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0012 2z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  target: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 13a1 1 0 100-2 1 1 0 000 2z",
};
export const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || ""}"/></svg>`;

// ---------- formatting
export const fmt = {
  int: (n) => (n == null ? "–" : Math.round(n).toLocaleString("en-US")),
  num: (n, d = 1) => (n == null ? "–" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })),
  ms: (n) => (n == null ? "–" : n >= 100 ? `${Math.round(n)} ms` : `${Number(n).toFixed(1)} ms`),
  pct: (n, d = 1) => (n == null ? "–" : `${Number(n).toFixed(d)}%`),
};

// ---------- toasts
export function toast(message, kind = "info", ms = 3600) {
  const host = document.getElementById("toasts");
  const t = h("div", { class: `toast ${kind}`, role: "status" }, h("span", { class: "ti", html: icon(kind === "error" ? "x" : kind === "success" ? "check" : "info", 16) }), h("span", {}, message));
  host.append(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- animated counter (respects reduced motion)
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export function countUp(el, to, { decimals = 0, suffix = "", duration = 1100 } = {}) {
  const show = (v) => (el.textContent = Number(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix);
  if (to == null || reduce()) return show(to ?? 0);
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    show(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- modal
export function modal(title, body, { wide = false } = {}) {
  const close = () => { wrap.classList.remove("in"); setTimeout(() => wrap.remove(), 220); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => e.key === "Escape" && close();
  const wrap = h("div", { class: "modal-wrap", onClick: (e) => e.target === wrap && close() },
    h("div", { class: `modal glass ${wide ? "wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "modal-head" }, h("h3", {}, title), h("button", { class: "icon-btn", "aria-label": "Close", onClick: close, html: icon("x") })),
      body));
  document.body.append(wrap);
  document.addEventListener("keydown", onKey);
  requestAnimationFrame(() => wrap.classList.add("in"));
  return { close, el: wrap };
}

export const spinner = (label = "Loading") => h("div", { class: "loading" }, h("div", { class: "spin" }), h("span", {}, label));
export const empty = (title, text, action) => h("div", { class: "empty" }, h("div", { class: "empty-mark", html: icon("database", 28) }), h("strong", {}, title), h("p", {}, text), action);
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
