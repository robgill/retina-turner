# Retina Turner

A Figma plugin that turns messy Retina screenshots into the right size. It takes
oversized 2x/3x device exports and shadow-laden Mac window captures and returns
clean, consistently sized, device-framed images ready for specs and decks.

> Simply the best (screenshot cleanup).

## What it does

Every processed screenshot ends up **wrapped in a frame** — that's the output
format. The image stays a clean, untouched fill; all presentation (corner
radius, border, shadow, `clipsContent`) lives on the frame, so it can be
restyled or removed later without touching the pixels.

Two tabs (labelled **Captured on: 💻 Mac / 📱 iPhone**), because the work differs
by source:

- **💻 Mac** — window / QuickTime captures. Clips the macOS drop shadow by
  detecting the opaque window from the image's alpha channel (scale-independent,
  so it survives clipboard managers that re-encode the paste; falls back to
  fixed insets when there's no usable transparency), optionally width-normalizes
  to a chosen device, then frames it.
- **📱 iPhone** — device screenshots. Auto-detects the device by pixel
  dimensions and resizes the Retina capture down to logical points. The iPhone
  18 Pro / Pro Max share the 17's capture resolution, so they're **manual-select
  only** from the Device menu (auto-detect can't distinguish them); picking one
  applies the 18's smaller Dynamic Island.

Both tabs carry a **Keep original image quality** toggle (on by default). The
frame is always sized in logical points; the toggle decides what goes in the
fill. On, the source pixels are kept as-is (Mac crops are cut at native
resolution, iPhone captures skip the canvas entirely) and the frame's `FILL`
image fill scales them — crisp at any zoom, larger file. Off, the bitmap is
canvas-downsampled to the point size — smaller file, softer at zoom.

**Styling is WYSIWYG** — instead of dropdowns, you pick from swatches with a
live preview of the actual screenshot:

- **Font** — for the optional title label: Inter, Roboto, Space Grotesk, Fira
  Mono, Roboto Mono or JetBrains Mono. The list is data (`FONT_CHOICES` in
  [`src/styles.ts`](src/styles.ts)) and is sent to the UI on init, so adding a
  face is one entry: id, dropdown label, CSS stack for the preview, and the
  Figma font candidates to try (every chain ends at Inter).
- **Font Colour** — 4 swatches
- **Corner Radius** — swatches for 0 / 17 / 22 / **Device** plus a **numeric
  input** for any value. The Device swatch uses the chosen device's own radius;
  on Auto-detect it resolves per screenshot once the phone is identified.
- **Outline (border)** — an independent **width input** (px; 0 = none) and a
  **colour picker**. No longer bundled with the shadow.
- **Shadow** — None / Simple (hard offset) / Blur (soft), values from
  [`src/styles.ts`](src/styles.ts)

Shared: one **Turn it** button, batch support (same settings applied to every
selected image), an optional **title label** above the frame (named from the
layer/device — rename on canvas after), and per-tab settings persisted via
`figma.clientStorage`. All presentation lives on the frame, so restyling later
never touches the pixels.

**Turn it** also handles frames the plugin made before: any already-turned
frames in the selection are reconciled with the current controls without
re-processing pixels, alongside (or instead of) turning fresh screenshots in
the same selection. That reconciliation covers corner radius, border, shadow,
the status bar, and the title.

It works on **plain frames you drew** too: select any frame, pick a device +
options, and **Turn it** applies the frame style, drops in a status bar, and —
for a chosen phone device — resizes the frame to that device's logical points
(children reflow via their own constraints). A desktop / no-device selection
just styles the frame without resizing. The frame is stamped afterwards, so it
joins the restyle path. Titles are fully
round-trippable — turning the toggle on wraps the frame in a label stack in
place (nothing moves on canvas), turning it off unwraps and restores the
frame's position, and leaving it on re-points an existing label at the current
font and colour while keeping whatever it's been renamed to.

## Architecture

| File | Thread | Responsibility |
| --- | --- | --- |
| [`src/code.ts`](src/code.ts) | main | selection, image bytes, framing, styling, prefs |
| [`ui.html`](ui.html) | UI iframe | WYSIWYG controls, live preview, canvas pixel work (clip/resize) |
| [`src/devices.ts`](src/devices.ts) | shared | device table + `detectDevice()` |
| [`src/styles.ts`](src/styles.ts) | shared | corner-radius presets, border defaults, shadow presets |
| [`src/insets.ts`](src/insets.ts) | shared | macOS shadow crop insets + window corner radius |
| [`src/types.ts`](src/types.ts) | shared | message contracts between threads |

The main thread has no DOM/canvas, so all pixel manipulation happens in the UI
iframe; bytes cross the boundary via `postMessage`. The main thread owns the
device/preset tables and sends them to the UI on init, so the UI stays a "dumb"
renderer of whatever data it's handed.

## Install (from source)

> [!IMPORTANT]
> `code.js` — the plugin's compiled entry point referenced by `manifest.json` —
> is **not** committed to the repo (it's a build artifact). It's built for you:
> `npm install` runs a `prepare` script that bundles it automatically, so a
> fresh clone is ready to import. If Figma reports a missing `code.js` (e.g.
> after a `git pull` that changed `src/`), just run `npm run build`.

```bash
npm install       # installs deps AND builds code.js (via the prepare script)
```

Then in Figma desktop: **Plugins → Development → Import plugin from manifest…**
and pick [`manifest.json`](manifest.json). Select one or more image layers and
run **Retina Turner**.

After pulling changes that touch `src/`, rebuild with `npm run build` (or
`npm run watch` while developing).

## Develop

```bash
npm run watch     # rebuild on change
npm run typecheck # tsc --noEmit
```

## Status

MVP implemented:

1. ✅ Two-tab UI (Computer | Phone) with up-front options
2. ✅ Computer: shadow/transparency clipping + optional @2x downscale
3. ✅ Phone: Retina resize with device preset table + auto-detection
4. ✅ Frame wrapping for every output, style presets applied to the frame
5. ✅ Title label (text above frame, left-aligned, auto-layout wrapper)
6. ✅ Batch processing of multiple selected images

Phase 2 — status-bar replacement (first cut, iPhone tab):

- **Replace status bar** toggle overlays a status bar component on top of the
  framed screenshot, covering the real time/battery. The image fill stays
  untouched — delete the instance to get the original back.
- Art lives in [`src/statusbars.ts`](src/statusbars.ts) as embedded SVG +
  layout tables (community-safe: no team library, works on any account). On
  first use the plugin materialises a local **Status Bar** component set
  (variants `Device = SE | Notch | Island | Island 18` × `Mode = Light | Dark`)
  on a "❖ Components" page, then places instances. Pieces are edge/center
  anchored, so one component fits every device width; time text stays editable
  on the masters.
- The UI samples the screenshot's status-bar strip (dominant colour) to set
  the bar background and pick the Light/Dark variant automatically. On the
  apply-to-a-plain-frame path there's no screenshot to sample, so the bar colour
  and mode come from the frame's own background fill.
- Device → status bar mapping via `statusBarKind` in the device table
  (`island-18` is the iPhone 18's smaller Dynamic Island). The device table is
  iPhone-only for now; landscape captures are skipped.

Still unbuilt: manual light/dark + colour override in the dialog, custom
per-shadow parameters, non-iPhone devices (iPad/Android) in the device table,
custom user-defined presets.
