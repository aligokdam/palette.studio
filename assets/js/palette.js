/* =====================================================================
   Palette Studio: color extraction
   ---------------------------------------------------------------------
   Median cut on a small, downscaled camera frame. It is fast enough to
   run several times a second on an iPhone and needs no libraries.
     extract(rgba, n)   -> [{ r, g, b, weight }]   n colors
     rankGrid(colors)   -> light to dark, like a painter's mixing order
     rankStrip(colors)  -> most used color first
   ===================================================================== */
(function () {
  "use strict";

  function Box(pixels) {
    this.px = pixels; // flat array [r,g,b,r,g,b,...]
    this.fit();
  }
  Box.prototype.fit = function () {
    var p = this.px, n = p.length / 3;
    var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (var i = 0; i < p.length; i += 3) {
      var r = p[i], g = p[i + 1], b = p[i + 2];
      if (r < rmin) rmin = r; if (r > rmax) rmax = r;
      if (g < gmin) gmin = g; if (g > gmax) gmax = g;
      if (b < bmin) bmin = b; if (b > bmax) bmax = b;
    }
    // Green counts a little more, as the eye is most sensitive to it.
    var rr = (rmax - rmin) * 1.0, gr = (gmax - gmin) * 1.2, br = (bmax - bmin) * 0.8;
    this.n = n;
    this.axis = rr >= gr && rr >= br ? 0 : gr >= br ? 1 : 2;
    this.range = Math.max(rr, gr, br);
    this.score = this.range * Math.sqrt(n);
  };
  Box.prototype.split = function () {
    var p = this.px, axis = this.axis, n = this.n;
    var idx = new Array(n);
    for (var i = 0; i < n; i++) idx[i] = i;
    idx.sort(function (a, b) { return p[a * 3 + axis] - p[b * 3 + axis]; });
    var half = n >> 1;
    var a = new Uint8Array(half * 3), b = new Uint8Array((n - half) * 3);
    for (var j = 0; j < n; j++) {
      var src = idx[j] * 3, dst = j < half ? a : b, o = (j < half ? j : j - half) * 3;
      dst[o] = p[src]; dst[o + 1] = p[src + 1]; dst[o + 2] = p[src + 2];
    }
    return [new Box(a), new Box(b)];
  };
  Box.prototype.average = function () {
    var p = this.px, r = 0, g = 0, b = 0, n = this.n || 1;
    for (var i = 0; i < p.length; i += 3) { r += p[i]; g += p[i + 1]; b += p[i + 2]; }
    return { r: r / n, g: g / n, b: b / n, weight: this.n };
  };

  /* rgba: Uint8ClampedArray from getImageData. Returns exactly n colors. */
  function extract(rgba, n) {
    var count = rgba.length / 4, step = Math.max(1, Math.floor(count / 12000));
    var take = Math.floor(count / step);
    var px = new Uint8Array(take * 3);
    for (var i = 0, k = 0; i < take; i++) {
      var s = i * step * 4;
      px[k++] = rgba[s]; px[k++] = rgba[s + 1]; px[k++] = rgba[s + 2];
    }
    var boxes = [new Box(px)];
    while (boxes.length < n) {
      var best = -1, bestScore = 0;
      for (var b = 0; b < boxes.length; b++) {
        if (boxes[b].n > 1 && boxes[b].score > bestScore) { bestScore = boxes[b].score; best = b; }
      }
      if (best === -1) break; // nothing left to split (a flat, single color scene)
      var parts = boxes[best].split();
      boxes.splice(best, 1, parts[0], parts[1]);
    }
    var colors = boxes.map(function (box) { return box.average(); });
    while (colors.length < n) colors.push(Object.assign({}, colors[colors.length % Math.max(1, boxes.length)]));
    return colors;
  }

  function lightness(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
  function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

  function rankGrid(colors) { return colors.slice().sort(function (a, b) { return lightness(b) - lightness(a); }); }
  function rankStrip(colors) { return colors.slice().sort(function (a, b) { return b.weight - a.weight; }); }

  function hex(c) {
    return "#" + [c.r, c.g, c.b].map(function (v) {
      var h = Math.round(Math.max(0, Math.min(255, v))).toString(16);
      return h.length < 2 ? "0" + h : h;
    }).join("").toUpperCase();
  }
  function hsv(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6; if (h < 0) h += 1;
    }
    return { h: h, s: max ? d / max : 0, v: max };
  }
  function textOn(c) { return lightness(c) > 0.32 ? "rgba(0,0,0,.72)" : "rgba(255,255,255,.9)"; }
  function mix(a, b, t) { return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, weight: b.weight }; }

  window.PSPalette = Object.freeze({
    extract: extract, rankGrid: rankGrid, rankStrip: rankStrip,
    hex: hex, hsv: hsv, textOn: textOn, mix: mix, lightness: lightness,
  });
})();
