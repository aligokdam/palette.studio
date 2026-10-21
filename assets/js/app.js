/* =====================================================================
   Palette Studio: application shell
   ---------------------------------------------------------------------
   Language, theme, the shared sheet (Language, Privacy, Guide, Export),
   the toast and the FAQ. The camera lives in camera.js, the colors in
   palette.js and the files in export.js.
   ===================================================================== */
(function () {
  "use strict";

  var VERSION = "1.0.0";
  var FAQ_COUNT = 4;
  var ASSET_QS = (function () {
    var src = document.currentScript && document.currentScript.src || "";
    var i = src.indexOf("?");
    return i === -1 ? "" : src.slice(i);
  })();
  var STORAGE = { theme: "preferredTheme", lang: "preferredLanguage", name: "paletteStudio.lastName" };

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } }
  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  var state = { themePref: "dark", lang: "en", exportColors: [] };
  var dom = {
    toast: $("toast"), toastText: $("toastText"),
    sheet: $("sheet"), sheetBackdrop: $("sheetBackdrop"), sheetTitle: $("sheetTitle"), sheetBack: $("sheetBack"),
    sheetBackLabel: $("sheetBackLabel"), sheetDone: $("sheetDone"), sheetBody: $("sheetBody"), langList: $("langList"),
    faqList: $("faqList"), exportPreview: $("exportPreview"), paletteName: $("paletteName"), exportList: $("exportList"),
  };

  /* ============================================================== i18n */
  var LANGUAGES = window.PS_LANGUAGES || [];
  var DICT = window.PS_TRANSLATIONS = window.PS_TRANSLATIONS || {};
  function hasLanguage(code) { return LANGUAGES.some(function (l) { return l.code === code; }); }

  var langLoads = {};
  function loadLanguage(code) {
    if (DICT[code]) return Promise.resolve(true);
    if (!langLoads[code]) {
      langLoads[code] = new Promise(function (resolve) {
        var s = document.createElement("script");
        s.src = "assets/i18n/" + code + ".js" + ASSET_QS;
        s.onload = function () { resolve(!!DICT[code]); };
        s.onerror = function () { delete langLoads[code]; resolve(false); };
        document.head.appendChild(s);
      });
    }
    return langLoads[code];
  }

  function t(key, vars) {
    var d = DICT[state.lang];
    var s = (d && d[key] != null) ? d[key] : (DICT.en && DICT.en[key] != null) ? DICT.en[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  function detectLanguage() {
    // The site always opens in English; a language the visitor picks is remembered.
    var saved = load(STORAGE.lang);
    return saved && hasLanguage(saved) ? saved : "en";
  }

  function renderFaq() {
    if (dom.faqList.childElementCount) return;
    for (var i = 1; i <= FAQ_COUNT; i++) {
      var d = document.createElement("details");
      d.className = "faq-item";
      d.innerHTML = '<summary><span data-i18n="faq' + i + 'q"></span><span class="faq-icon" aria-hidden="true"></span></summary><p data-i18n="faq' + i + 'a"></p>';
      dom.faqList.appendChild(d);
    }
  }

  function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label"))); });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) { el.setAttribute("title", t(el.getAttribute("data-i18n-title"))); });
    // Text with one inline link, written as "before [[link text]] after".
    document.querySelectorAll("[data-i18n-rich]").forEach(function (el) {
      var parts = t(el.getAttribute("data-i18n-rich")).split(/\[\[|\]\]/);
      var target = el.getAttribute("data-link");
      el.textContent = "";
      parts.forEach(function (part, i) {
        if (i % 2 === 0) { if (part) el.appendChild(document.createTextNode(part)); return; }
        var link;
        if (target === "privacy") {
          link = document.createElement("button");
          link.type = "button";
          link.className = "inline-link";
          link.setAttribute("data-open-privacy", "");
        } else {
          link = document.createElement("a");
          link.href = target; link.target = "_blank"; link.rel = "noopener noreferrer";
        }
        link.textContent = part;
        el.appendChild(link);
      });
    });
    document.title = t("appTitle");
    updateThemeButton();
    updateSheetChrome();
  }

  var langRequest = 0;
  function setLanguage(code, persist) {
    if (!hasLanguage(code)) code = "en";
    var request = ++langRequest;
    return loadLanguage(code).then(function (ok) {
      if (request !== langRequest) return;
      if (!ok) return code === "en" ? null : setLanguage("en", persist);
      state.lang = code;
      var lang = LANGUAGES.find(function (l) { return l.code === code; });
      root.setAttribute("lang", code);
      root.setAttribute("dir", lang && lang.rtl ? "rtl" : "ltr");
      if (persist) store(STORAGE.lang, code);
      renderLanguageList();
      applyTranslations();
      root.classList.remove("i18n-wait");
      document.dispatchEvent(new CustomEvent("ps:languagechange", { detail: { lang: code } }));
    });
  }

  function renderLanguageList() {
    var list = dom.langList;
    if (!list.childElementCount) {
      LANGUAGES.forEach(function (lang) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "row";
        btn.setAttribute("role", "radio");
        btn.setAttribute("data-lang", lang.code);
        var main = document.createElement("span"); main.className = "row-main";
        var name = document.createElement("span"); name.className = "row-label";
        name.setAttribute("lang", lang.code); name.setAttribute("dir", lang.rtl ? "rtl" : "ltr");
        name.textContent = lang.name;
        main.appendChild(name);
        btn.appendChild(main);
        btn.insertAdjacentHTML("beforeend", '<svg class="check" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.5l3.5 3.5 7.5-8"/></svg>');
        btn.addEventListener("click", function () { setLanguage(lang.code, true); });
        li.appendChild(btn);
        list.appendChild(li);
      });
    }
    list.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-checked", String(btn.getAttribute("data-lang") === state.lang));
    });
  }

  /* ============================================================= theme */
  var lightQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  function resolveTheme(pref) { return pref === "system" ? (lightQuery && lightQuery.matches ? "light" : "dark") : pref; }
  function updateThemeButton() {
    var label = t(root.getAttribute("data-theme") === "dark" ? "themeToLight" : "themeToDark");
    var b = $("homeThemeBtn");
    if (b) { b.setAttribute("aria-label", label); b.setAttribute("title", label); }
  }
  function setThemePreference(pref, animate) {
    if (pref !== "dark" && pref !== "light" && pref !== "system") pref = "dark";
    state.themePref = pref;
    store(STORAGE.theme, pref);
    var theme = resolveTheme(pref);
    if (root.getAttribute("data-theme") === theme) { updateThemeButton(); return; }
    var apply = function () {
      root.setAttribute("data-theme", theme);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", theme === "light" ? "#f5f5f7" : "#0a0a0b");
      updateThemeButton();
    };
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate && !reduce && typeof document.startViewTransition === "function") {
      try { document.startViewTransition(apply); return; } catch (e) { /* fall through */ }
    }
    apply();
  }

  /* ============================================================= toast */
  var toastTimer = 0;
  function toast(message, tone) {
    dom.toastText.textContent = message;
    dom.toast.setAttribute("data-tone", tone || "info");
    dom.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { dom.toast.classList.remove("show"); }, tone === "error" ? 6500 : 2400);
  }

  /* ============================================================= sheet */
  var TITLES = { language: "langLabel", privacy: "privacyTitle", export: "exportTitle" };
  var sheet = { stack: [], opener: null };
  function pages() { return Array.prototype.slice.call(document.querySelectorAll("[data-page]")); }

  function updateSheetChrome() {
    var top = sheet.stack[sheet.stack.length - 1];
    dom.sheetTitle.textContent = top ? t(TITLES[top]) : "";
    dom.sheetBack.hidden = sheet.stack.length < 2;
    dom.sheetBackLabel.textContent = t("back");
  }
  function showView(name) {
    dom.sheetBody.querySelectorAll(".view").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== name; });
    dom.sheetBody.scrollTop = 0;
    if (name === "language") renderLanguageList();
    updateSheetChrome();
  }
  function openSheet(view) {
    if (!sheet.stack.length) sheet.opener = document.activeElement;
    sheet.stack = [view];
    showView(view);
    dom.sheet.classList.add("open");
    dom.sheetBackdrop.classList.add("open");
    dom.sheet.setAttribute("aria-hidden", "false");
    pages().forEach(function (el) { el.inert = true; });
    setTimeout(function () {
      dom.sheet.focus({ preventScroll: true });
      if (view === "language") {
        var current = dom.langList.querySelector('[aria-checked="true"]');
        if (current) current.scrollIntoView({ block: "center" });
      }
    }, 30);
    document.dispatchEvent(new CustomEvent("ps:sheet", { detail: { open: true, view: view } }));
  }
  function closeSheet() {
    if (!sheet.stack.length) return;
    sheet.stack = [];
    dom.sheet.classList.remove("open");
    dom.sheetBackdrop.classList.remove("open");
    dom.sheet.setAttribute("aria-hidden", "true");
    pages().forEach(function (el) { el.inert = false; });
    var back = sheet.opener; sheet.opener = null;
    if (back && typeof back.focus === "function") back.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("ps:sheet", { detail: { open: false } }));
  }
  function trapFocus(e) {
    if (e.key !== "Tab" || !sheet.stack.length) return;
    var f = Array.prototype.filter.call(
      dom.sheet.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  /* ============================================================ export */
  function defaultName() {
    var date;
    try { date = new Date().toLocaleDateString(state.lang, { day: "numeric", month: "short" }); }
    catch (e) { date = new Date().toISOString().slice(0, 10); }
    return t("exportDefaultName", { date: date });
  }
  function openExport(colors) {
    if (!colors || !colors.length) return;
    state.exportColors = colors.map(function (c) { return Object.assign({}, c); });
    dom.exportPreview.style.gridTemplateColumns = "repeat(" + Math.min(10, colors.length) + ", minmax(0, 1fr))";
    dom.exportPreview.innerHTML = "";
    state.exportColors.forEach(function (c) {
      var s = document.createElement("span");
      s.style.background = window.PSPalette.hex(c);
      dom.exportPreview.appendChild(s);
    });
    dom.paletteName.value = defaultName();
    openSheet("export");
  }
  function runExport(format) {
    var colors = state.exportColors, P = window.PSPalette;
    if (!colors.length) return;
    if (format === "copy") {
      var text = colors.map(P.hex).join(" ");
      var done = function () { toast(t("copiedAll")); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      else { fallbackCopy(text); done(); }
      return;
    }
    var file = window.PSExport.build(format, colors, dom.paletteName.value || defaultName());
    window.PSExport.deliver(file).then(function (result) {
      if (result === "downloaded") toast(t("exportSaved", { file: file.name }));
      else if (result === "unavailable") toast(t("exportUnavailable"), "error");
    });
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove();
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    fallbackCopy(text); return Promise.resolve();
  }

  /* ============================================================ events */
  function bindEvents() {
    dom.sheetDone.addEventListener("click", closeSheet);
    dom.sheetBackdrop.addEventListener("click", closeSheet);
    dom.exportList.addEventListener("click", function (e) {
      var b = e.target.closest("[data-export]");
      if (b) runExport(b.getAttribute("data-export"));
    });
    dom.paletteName.addEventListener("keydown", function (e) { if (e.key === "Enter") dom.paletteName.blur(); });
    document.addEventListener("keydown", function (e) {
      if (sheet.stack.length) {
        if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
        trapFocus(e);
      }
    });
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-open-privacy]")) openSheet("privacy");
    });
    if (lightQuery) {
      var onScheme = function () { if (state.themePref === "system") setThemePreference("system", true); };
      lightQuery.addEventListener ? lightQuery.addEventListener("change", onScheme) : lightQuery.addListener(onScheme);
    }
  }

  function init() {
    var savedTheme = load(STORAGE.theme);
    setThemePreference(savedTheme === "light" || savedTheme === "system" || savedTheme === "dark" ? savedTheme : "dark", false);
    renderFaq();
    bindEvents();
    setLanguage(detectLanguage(), false).then(function () { root.setAttribute("data-ready", "true"); });
  }

  window.PaletteStudio = Object.freeze({
    version: VERSION,
    t: t,
    toast: toast,
    copyText: copyText,
    openSheet: openSheet,
    closeSheet: closeSheet,
    isSheetOpen: function () { return sheet.stack.length > 0; },
    openExport: openExport,
    setLanguage: function (c) { return setLanguage(c, true); },
    toggleTheme: function () { setThemePreference(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true); },
    getLanguage: function () { return state.lang; },
  });

  init();
})();
