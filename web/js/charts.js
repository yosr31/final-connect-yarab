// Tiny interactive SVG chart library (bar, line, area, scatter) with tooltips, legends,
// log scale and responsive sizing. Purpose-built so the site needs no JS dependencies.
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent && parent.append(e); return e; };
export const PALETTE = { minimax: "#8b5cf6", alphabeta: "#22d3ee", blue: "#4f8cff", pink: "#f472b6", amber: "#fbbf24", green: "#34d399" };

let tip;
function tooltip() { if (!tip) { tip = document.createElement("div"); tip.className = "chart-tip"; document.body.append(tip); } return tip; }
function showTip(html, x, y) { const t = tooltip(); t.innerHTML = html; t.style.opacity = 1; const r = t.getBoundingClientRect(); t.style.left = Math.min(innerWidth - r.width - 8, x + 14) + "px"; t.style.top = Math.max(8, y - r.height - 10) + "px"; }
const hideTip = () => tip && (tip.style.opacity = 0);

function niceTicks(max, n = 5) {
  if (max <= 0) return [0, 1];
  const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = []; for (let v = 0; v <= max + step * 0.999; v += step) out.push(+v.toFixed(10));
  return out;
}
const compact = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(0) + "k" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "k" : String(+v.toFixed(2)));

/**
 * opts: { type, data, x, series:[{key,label,color}], yLabel, yFmt, log, height, ref:{value,label},
 *         xLabel, scatter:{xKey,yKey,label,diagonal}, colorBy:(row)=>color }
 */
export function chart(container, opts) {
  container.classList.add("chart");
  const draw = () => render(container, opts);
  container._ro?.disconnect();
  const ro = new ResizeObserver(() => { if (container.clientWidth !== container._w) { container._w = container.clientWidth; draw(); } });
  ro.observe(container); container._ro = ro; container._w = container.clientWidth; draw();
}

function render(container, o) {
  container.innerHTML = "";
  const W = Math.max(280, container.clientWidth), H = o.height || 300;
  const m = { t: 14, r: 14, b: o.type === "scatter" ? 44 : 52, l: 56 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": o.title || "chart" }, container);
  const g = svgEl("g", { transform: `translate(${m.l},${m.t})` }, svg);
  const series = o.series || [];
  const fmtY = o.yFmt || compact;

  // ---- scales
  let yMax, yScale, ticks;
  const vals = o.type === "scatter" ? o.data.map((d) => d[o.scatter.yKey]) : series.flatMap((s) => o.data.map((d) => d[s.key] ?? 0));
  const refV = o.ref ? o.ref.value : 0;
  const maxV = Math.max(...vals, refV, 1e-9);
  if (o.log && o.type !== "scatter") {
    const minV = Math.max(1, Math.min(...vals.filter((v) => v > 0)));
    const lo = Math.pow(10, Math.floor(Math.log10(minV))), hi = Math.pow(10, Math.ceil(Math.log10(maxV)));
    ticks = []; for (let v = lo; v <= hi * 1.001; v *= 10) ticks.push(v);
    yScale = (v) => ih - ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo) || 1)) * ih;
  } else {
    ticks = niceTicks(maxV * 1.04); yMax = ticks[ticks.length - 1];
    yScale = (v) => ih - (v / yMax) * ih;
  }
  for (const t of ticks) {
    svgEl("line", { x1: 0, x2: iw, y1: yScale(t), y2: yScale(t), class: "gl" }, g);
    svgEl("text", { x: -8, y: yScale(t) + 4, "text-anchor": "end", class: "tick" }, g).textContent = fmtY(t);
  }
  if (o.yLabel) { const t = svgEl("text", { transform: `translate(-44,${ih / 2}) rotate(-90)`, "text-anchor": "middle", class: "axis-title" }, g); t.textContent = o.yLabel; }

  if (o.type === "scatter") return scatter(container, g, svg, o, iw, ih, ticks, yScale, W, H, m);

  const n = o.data.length, band = iw / n;
  const labels = o.data.map((d) => d[o.x]);
  const step = Math.ceil(n / Math.max(1, Math.floor(iw / 46)));
  labels.forEach((l, i) => {
    if (i % step) return;
    const t = svgEl("text", { x: band * i + band / 2, y: ih + 16, "text-anchor": n > 12 ? "end" : "middle", class: "tick", transform: n > 12 ? `rotate(-40 ${band * i + band / 2} ${ih + 16})` : "" }, g);
    t.textContent = l;
  });
  if (o.xLabel) svgEl("text", { x: iw / 2, y: H - m.t - 2, "text-anchor": "middle", class: "axis-title" }, g).textContent = o.xLabel;

  const base = o.log ? ih : yScale(0);
  if (o.type === "bar") {
    const k = series.length, pad = Math.min(8, band * 0.18), bw = (band - pad * 2) / k;
    series.forEach((s, si) => o.data.forEach((d, i) => {
      const v = d[s.key] ?? 0, y = yScale(v);
      const color = (o.colorBy && k === 1) ? o.colorBy(d) : s.color;
      const r = svgEl("rect", { x: band * i + pad + bw * si, y: base, width: Math.max(1, bw - 1), height: 0, rx: Math.min(3, bw / 3), fill: color, class: "bar" }, g);
      requestAnimationFrame(() => { r.setAttribute("y", Math.min(y, base)); r.setAttribute("height", Math.max(0, Math.abs(base - y))); });
    }));
  } else {
    series.forEach((s) => {
      const pts = o.data.map((d, i) => [band * i + band / 2, yScale(d[s.key] ?? 0)]);
      const dPath = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      if (o.type === "area") {
        const gid = "g" + Math.random().toString(36).slice(2, 8);
        const defs = svgEl("defs", {}, g); const lg = svgEl("linearGradient", { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
        svgEl("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": 0.45 }, lg); svgEl("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": 0.02 }, lg);
        svgEl("path", { d: dPath + ` L${pts[pts.length - 1][0]} ${base} L${pts[0][0]} ${base} Z`, fill: `url(#${gid})` }, g);
      }
      svgEl("path", { d: dPath, fill: "none", stroke: s.color, "stroke-width": 2.2, "stroke-linejoin": "round", class: "line" }, g);
      if (n <= 40) pts.forEach((p) => svgEl("circle", { cx: p[0], cy: p[1], r: 3, fill: "#0a1124", stroke: s.color, "stroke-width": 1.8 }, g));
    });
  }
  if (o.ref) {
    const y = yScale(o.ref.value);
    svgEl("line", { x1: 0, x2: iw, y1: y, y2: y, class: "ref" }, g);
    svgEl("text", { x: iw - 4, y: y - 6, "text-anchor": "end", class: "ref-label" }, g).textContent = o.ref.label;
  }

  // ---- hover: one guide per category
  const guide = svgEl("rect", { y: 0, height: ih, width: band, fill: "rgba(255,255,255,.06)", opacity: 0, "pointer-events": "none" }, g);
  const hit = svgEl("rect", { width: iw, height: ih, fill: "transparent" }, g);
  hit.addEventListener("pointermove", (e) => {
    const r = hit.getBoundingClientRect(); const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    const d = o.data[i]; guide.setAttribute("x", band * i); guide.setAttribute("opacity", 1);
    const rows = series.map((s) => `<div class="tt-row"><i style="background:${s.color}"></i>${s.label}<b>${(o.tipFmt || fmtY)(d[s.key])}</b></div>`).join("");
    showTip(`<div class="tt-title">${o.tipTitle ? o.tipTitle(d) : d[o.x]}</div>${rows}${o.tipExtra ? o.tipExtra(d) : ""}`, e.clientX, e.clientY);
  });
  hit.addEventListener("pointerleave", () => { guide.setAttribute("opacity", 0); hideTip(); });
  legend(container, series, o);
}

