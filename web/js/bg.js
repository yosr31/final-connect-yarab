// Animated background: drifting gradient glows (CSS) + a light particle network that reacts to the mouse.
export function startBackground(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mouse = { x: -9999, y: -9999 };
  let w = 0, h = 0, dpr = 1, parts = [], raf = 0, running = true;
  const COLORS = ["79,140,255", "139,92,246", "34,211,238"];

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, Math.max(28, (w * h) / 22000)));
    parts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6, c: COLORS[(Math.random() * 3) | 0],
    }));
  }

  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 22000) { const f = (1 - d2 / 22000) * 0.9; const d = Math.sqrt(d2) || 1; p.vx += (dx / d) * f * 0.05; p.vy += (dy / d) * f * 0.05; }
      p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx + (reduced ? 0 : 0); p.y += p.vy;
      if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
    }
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < 9000) { ctx.strokeStyle = `rgba(${a.c},${(1 - d2 / 9000) * 0.22})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      ctx.fillStyle = `rgba(${a.c},0.85)`; ctx.shadowColor = `rgba(${a.c},0.9)`; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    }
    if (!reduced) raf = requestAnimationFrame(frame);
  }

  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  addEventListener("pointerleave", () => { mouse.x = mouse.y = -9999; });
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running && !reduced) frame(); });
  // soft parallax on the CSS glows
  if (!reduced) addEventListener("pointermove", (e) => {
    document.documentElement.style.setProperty("--mx", ((e.clientX / innerWidth - 0.5) * 40).toFixed(1) + "px");
    document.documentElement.style.setProperty("--my", ((e.clientY / innerHeight - 0.5) * 40).toFixed(1) + "px");
  }, { passive: true });
  resize(); frame();
}
