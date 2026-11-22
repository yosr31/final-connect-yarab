import { h, icon, toast } from "./ui.js";
import { api } from "./api.js";
import { startBackground } from "./bg.js";

const NAV = [
  { group: "Play" },
  { id: "play", path: "#/play", label: "Play Game", icon: "play" },
  { id: "ai", path: "#/ai", label: "Play Against AI", icon: "cpu" },
  { group: "Analyze" },
  { id: "analytics", path: "#/analytics", label: "AI Analytics", icon: "tree" },
  { id: "dashboard", path: "#/dashboard", label: "Data Science Dashboard", icon: "chart" },
  { id: "about", path: "#/about", label: "About Project", icon: "info" },
];
export const DASH_SECTIONS = [
  ["overview", "Overview"], ["performance", "Performance"], ["data", "Data analysis"], ["insights", "Insights"], ["explorer", "Scenario explorer"],
];
const PAGES = {
  "": () => import("./pages/home.js"), play: () => import("./pages/play.js"), ai: () => import("./pages/ai.js"),
  analytics: () => import("./pages/analytics.js"), dashboard: () => import("./pages/dashboard.js"), about: () => import("./pages/about.js"),
};

const view = document.getElementById("view");
let cleanup = null, token = 0;

function buildNav(active, sub) {
  const side = document.getElementById("sidebar");
  side.replaceChildren(
    h("a", { class: "brand", href: "#/" }, h("span", { class: "brand-mark" }, h("i"), h("i"), h("i"), h("i")), h("span", {}, "Connect 4 ", h("b", {}, "AI"))),
    h("a", { class: `nav-link ${active === "" ? "active" : ""}`, href: "#/", html: `${icon("home")}<span>Home</span>` }),
    ...NAV.flatMap((n) => {
      if (n.group) return [h("div", { class: "nav-group" }, n.group)];
      const items = [h("a", { class: `nav-link ${active === n.id ? "active" : ""}`, href: n.path, html: `${icon(n.icon)}<span>${n.label}</span>` })];
      if (n.id === "dashboard" && active === "dashboard")
        DASH_SECTIONS.forEach(([k, label]) => items.push(h("a", { class: `nav-link sub ${sub === k ? "active" : ""}`, href: `#/dashboard/${k}` }, label)));
      return items;
    }),
    h("div", { class: "side-foot" }, h("span", { class: "dot" }), "Python engine online", h("div", { class: "dim" }, "Game rules and AI search run on the server.")));
}

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const page = parts[0] in PAGES ? parts[0] : "";
  const sub = parts[1] || "";
  const my = ++token;
  cleanup?.(); cleanup = null;
  document.body.classList.toggle("landing", page === "");
  document.body.classList.remove("nav-open");
  buildNav(page, page === "dashboard" ? sub || "overview" : "");
  view.replaceChildren();
  try {
    const mod = await PAGES[page]();
    if (my !== token) return;
    view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter");
    cleanup = (await mod.mount(view, { sub })) || null;
    window.scrollTo({ top: 0 });
  } catch (e) {
    console.error(e);
    toast(e.message || "Something went wrong loading this page.", "error", 6000);
  }
  document.title = `${page ? (NAV.find((n) => n.id === page)?.label || "Connect 4") + " · " : ""}Connect 4 AI`;
}

function init() {
  document.getElementById("menuBtn").innerHTML = icon("menu");
  document.getElementById("menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  document.getElementById("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
  const tl = document.getElementById("topLinks");
  tl.replaceChildren(...NAV.filter((n) => n.id).map((n) => h("a", { href: n.path }, n.label)));
  const mq = matchMedia("(max-width: 980px)");
  const setMobile = () => document.body.classList.toggle("mobile-nav", mq.matches);
  mq.addEventListener("change", setMobile); setMobile();
  startBackground(document.getElementById("bg"));
  addEventListener("hashchange", route);
  route();
  api.health().catch(() => toast("Backend not reachable. Start it with: uvicorn backend.main:app", "error", 9000))
    .finally(() => setTimeout(() => document.getElementById("splash").classList.add("out"), 450));
}
init();