function scatter(container, g, svg, o, iw, ih, ticks, yScale, W, H, m) {
  const { xKey, yKey, label, diagonal } = o.scatter;
  const xs = o.data.map((d) => d[xKey]); const xTicks = niceTicks(Math.max(...xs, 1e-9) * 1.04), xMax = xTicks[xTicks.length - 1];
  const xScale = (v) => (v / xMax) * iw;
  xTicks.forEach((t) => { svgEl("line", { x1: xScale(t), x2: xScale(t), y1: 0, y2: ih, class: "gl" }, g); svgEl("text", { x: xScale(t), y: ih + 16, "text-anchor": "middle", class: "tick" }, g).textContent = compact(t); });
  svgEl("text", { x: iw / 2, y: ih + 36, "text-anchor": "middle", class: "axis-title" }, g).textContent = o.xLabel || xKey;
  if (diagonal) { const lim = Math.min(xMax, ticks[ticks.length - 1]); svgEl("line", { x1: xScale(0), y1: yScale(0), x2: xScale(lim), y2: yScale(lim), class: "ref" }, g); svgEl("text", { x: xScale(lim) - 4, y: yScale(lim) + 14, "text-anchor": "end", class: "ref-label" }, g).textContent = diagonal; }
  const dots = o.data.map((d) => { const c = svgEl("circle", { cx: xScale(d[xKey]), cy: yScale(d[o.scatter.yKey]), r: 5, fill: o.colorBy ? o.colorBy(d) : PALETTE.blue, "fill-opacity": 0.8, stroke: "#0a1124", "stroke-width": 1, class: "dot" }, g); c._d = d; return c; });
  g.addEventListener("pointermove", (e) => { const t = e.target; if (!t._d) return; showTip(`<div class="tt-title">${o.tipTitle ? o.tipTitle(t._d) : label}</div><div class="tt-row">${o.xLabel}<b>${compact(t._d[xKey])}</b></div><div class="tt-row">${o.yLabel}<b>${compact(t._d[o.scatter.yKey])}</b></div>`, e.clientX, e.clientY); });
  g.addEventListener("pointerleave", hideTip);
  if (o.legendItems) legend(container, o.legendItems, o);
}

function legend(container, items, o) {
  if (!items.length || (items.length === 1 && !o.showLegend)) return;
  const l = document.createElement("div"); l.className = "legend";
  l.innerHTML = items.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("");
  container.append(l);
}
