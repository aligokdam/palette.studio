/* =====================================================================
   Palette Studio: home page and routing
   ---------------------------------------------------------------------
   Three routes in one document:
     #/         home page (also any other hash, e.g. #features)
     #/camera   the camera, opened right away
     #/terms    terms of use
   ===================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var App = window.PaletteStudio, Cam = window.PSCamera, P = window.PSPalette;
  var home = document.getElementById("home");
  if (!home || !App || !Cam) return;

  /* The current route is kept here, not read back from location.hash, because embedded
     previews (and some in-app browsers) refuse hash navigation. Every in-page link is
     handled in script, so the routes work everywhere; the address bar follows when it can. */
  var current = location.hash || "#/";

  function routeFromHash() {
    if (/^#\/camera/.test(current)) return "camera";
    if (/^#\/terms/.test(current)) return "terms";
    return "home";
  }
  function sectionFromHash() {
    var m = /^#([a-z][\w-]*)$/i.exec(current);
    var target = m && document.getElementById(m[1]);
    return target && home.contains(target) ? target : null;
  }

  function applyRoute(initial) {
    var next = routeFromHash();
    var prev = root.getAttribute("data-route");
    root.setAttribute("data-route", next);
    if (next === "camera") { App.closeSheet(); Cam.start(); document.getElementById("cam").focus({ preventScroll: true }); }
    else Cam.stop();
    if (!initial && prev !== next) {
      if (next !== "camera") App.closeSheet();
      var section = next === "home" && sectionFromHash();
      if (section) section.scrollIntoView();
      else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      var heading = next === "terms" ? document.querySelector(".terms-title") : next === "home" ? document.getElementById("heroTitle") : null;
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  function navigate(hash) {
    if (hash === current) { applyRoute(false); return; }
    current = hash;
    try { history.pushState(null, "", hash); } catch (e) { /* the frame may refuse; the route still changes */ }
    applyRoute(false);
  }
  function onHistory() { current = location.hash || "#/"; applyRoute(false); }
  window.addEventListener("hashchange", onHistory);
  window.addEventListener("popstate", onHistory);
  window.PSNavigate = navigate;

  document.getElementById("homeThemeBtn").addEventListener("click", function () { App.toggleTheme(); });
  document.getElementById("homeLangBtn").addEventListener("click", function () { App.openSheet("language"); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    var href = a.getAttribute("href");
    // The logo on the home page scrolls back to the top.
    if (a.classList.contains("logo") && routeFromHash() === "home") { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (/^#\//.test(href)) { navigate(href); return; }
    // Section links (#how, #features, #faq) scroll on the home page.
    var target = document.getElementById(href.slice(1));
    if (routeFromHash() !== "home") navigate("#/");
    if (target) target.scrollIntoView({ behavior: "smooth" });
  });

  var nav = document.getElementById("homeNav");
  function onScroll() { nav.classList.toggle("scrolled", window.scrollY > 4); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------ hero: a live demo */
  // Painted scenes stand in for the camera; their palettes come from the same extractor.
  var SCENES = [
    ["#f3ead8", "#c9b79a", "#6f7d4f", "#2f4a22", "#14200f"],   // plants by a window
    ["#ffd7a8", "#ff8a5b", "#d9485f", "#5b2a6e", "#1d1442"],   // sunset
    ["#e6f4f1", "#8fd3d1", "#2f8fa3", "#1f4e79", "#0d1b2a"],   // sea
    ["#f7e9e3", "#e9b8a9", "#b5838d", "#6d6875", "#2b2d42"],   // dusk interior
  ];
  var scenes = document.querySelectorAll(".hero-scene"), grids = document.querySelectorAll(".mini-grid");
  var cv = document.createElement("canvas"), ctx = cv.getContext("2d", { willReadFrequently: true });
  cv.width = 160; cv.height = 120;
  var cells = [];
  grids.forEach(function (g) {
    var row = [];
    for (var i = 0; i < 30; i++) { var s = document.createElement("span"); g.appendChild(s); row.push(s); }
    cells.push(row);
  });

  function paintScene(colors, seed) {
    var g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    colors.forEach(function (c, k) { g.addColorStop(k / (colors.length - 1), c); });
    ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    for (var b = 0; b < 8; b++) {
      var x = (Math.sin(seed * 7 + b * 2.1) * 0.5 + 0.5) * cv.width, y = (Math.cos(seed * 3 + b * 1.7) * 0.5 + 0.5) * cv.height;
      var r = 16 + (b % 3) * 14, rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, colors[(b + seed) % colors.length]); rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.75; ctx.fillStyle = rg; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1;
    }
    var bg = "center / cover no-repeat url(" + cv.toDataURL("image/jpeg", 0.85) + ")";
    scenes.forEach(function (el) { el.style.background = bg; });
    var pal = P.rankGrid(P.extract(ctx.getImageData(0, 0, cv.width, cv.height).data, 30));
    cells.forEach(function (row) { pal.forEach(function (c, k) { row[k].style.backgroundColor = P.hex(c); }); });
  }
  var sceneIndex = 0;
  paintScene(SCENES[0], 0);
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) setInterval(function () {
    if (document.hidden || routeFromHash() !== "home") return;
    sceneIndex = (sceneIndex + 1) % SCENES.length;
    paintScene(SCENES[sceneIndex], sceneIndex);
  }, 3200);

  applyRoute(true);
})();
