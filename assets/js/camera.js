/* =====================================================================
   Palette Studio: camera
   ---------------------------------------------------------------------
   Opens the camera as soon as the camera route is entered (Safari asks
   for permission the first time), reads a live palette from what is
   on screen, and captures exactly what the user sees:
     tap the shutter  -> photo (JPEG) with the palette panel drawn in
     hold the shutter -> video (MP4 on iPhone) with the palette, no sound
   ===================================================================== */
(function () {
  "use strict";

  var App = window.PaletteStudio, P = window.PSPalette, X = window.PSExport;
  if (!App || !P || !X) return;
  var t = App.t;
  var $ = function (id) { return document.getElementById(id); };

  var CONFIG = Object.freeze({
    gridCount: 30,          // 10 x 3, the size of a Procreate palette
    stripCount: 6,
    sampleEvery: 140,       // ms between palette updates
    smoothing: 0.38,        // 0 = frozen, 1 = no smoothing
    holdForVideo: 320,      // ms the shutter must be held to start a video
    maxVideoSeconds: 60,
    photoMaxSide: 2400,
    videoMaxSide: 1280,
    videoFps: 30,
  });
  var STORAGE = { mode: "paletteStudio.mode", panel: "paletteStudio.panelTop", hint: "paletteStudio.hintSeen" };
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var dom = {
    cam: $("cam"), video: $("camVideo"), still: $("camStill"), pick: $("camPick"), file: $("camFile"), close: $("camClose"), flip: $("camFlip"), seg: $("modeSeg"),
    rec: $("camRec"), recTime: $("camRecTime"), pal: $("pal"), palHead: $("palHead"), palGrid: $("palGrid"), lock: $("palLock"),
    msg: $("camMsg"), msgTitle: $("camMsgTitle"), msgText: $("camMsgText"), retry: $("camRetry"),
    thumb: $("camThumb"), thumbImg: $("camThumbImg"), shutter: $("shutter"), ring: $("ringProgress"), exportBtn: $("camExport"),
    flash: $("camFlash"),
    result: $("result"), resultTitle: $("resultTitle"), resultMedia: $("resultMedia"), resultClose: $("resultClose"),
    resultRetake: $("resultRetake"), resultSave: $("resultSave"),
  };

  var state = {
    active: false, stream: null, facing: "environment", cameras: 0,
    mode: load(STORAGE.mode) === "strip" ? "strip" : "grid",
    locked: false, colors: [], swatches: [],
    status: "idle", msgKey: null,
    loop: 0, lastSample: 0, startToken: 0,
    recording: null, capture: null,
    still: null,        // object URL of a chosen photo when the camera cannot be used
  };

  var sampleCanvas = document.createElement("canvas");
  var sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

  /* ================================================== camera lifecycle */
  function setStatus(status, titleKey, textKey) {
    state.status = status;
    state.msgKey = status === "live" ? null : [titleKey, textKey];
    dom.cam.setAttribute("data-state", status);
    dom.msg.hidden = status === "live";
    renderMessage();
  }
  function renderMessage() {
    if (!state.msgKey) return;
    dom.msgTitle.textContent = t(state.msgKey[0]);
    dom.msgText.textContent = state.msgKey[1] ? t(state.msgKey[1]) : "";
  }

  function start() {
    if (state.active) return;
    state.active = true;
    openStream();
  }

  function clearStill() {
    if (!state.still) return;
    URL.revokeObjectURL(state.still);
    state.still = null;
    dom.still.hidden = true; dom.still.removeAttribute("src");
    dom.video.hidden = false;
  }

  /* Fallback when the camera cannot be opened (denied, embedded page, no camera):
     a photo from the library or the iOS camera is read the same way as the live view. */
  function openStill(file) {
    if (!file || !/^image\//.test(file.type)) return;
    state.startToken++;
    if (state.recording) stopRecording(true);
    closeStream();
    clearStill();
    state.still = URL.createObjectURL(file);
    dom.still.onload = function () {
      dom.video.hidden = true; dom.still.hidden = false;
      dom.cam.removeAttribute("data-mirror");
      state.colors = [];
      setStatus("live");
      startLoop();
      sample();
      requestAnimationFrame(restorePanel);
    };
    dom.still.onerror = function () { clearStill(); App.toast(t("errorCapture"), "error"); };
    dom.still.src = state.still;
  }

  function openStream() {
    var token = ++state.startToken;
    closeStream();
    clearStill();
    if (!window.isSecureContext) { setStatus("error", "camErrorTitle", "camInsecure"); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setStatus("error", "camErrorTitle", "camUnsupported"); return; }
    setStatus("starting", "camStarting", "camPermText");
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
    }).then(function (stream) {
      if (token !== state.startToken || !state.active) { stopTracks(stream); return; }
      state.stream = stream;
      dom.video.srcObject = stream;
      var track = stream.getVideoTracks()[0];
      var settings = track && track.getSettings ? track.getSettings() : {};
      // Mac webcams do not report a facing mode; a camera on a device without touch faces the user.
      var front = settings.facingMode ? settings.facingMode === "user" : (navigator.maxTouchPoints === 0 || state.facing === "user");
      dom.cam.toggleAttribute("data-mirror", front);
      if (track) track.addEventListener("ended", function () { if (state.active && !document.hidden) openStream(); });
      return dom.video.play().catch(function () { /* autoplay is allowed for muted inline video */ }).then(function () {
        if (token !== state.startToken) return;
        setStatus("live");
        countCameras();
        startLoop();
      });
    }).catch(function (err) {
      if (token !== state.startToken) return;
      var name = err && err.name;
      if (name === "NotAllowedError" || name === "SecurityError") setStatus("error", "camDeniedTitle", "camDenied");
      else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") setStatus("error", "camErrorTitle", "camNoCamera");
      else if (name === "NotReadableError") setStatus("error", "camErrorTitle", "camBusy");
      else setStatus("error", "camErrorTitle", "camUnsupported");
    });
  }

  function countCameras() {
    if (!navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (list) {
      state.cameras = list.filter(function (d) { return d.kind === "videoinput"; }).length;
      // Keep the space when there is one camera, so the layout switch stays centered.
      dom.flip.style.visibility = state.cameras < 2 ? "hidden" : "";
    }).catch(function () { /* ignore */ });
  }

  function stopTracks(stream) { if (stream) stream.getTracks().forEach(function (tr) { tr.stop(); }); }
  function closeStream() {
    stopLoop();
    stopTracks(state.stream);
    state.stream = null;
    dom.video.srcObject = null;
  }

  function stop() {
    if (!state.active) return;
    state.active = false;
    state.startToken++;
    if (state.recording) stopRecording(true);
    closeStream();
    clearStill();
    closeResult();
    setStatus("idle", "camStarting", "camPermText");
  }

  /* ===================================================== live palette */
  function startLoop() {
    stopLoop();
    var tick = function (now) {
      state.loop = requestAnimationFrame(tick);
      if (state.recording) drawRecordingFrame();
      if (state.locked || now - state.lastSample < CONFIG.sampleEvery) return;
      state.lastSample = now;
      sample();
    };
    state.loop = requestAnimationFrame(tick);
  }
  function stopLoop() { cancelAnimationFrame(state.loop); state.loop = 0; }

  /* The part of the video frame that is visible on screen (object-fit: cover). */
  function frameSource() { return state.still ? dom.still : dom.video; }
  function visibleCrop(targetW, targetH) {
    var el = frameSource();
    var vw = state.still ? el.naturalWidth : el.videoWidth, vh = state.still ? el.naturalHeight : el.videoHeight;
    if (!vw || !vh) return null;
    var target = targetW / targetH, source = vw / vh;
    if (source > target) { var sw = vh * target; return { sx: (vw - sw) / 2, sy: 0, sw: sw, sh: vh }; }
    var sh = vw / target; return { sx: 0, sy: (vh - sh) / 2, sw: vw, sh: sh };
  }

  function sample() {
    var rect = dom.cam.getBoundingClientRect();
    var crop = visibleCrop(rect.width, rect.height);
    if (!crop) return;
    var w = 72, h = Math.max(24, Math.round(w * crop.sh / crop.sw));
    if (sampleCanvas.width !== w || sampleCanvas.height !== h) { sampleCanvas.width = w; sampleCanvas.height = h; }
    try {
      sampleCtx.drawImage(frameSource(), crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
      var data = sampleCtx.getImageData(0, 0, w, h).data;
      var n = state.mode === "grid" ? CONFIG.gridCount : CONFIG.stripCount;
      var raw = P.extract(data, n);
      var ranked = state.mode === "grid" ? P.rankGrid(raw) : P.rankStrip(raw);
      if (state.colors.length === ranked.length) {
        state.colors = state.colors.map(function (c, i) { return P.mix(c, ranked[i], CONFIG.smoothing); });
      } else {
        state.colors = ranked;
      }
      paint();
    } catch (e) { /* a frame that is not ready yet */ }
  }

  function buildSwatches() {
    var n = state.mode === "grid" ? CONFIG.gridCount : CONFIG.stripCount;
    dom.pal.setAttribute("data-mode", state.mode);
    dom.pal.style.setProperty("--strip-n", CONFIG.stripCount);
    dom.palGrid.innerHTML = "";
    state.swatches = [];
    for (var i = 0; i < n; i++) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "sw"; b.setAttribute("data-i", i);
      var label = document.createElement("span"); label.className = "sw-hex";
      b.appendChild(label);
      dom.palGrid.appendChild(b);
      state.swatches.push({ el: b, label: label });
    }
    state.colors = [];
    if (state.status === "live" && !state.locked) sample();
  }

  function paint() {
    state.colors.forEach(function (c, i) {
      var s = state.swatches[i];
      if (!s) return;
      var hex = P.hex(c);
      s.el.style.backgroundColor = hex;
      s.el.setAttribute("aria-label", hex);
      if (state.mode === "strip") { s.label.textContent = hex; s.label.style.color = P.textOn(c); }
    });
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    store(STORAGE.mode, mode);
    dom.seg.querySelectorAll("[data-mode]").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-mode") === mode)); });
    if (state.locked) setLocked(false, true);
    buildSwatches();
  }

  function setLocked(on, silent) {
    state.locked = on;
    dom.lock.setAttribute("aria-pressed", String(on));
    dom.lock.querySelector("use").setAttribute("href", on ? "#i-lock" : "#i-unlock");
    var key = on ? "camUnlock" : "camLock";
    dom.lock.setAttribute("aria-label", t(key)); dom.lock.setAttribute("title", t(key));
    dom.lock.setAttribute("data-i18n-aria", key); dom.lock.setAttribute("data-i18n-title", key);
    if (!silent) App.toast(t(on ? "camLocked" : "camUnlocked"));
  }

  /* ===================================================== panel drag */
  function bindPanelDrag() {
    var drag = null;
    function bounds() {
      var cam = dom.cam.getBoundingClientRect(), top = document.querySelector(".cam-top").getBoundingClientRect();
      var bottom = document.querySelector(".cam-bottom").getBoundingClientRect();
      return { min: top.bottom - cam.top + 8, max: bottom.top - cam.top - dom.pal.offsetHeight - 8, h: cam.height };
    }
    function place(px) {
      var b = bounds();
      px = Math.max(b.min, Math.min(Math.max(b.min, b.max), px));
      dom.pal.style.top = px + "px";
      return px / b.h;
    }
    dom.palHead.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".pal-btn")) return;
      drag = { y: e.clientY, top: dom.pal.offsetTop, id: e.pointerId };
      dom.palHead.setPointerCapture(e.pointerId);
      dom.pal.classList.add("dragging");
    });
    dom.palHead.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.frac = place(drag.top + e.clientY - drag.y);
    });
    var end = function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.frac != null) store(STORAGE.panel, drag.frac.toFixed(4));
      drag = null; dom.pal.classList.remove("dragging");
    };
    dom.palHead.addEventListener("pointerup", end);
    dom.palHead.addEventListener("pointercancel", end);
    var restore = function () {
      var f = parseFloat(load(STORAGE.panel));
      if (isFinite(f) && state.active) place(f * dom.cam.getBoundingClientRect().height);
    };
    window.addEventListener("resize", restore);
    return restore;
  }

  /* ======================================================= composing */
  /* Draws the camera frame and the palette panel exactly as they appear on screen. */
  function compose(ctx, W, H) {
    var camRect = dom.cam.getBoundingClientRect();
    var crop = visibleCrop(camRect.width, camRect.height);
    ctx.save();
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (crop) {
      if (dom.cam.hasAttribute("data-mirror")) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(frameSource(), crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
    }
    ctx.restore();
    drawPanel(ctx, W / camRect.width, camRect);
  }

  function drawPanel(ctx, s, camRect) {
    var pr = dom.pal.getBoundingClientRect(), gr = dom.palGrid.getBoundingClientRect();
    var x = (pr.left - camRect.left) * s, y = (pr.top - camRect.top) * s, w = pr.width * s, h = pr.height * s;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 50 * s; ctx.shadowOffsetY = 18 * s;
    ctx.fillStyle = "rgba(10,10,11,.94)";
    rr(ctx, x, y, w, h, 22 * s); ctx.fill();
    ctx.restore();

    var title = dom.pal.querySelector(".pal-title").textContent;
    var rtl = document.documentElement.dir === "rtl";
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.font = "600 " + (17 * s) + "px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = rtl ? "right" : "left";
    var headH = gr.top - pr.top;
    ctx.fillText(title, rtl ? x + w - 20 * s : x + 20 * s, y + headH * s / 2 + 1 * s);
    ctx.restore();

    var gx = (gr.left - camRect.left) * s, gy = (gr.top - camRect.top) * s, gw = gr.width * s, gh = gr.height * s;
    ctx.save();
    rr(ctx, gx, gy, gw, gh, 14 * s); ctx.clip();
    ctx.fillStyle = "#1c1c1e"; ctx.fillRect(gx, gy, gw, gh);
    state.swatches.forEach(function (sw, i) {
      var c = state.colors[i];
      if (!c) return;
      var r = sw.el.getBoundingClientRect();
      var sx = (r.left - camRect.left) * s, sy = (r.top - camRect.top) * s;
      ctx.fillStyle = P.hex(c);
      ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.ceil(r.width * s) + 1, Math.ceil(r.height * s) + 1);
      if (state.mode === "strip") {
        ctx.fillStyle = P.textOn(c);
        ctx.font = "600 " + (10 * s) + "px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        ctx.fillText(P.hex(c), sx + r.width * s / 2, sy + r.height * s - 6 * s);
      }
    });
    ctx.restore();
  }
  function rr(ctx, l, tp, w, h, r) {
    ctx.beginPath(); ctx.moveTo(l + r, tp); ctx.arcTo(l + w, tp, l + w, tp + h, r); ctx.arcTo(l + w, tp + h, l, tp + h, r);
    ctx.arcTo(l, tp + h, l, tp, r); ctx.arcTo(l, tp, l + w, tp, r); ctx.closePath();
  }
  function outputSize(maxSide) {
    var rect = dom.cam.getBoundingClientRect();
    var crop = visibleCrop(rect.width, rect.height) || { sw: rect.width, sh: rect.height };
    var k = Math.min(1, maxSide / Math.max(crop.sw, crop.sh));
    // Even sizes keep video encoders happy.
    return { w: Math.round(crop.sw * k / 2) * 2, h: Math.round(crop.sh * k / 2) * 2 };
  }

  /* ========================================================== photo */
  function takePhoto() {
    if (state.status !== "live") return;
    var size = outputSize(CONFIG.photoMaxSide);
    var cv = document.createElement("canvas"); cv.width = size.w; cv.height = size.h;
    compose(cv.getContext("2d"), size.w, size.h);
    dom.flash.classList.remove("go"); void dom.flash.offsetWidth; dom.flash.classList.add("go");
    hideHint();
    cv.toBlob(function (blob) {
      if (!blob) { App.toast(t("errorCapture"), "error"); return; }
      setCapture("photo", blob, "Palette-Studio-" + stamp() + ".jpg");
      openResult();
    }, "image/jpeg", 0.92);
  }

  /* ========================================================== video */
  function pickMime() {
    if (!window.MediaRecorder) return null;
    var list = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* ignore */ } }
    return "";
  }

  function startRecording() {
    if (state.status !== "live" || state.recording) return false;
    var mime = pickMime();
    var size = outputSize(CONFIG.videoMaxSide);
    var cv = document.createElement("canvas"); cv.width = size.w; cv.height = size.h;
    if (mime === null || typeof cv.captureStream !== "function") { App.toast(t("errorRecord"), "error"); return false; }
    var ctx = cv.getContext("2d");
    compose(ctx, size.w, size.h);
    var stream = cv.captureStream(CONFIG.videoFps), recorder;
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : undefined); }
    catch (e) { App.toast(t("errorRecord"), "error"); return false; }
    var rec = { recorder: recorder, canvas: cv, ctx: ctx, stream: stream, chunks: [], started: performance.now(), mime: recorder.mimeType || mime || "video/webm", discard: false };
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) rec.chunks.push(e.data); };
    recorder.onstop = function () {
      stopTracks(stream);
      if (rec.discard || !rec.chunks.length) return;
      var type = rec.mime.split(";")[0];
      var blob = new Blob(rec.chunks, { type: type });
      setCapture("video", blob, "Palette-Studio-" + stamp() + (type === "video/mp4" ? ".mp4" : ".webm"));
      openResult();
    };
    state.recording = rec;
    recorder.start(1000);
    dom.cam.setAttribute("data-recording", "");
    dom.rec.hidden = false;
    hideHint();
    return true;
  }

  function drawRecordingFrame() {
    var rec = state.recording;
    compose(rec.ctx, rec.canvas.width, rec.canvas.height);
    var secs = (performance.now() - rec.started) / 1000;
    var m = Math.floor(secs / 60), sec = Math.floor(secs % 60);
    dom.recTime.textContent = m + ":" + (sec < 10 ? "0" : "") + sec;
    dom.ring.style.strokeDashoffset = String(245.04 * (1 - Math.min(1, secs / CONFIG.maxVideoSeconds)));
    if (secs >= CONFIG.maxVideoSeconds) stopRecording(false);
  }

  function stopRecording(discard) {
    var rec = state.recording;
    if (!rec) return;
    state.recording = null;
    rec.discard = !!discard;
    try { if (rec.recorder.state !== "inactive") rec.recorder.stop(); } catch (e) { /* ignore */ }
    dom.cam.removeAttribute("data-recording");
    dom.rec.hidden = true;
    dom.recTime.textContent = "0:00";
    dom.ring.style.strokeDashoffset = "245.04";
  }

  /* ======================================================== shutter */
  function bindShutter() {
    var press = null;
    dom.shutter.addEventListener("pointerdown", function (e) {
      if (state.status !== "live" || e.button > 0) return;
      e.preventDefault();
      if (state.recording) { stopRecording(false); press = { done: true, id: e.pointerId }; return; }
      press = { id: e.pointerId, timer: setTimeout(function () { if (press) press.video = startRecording(); }, CONFIG.holdForVideo) };
      try { dom.shutter.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    var release = function (e, cancelled) {
      if (!press || e.pointerId !== press.id) return;
      clearTimeout(press.timer);
      var p = press; press = null;
      if (p.done) return;
      if (p.video) stopRecording(false);
      else if (!cancelled) takePhoto();
    };
    dom.shutter.addEventListener("pointerup", function (e) { release(e, false); });
    dom.shutter.addEventListener("pointercancel", function (e) { release(e, true); });
    dom.shutter.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    // Keyboard and switch control: Enter or Space takes a photo, R toggles a video.
    dom.shutter.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (state.recording) stopRecording(false); else takePhoto(); }
    });
    document.addEventListener("keydown", function (e) {
      if (!state.active || App.isSheetOpen() || !dom.result.hidden) return;
      if (e.key === "r" || e.key === "R") { if (state.recording) stopRecording(false); else startRecording(); }
      if (e.key === "Escape") goHome();
    });
  }

  /* ======================================================== results */
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function setCapture(kind, blob, name) {
    if (state.capture) URL.revokeObjectURL(state.capture.url);
    var file = new File([blob], name, { type: blob.type });
    state.capture = { kind: kind, url: URL.createObjectURL(blob), file: file };
    dom.thumb.disabled = false;
    if (kind === "photo") dom.thumbImg.src = state.capture.url;
    else posterFromCanvas();
  }
  function posterFromCanvas() {
    var size = outputSize(240), cv = document.createElement("canvas");
    cv.width = size.w; cv.height = size.h;
    compose(cv.getContext("2d"), size.w, size.h);
    dom.thumbImg.src = cv.toDataURL("image/jpeg", 0.8);
  }
  function openResult() {
    var c = state.capture;
    if (!c) return;
    dom.resultMedia.innerHTML = "";
    var el;
    if (c.kind === "photo") { el = document.createElement("img"); el.alt = ""; }
    else { el = document.createElement("video"); el.controls = true; el.playsInline = true; el.setAttribute("playsinline", ""); el.loop = true; el.muted = true; el.autoplay = true; }
    el.src = c.url;
    dom.resultMedia.appendChild(el);
    dom.resultTitle.textContent = t(c.kind === "photo" ? "resultPhoto" : "resultVideo");
    dom.result.hidden = false;
    dom.cam.inert = true;
    dom.resultSave.focus({ preventScroll: true });
  }
  function closeResult() {
    if (dom.result.hidden) return;
    dom.result.hidden = true;
    dom.cam.inert = false;
    var v = dom.resultMedia.querySelector("video");
    if (v) v.pause();
    dom.resultMedia.innerHTML = "";
  }
  function saveResult() {
    if (!state.capture) return;
    X.deliver(state.capture.file).then(function (r) {
      if (r === "downloaded") App.toast(t("exportSaved", { file: state.capture.file.name }));
      else if (r === "unavailable") App.toast(t("exportUnavailable"), "error");
    });
  }

  function goHome() { if (window.PSNavigate) window.PSNavigate("#/"); else location.hash = "#/"; }

  function hideHint() {
    if (dom.cam.hasAttribute("data-hint-off")) return;
    dom.cam.setAttribute("data-hint-off", "");
    store(STORAGE.hint, "1");
  }

  /* ========================================================= events */
  function bind() {
    var restorePanel = bindPanelDrag();
    dom.close.addEventListener("click", function () { goHome(); });
    dom.retry.addEventListener("click", function () { if (state.active) openStream(); else start(); });
    dom.pick.addEventListener("click", function () { dom.file.click(); });
    dom.file.addEventListener("change", function () {
      var f = dom.file.files && dom.file.files[0];
      dom.file.value = "";
      if (f) openStill(f);
    });
    dom.flip.addEventListener("click", function () {
      if (state.recording) return;
      state.facing = state.facing === "user" ? "environment" : "user";
      openStream();
    });
    dom.seg.addEventListener("click", function (e) {
      var b = e.target.closest("[data-mode]");
      if (b) setMode(b.getAttribute("data-mode"));
    });
    dom.lock.addEventListener("click", function () { setLocked(!state.locked); });
    dom.palGrid.addEventListener("click", function (e) {
      var b = e.target.closest(".sw");
      if (!b) return;
      var c = state.colors[Number(b.getAttribute("data-i"))];
      if (!c) return;
      var hex = P.hex(c);
      App.copyText(hex).then(function () { App.toast(t("copied", { hex: hex })); });
      b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash");
    });
    dom.exportBtn.addEventListener("click", function () { if (state.colors.length) App.openExport(state.colors); });
    dom.thumb.addEventListener("click", openResult);
    dom.resultClose.addEventListener("click", closeResult);
    dom.resultRetake.addEventListener("click", closeResult);
    dom.resultSave.addEventListener("click", saveResult);
    dom.result.addEventListener("keydown", function (e) { if (e.key === "Escape") closeResult(); });

    document.addEventListener("visibilitychange", function () {
      if (!state.active) return;
      if (document.hidden) { if (state.recording) stopRecording(false); }
      else if (!state.still && (!state.stream || state.stream.getVideoTracks().every(function (tr) { return tr.readyState === "ended"; }))) openStream();
    });
    document.addEventListener("ps:languagechange", function () { renderMessage(); setLocked(state.locked, true); });
    dom.video.addEventListener("loadedmetadata", function () { requestAnimationFrame(restorePanel); });
    return restorePanel;
  }

  var restorePanel = bind();
  bindShutter();
  dom.seg.querySelectorAll("[data-mode]").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-mode") === state.mode)); });
  if (load(STORAGE.hint)) dom.cam.setAttribute("data-hint-off", "");
  buildSwatches();
  setStatus("idle", "camStarting", "camPermText");

  window.PSCamera = Object.freeze({
    start: function () { start(); requestAnimationFrame(restorePanel); },
    stop: stop,
    takePhoto: takePhoto,
    startRecording: startRecording,
    stopRecording: function () { stopRecording(false); },
    openStill: openStill,
    getState: function () {
      return { active: state.active, still: !!state.still, status: state.status, mode: state.mode, locked: state.locked, facing: state.facing,
        colors: state.colors.map(P.hex), recording: !!state.recording, capture: state.capture ? { kind: state.capture.kind, name: state.capture.file.name, size: state.capture.file.size, type: state.capture.file.type } : null };
    },
    CONFIG: CONFIG,
  });
})();
