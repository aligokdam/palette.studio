/* =====================================================================
   Palette Studio: export
   ---------------------------------------------------------------------
   Every file is built on the device, synchronously, so iOS still sees
   the tap that asked for it when the share sheet opens.
     .swatches  Procreate   (a ZIP holding Swatches.json, HSB 0..1)
     .ase       Adobe Swatch Exchange
     .gpl       GIMP and Krita palette
     .png       a palette card with HEX codes
     .css/.json for code
   ===================================================================== */
(function () {
  "use strict";
  var P = window.PSPalette;

  /* --------------------------------------------------------------- zip */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  /* Stored (uncompressed) ZIP. entries: [{ name, data: Uint8Array }] */
  function zip(entries) {
    var enc = new TextEncoder(), chunks = [], central = [], offset = 0;
    var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    entries.forEach(function (e) {
      var name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
      h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      chunks.push(new Uint8Array(h.buffer), name, e.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
      c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (s, a) { return s + a.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  }

  /* ----------------------------------------------------------- formats */
  function safeName(name) {
    var n = String(name || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").slice(0, 40);
    return n || "Palette";
  }

  function procreate(colors, name) {
    var swatches = colors.slice(0, 30).map(function (c) {
      var h = P.hsv(c);
      return { hue: round(h.h), saturation: round(h.s), brightness: round(h.v), alpha: 1, colorSpace: 0 };
    });
    var json = JSON.stringify([{ name: name, swatches: swatches }]);
    return zip([{ name: "Swatches.json", data: new TextEncoder().encode(json) }]);
  }
  function round(v) { return Math.round(v * 10000) / 10000; }

  function ase(colors, name) {
    var blocks = [];
    function utf16(str) {
      var b = new Uint8Array((str.length + 1) * 2);
      for (var i = 0; i < str.length; i++) { b[i * 2] = str.charCodeAt(i) >> 8; b[i * 2 + 1] = str.charCodeAt(i) & 0xFF; }
      return b;
    }
    function block(type, body) {
      var h = new DataView(new ArrayBuffer(6));
      h.setUint16(0, type); h.setUint32(2, body.length);
      blocks.push(new Uint8Array(h.buffer), body);
    }
    function named(str, extra) {
      var n = utf16(str), out = new Uint8Array(2 + n.length + (extra ? extra.length : 0));
      new DataView(out.buffer).setUint16(0, str.length + 1);
      out.set(n, 2); if (extra) out.set(extra, 2 + n.length);
      return out;
    }
    block(0xC001, named(name));
    colors.forEach(function (c) {
      var v = new DataView(new ArrayBuffer(18));
      "RGB ".split("").forEach(function (ch, i) { v.setUint8(i, ch.charCodeAt(0)); });
      v.setFloat32(4, c.r / 255); v.setFloat32(8, c.g / 255); v.setFloat32(12, c.b / 255);
      v.setUint16(16, 2); // normal (not global or spot)
      block(0x0001, named(P.hex(c), new Uint8Array(v.buffer)));
    });
    block(0xC002, new Uint8Array(0));
    var head = new DataView(new ArrayBuffer(12));
    head.setUint32(0, 0x41534546); head.setUint16(4, 1); head.setUint16(6, 0); head.setUint32(8, colors.length + 2);
    return new Blob([new Uint8Array(head.buffer)].concat(blocks), { type: "application/octet-stream" });
  }

  function gpl(colors, name) {
    var lines = ["GIMP Palette", "Name: " + name, "Columns: 10", "#"];
    colors.forEach(function (c) {
      lines.push([c.r, c.g, c.b].map(function (v) { return String(Math.round(v)).padStart(3, " "); }).join(" ") + "\t" + P.hex(c));
    });
    return new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
  }

  function css(colors, name) {
    var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "palette";
    var out = "/* " + name + ", made with Palette Studio */\n:root {\n" + colors.map(function (c, i) {
      return "  --" + slug + "-" + (i + 1) + ": " + P.hex(c) + ";";
    }).join("\n") + "\n}\n";
    return new Blob([out], { type: "text/css" });
  }

  function json(colors, name) {
    var out = { name: name, app: "Palette Studio", colors: colors.map(function (c) {
      return { hex: P.hex(c), rgb: [Math.round(c.r), Math.round(c.g), Math.round(c.b)] };
    }) };
    return new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  }

  /* A palette card. toDataURL is synchronous, which keeps the tap alive for sharing. */
  function png(colors, name) {
    var cols = colors.length > 10 ? 6 : Math.min(colors.length, 5);
    var rows = Math.ceil(colors.length / cols);
    var pad = 56, gap = 14, cell = Math.floor((1200 - pad * 2 - gap * (cols - 1)) / cols), label = 46, top = 132;
    var w = 1200, h = top + rows * (cell + label + gap) - gap + pad;
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var x = cv.getContext("2d");
    x.fillStyle = "#0a0a0b"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#f5f5f7"; x.font = "600 44px -apple-system, system-ui, sans-serif"; x.textBaseline = "alphabetic";
    x.fillText(name, pad, 92);
    x.fillStyle = "rgba(235,235,245,.5)"; x.font = "500 22px -apple-system, system-ui, sans-serif"; x.textAlign = "right";
    x.fillText("Palette Studio", w - pad, 92); x.textAlign = "left";
    colors.forEach(function (c, i) {
      var cx = pad + (i % cols) * (cell + gap), cy = top + Math.floor(i / cols) * (cell + label + gap);
      x.fillStyle = P.hex(c); roundRect(x, cx, cy, cell, cell, 18); x.fill();
      x.fillStyle = "rgba(235,235,245,.78)"; x.font = "600 22px ui-monospace, Menlo, monospace";
      x.fillText(P.hex(c), cx + 2, cy + cell + 32);
    });
    return dataUrlToBlob(cv.toDataURL("image/png"));
  }
  function roundRect(x, l, t, w, h, r) {
    x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
  }
  function dataUrlToBlob(url) {
    var parts = url.split(","), mime = /:(.*?);/.exec(parts[0])[1], bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  var BUILDERS = {
    swatches: { build: procreate, ext: "swatches", type: "application/zip" },
    ase: { build: ase, ext: "ase", type: "application/octet-stream" },
    gpl: { build: gpl, ext: "gpl", type: "text/plain" },
    png: { build: png, ext: "png", type: "image/png" },
    css: { build: css, ext: "css", type: "text/css" },
    json: { build: json, ext: "json", type: "application/json" },
  };

  function build(format, colors, name) {
    var b = BUILDERS[format];
    name = safeName(name);
    var blob = b.build(colors, name);
    return new File([blob], name + "." + b.ext, { type: b.type });
  }

  /* --------------------------------------------------------- delivery */
  /* Opens the iOS share sheet (Save Image, Save to Files, Procreate...).
     Falls back to a download where sharing files is not available. */
  function deliver(file) {
    // Inside an embedded preview (a claude.ai artifact) sharing and plain downloads are blocked;
    // the host offers its own save prompt instead. On the real site this branch never runs.
    if (window.claude && typeof window.claude.use === "function") {
      return window.claude.use("downloads").then(function (d) {
        if (!d) return "unavailable";
        return d.save({ filename: file.name, data: file }).then(function () { return "saved"; }, function (e) {
          return e && e.code === "declined" ? "cancelled" : "unavailable";
        });
      }, function () { return "unavailable"; });
    }
    var canShare = false;
    try { canShare = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { /* ignore */ }
    if (canShare) {
      return navigator.share({ files: [file] }).then(function () { return "shared"; }, function (err) {
        if (err && err.name === "AbortError") return "cancelled";
        download(file); return "downloaded";
      });
    }
    download(file);
    return Promise.resolve("downloaded");
  }
  function download(file) {
    var url = URL.createObjectURL(file), a = document.createElement("a");
    a.href = url; a.download = file.name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  window.PSExport = Object.freeze({ build: build, deliver: deliver, download: download, zip: zip, crc32: crc32, safeName: safeName, formats: Object.keys(BUILDERS) });
})();
