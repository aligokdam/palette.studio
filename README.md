## <img src="assets/icon-light.svg" width="28" height="28" alt="Palette Studio logo"> Palette Studio

A free palette camera for iPhone, iPad and Mac. Point the camera at anything and get a live color palette, take a photo or a video with the palette on screen, then export it for Procreate and other apps.

Palette Studio is an open-source alternative for artists who want Procreate-style color capture without buying an app. There is no subscription, no account and no ads.

The camera image is processed only in your browser. Nothing is uploaded or stored.

🌐 **Live Demo Link :** [https://aligokdam.github.io/palette.studio/](https://aligokdam.github.io/palette.studio/)

---

## Features

- 📷 Opens the camera the moment you tap Start (the browser asks for permission once)
- 🎨 Live palette of up to 30 colors, ranked from light to dark (Grid), or the 6 most used colors with HEX codes (Strip)
- 📸 Tap the shutter for a photo, hold it for a video (up to 60 s, MP4 on iPhone, iPad and Mac Safari)
- 🖼️ What you see is what you get: the palette panel is drawn into every photo and video exactly where it sits on screen
- 🔒 Lock the palette to freeze it, tap a swatch to copy its HEX code, drag the panel by its title
- 📤 Export as Procreate `.swatches`, Adobe `.ase`, GIMP/Krita `.gpl`, PNG palette card, CSS variables, JSON or copied HEX codes
- 📱 iPhone, iPad and Mac: full screen on iPhone and iPad, a large camera view on Mac, Add to Home Screen or Dock for an app-like icon
- 🖼️ No camera? Choose a photo instead and read its palette the same way
- 🔄 Front and back camera
- 🌍 Multilingual interface (24 languages), including right-to-left languages. Opens in English, the chosen language is remembered
- 🌓 Dark theme by default, light theme one tap away
- 🔒 Fully client-side, no trackers, strict Content Security Policy

---

## How It Works

1. Tap **Start** and allow the camera. It opens right away on iPhone, iPad and Mac.
2. Aim at anything. The palette follows what you see.
3. Tap the shutter for a photo, hold it for a video. Save it to Photos from the share sheet.
4. Tap the palette button and export it. Choose **Procreate (.swatches)** and pick Procreate in the share sheet.

---

## Export formats

| Format | File | Opens in |
| --- | --- | --- |
| Procreate | `.swatches` (ZIP with `Swatches.json`, HSB 0–1) | Procreate, Procreate Pocket |
| Adobe Swatch Exchange | `.ase` | Adobe |
| GIMP palette | `.gpl` | GIMP, Krita |
| Image | `.png` | Anywhere |
| Code | `.css`, `.json` | Web projects |

---

## Project Structure

```
palette.studio/
├── index.html
├── manifest.webmanifest
├── README.md
├── LICENSE
└── assets/
    ├── icon.svg / icon-light.svg / icon-color.svg
    ├── apple-touch-icon.png, icon-192.png, icon-512.png
    ├── css/
    │   ├── app.css        shared design system (same as Tesseract Studio)
    │   └── palette.css    camera, palette panel, capture preview, export
    ├── i18n/              24 languages, one file each
    └── js/
        ├── i18n.js        language list
        ├── palette.js     color extraction (median cut) and ranking
        ├── export.js      .swatches, .ase, .gpl, .png, .css, .json and sharing
        ├── app.js         language, theme, sheet, toast, FAQ, export panel
        ├── camera.js      camera, live palette, photo and video capture
        └── home.js        routing (#/, #/camera, #/terms) and the Mac, iPad and iPhone demo
```

No build step and no dependencies. Serve the folder over HTTPS (GitHub Pages works) because browsers only open the camera on secure pages. For local testing, `python3 -m http.server` and `http://localhost:8000` also work.

To add a language, copy `assets/i18n/en.js`, translate the values and add it to `assets/js/i18n.js`.

---

## Notes

- Videos are recorded without sound, so only the camera permission is needed.
- Palette Studio is an independent project. Other app and file format names are used only to describe file compatibility.

---

## License

MIT License

---

Created by **Ali Gökdam**
