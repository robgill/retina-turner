// Retina Turner — main thread.
//
// Owns the document, the data tables (devices/styles) and clientStorage.
// All pixel manipulation happens in the UI iframe (it has canvas); this thread
// ships bytes out, receives cleaned bytes back, and builds the frames.
// "Simply the best (screenshot cleanup)."

import { DEVICES, deviceByKey } from "./devices";
import { MAC_SHADOW_INSETS } from "./insets";
import { findStatusBar, placeStatusBar } from "./statusbars";
import {
  DEFAULT_STROKE_COLOUR,
  DEFAULT_STROKE_WIDTH,
  FONT_CHOICES,
  fontChoiceById,
  OUTLINES,
  TITLE_FONT_SIZE,
  TITLE_GAP,
} from "./styles";
import {
  DevicePreset,
  FontId,
  FrameCandidate,
  FrameStyle,
  ImagePayload,
  MainToUI,
  Prefs,
  ProcessOptions,
  ProcessedItem,
  RestyleStatusBar,
  Stamp,
  StatusBarSample,
  StyledItem,
  TabId,
  TabPrefs,
  UIToMain,
  WindowSize,
} from "./types";

const PREFS_KEY = "retina-turner:prefs";

// setPluginData key marking a frame as one of ours (value: JSON Stamp).
const STAMP_KEY = "retina-turner";

// setPluginData key marking a title wrapper stack + its label (value: "1"),
// so a later Update can find (and unwrap) them without guessing.
const TITLE_KEY = "retina-turner:title";

const DEFAULT_COMPUTER: TabPrefs = {
  deviceKey: "",
  clipShadow: true,
  statusBarOn: false,
  keepQuality: true,
  titleOn: false,
  font: "inter",
  fontColour: "#6b7280",
  cornerRadius: 17,
  radiusFromDevice: false,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  strokeColour: DEFAULT_STROKE_COLOUR,
  outline: "none",
};

const DEFAULT_PHONE: TabPrefs = {
  deviceKey: "",
  clipShadow: false,
  statusBarOn: false,
  keepQuality: true,
  titleOn: false,
  font: "inter",
  fontColour: "#6b7280",
  cornerRadius: 62, // fallback; the phone tab defaults to the device's own radius
  radiusFromDevice: true,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  strokeColour: DEFAULT_STROKE_COLOUR,
  outline: "soft",
};

// Plugin-window sizing. The window is drag-resizable (grip in the UI); Figma
// clamps resize() to the available app area, so a tall request just fills the
// viewport. These bounds keep it usable; height max is generous headroom.
const WINDOW = {
  minWidth: 360,
  maxWidth: 800,
  minHeight: 480,
  maxHeight: 2000,
  defWidth: 400,
  defHeight: 720,
};

function clampWindow(width: number, height: number): WindowSize {
  return {
    width: Math.round(Math.max(WINDOW.minWidth, Math.min(WINDOW.maxWidth, width))),
    height: Math.round(Math.max(WINDOW.minHeight, Math.min(WINDOW.maxHeight, height))),
  };
}

const DEFAULT_PREFS: Prefs = {
  activeTab: "phone",
  computer: DEFAULT_COMPUTER,
  phone: DEFAULT_PHONE,
  window: { width: WINDOW.defWidth, height: WINDOW.defHeight, userSized: false },
};

// ---- helpers ---------------------------------------------------------------

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function rgbToHex(c: RGB): string {
  const to2 = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
}

/** Perceived luminance (0..1) of a hex colour, for light/dark decisions. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Derive a status-bar colour sample from a plain frame's own background fill
 * (used by the apply-to-any-frame path, where there's no screenshot to sample).
 * A dark background implies light content, so mode "dark"; otherwise "light". */
function frameStatusBarSample(frame: FrameNode): StatusBarSample {
  let bg = "#ffffff";
  const fills = frame.fills;
  if (fills !== figma.mixed && Array.isArray(fills)) {
    for (const paint of fills) {
      if (paint.type === "SOLID" && paint.visible !== false) {
        bg = rgbToHex(paint.color);
        break;
      }
    }
  }
  return { bg, mode: luminance(bg) < 0.5 ? "dark" : "light" };
}

function imageHashOf(node: SceneNode): string | null {
  if (!("fills" in node)) return null;
  const fills = node.fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return null;
  for (const paint of fills) {
    if (paint.type === "IMAGE" && paint.visible !== false && paint.imageHash) {
      return paint.imageHash;
    }
  }
  return null;
}

function stampFrame(frame: FrameNode, tab: TabId, style: FrameStyle, deviceKey?: string) {
  const stamp: Stamp = { version: 1, tab, style, deviceKey };
  frame.setPluginData(STAMP_KEY, JSON.stringify(stamp));
}

function readStamp(node: SceneNode): Stamp | null {
  const raw = node.getPluginData(STAMP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Stamp;
  } catch (e) {
    return null;
  }
}

/** Find our previously-styled frames in the selection, including ones nested
 * anywhere inside a selected container (so selecting a parent frame works).
 * Ships the frame's image bytes too, so the UI can sample a status-bar colour
 * when a bar is added during a restyle. */
async function collectStyled(nodes: readonly SceneNode[]): Promise<StyledItem[]> {
  const seen = new Set<string>();
  const out: StyledItem[] = [];
  const add = async (node: SceneNode) => {
    if (seen.has(node.id)) return;
    const stamp = readStamp(node);
    if (!stamp) return;
    seen.add(node.id);
    let bytes: Uint8Array | undefined;
    const hash = imageHashOf(node);
    if (hash) {
      const image = figma.getImageByHash(hash);
      if (image) {
        try {
          bytes = await image.getBytesAsync();
        } catch (e) {
          console.warn("Retina Turner: could not read styled image on", node.name, e);
        }
      }
    }
    out.push({
      id: node.id,
      name: node.name,
      style: stamp.style,
      tab: stamp.tab,
      deviceKey: stamp.deviceKey,
      width: "width" in node ? node.width : 0,
      height: "height" in node ? node.height : 0,
      bytes,
    });
  };
  for (const node of nodes) {
    await add(node);
    if ("findAllWithCriteria" in node) {
      const hits = node.findAllWithCriteria({ pluginData: { keys: [STAMP_KEY] } });
      for (const hit of hits) await add(hit);
    }
  }
  return out;
}

async function collectImages(nodes: readonly SceneNode[]): Promise<ImagePayload[]> {
  const out: ImagePayload[] = [];
  for (const node of nodes) {
    // Already-turned frames are restyled, never reprocessed.
    if (readStamp(node)) continue;
    const hash = imageHashOf(node);
    if (!hash) continue;
    const image = figma.getImageByHash(hash);
    if (!image) continue;
    try {
      const bytes = await image.getBytesAsync();
      out.push({
        id: node.id,
        name: node.name,
        bytes,
        x: node.x,
        y: node.y,
        nodeWidth: node.width,
        nodeHeight: node.height,
      });
    } catch (e) {
      console.warn("Retina Turner: could not read image on", node.name, e);
    }
  }
  return out;
}

/** Plain frames in the selection the user can convert: not one of ours (those
 * go down the restyle path) and not image-filled (those are the image path).
 * Only the directly-selected frames — we don't hunt nested ones here. */
function collectFrames(nodes: readonly SceneNode[]): FrameCandidate[] {
  const out: FrameCandidate[] = [];
  for (const node of nodes) {
    if (node.type !== "FRAME") continue;
    if (readStamp(node)) continue; // already ours → restyle
    if (node.getPluginData(TITLE_KEY) === "1") continue; // our title-stack wrapper
    if (imageHashOf(node)) continue; // image-filled → turn/process
    out.push({ id: node.id, name: node.name, width: node.width, height: node.height });
  }
  return out;
}

/** Apply the WYSIWYG frame style: corner radius + border + drop shadow.
 * `device` (when known) resolves a radiusFromDevice request to that device's
 * own corner radius; otherwise the explicit style.cornerRadius is used. */
function applyStyle(frame: FrameNode, style: FrameStyle, device?: DevicePreset) {
  // All four corners on the output frame (the top-left-only look is only the
  // dialog's radius selector chips).
  frame.cornerRadius =
    style.radiusFromDevice && device ? device.cornerRadius : style.cornerRadius;
  frame.clipsContent = true;

  // Border: independent width + colour. Width 0 = no border.
  if (style.strokeWidth > 0) {
    frame.strokes = [{ type: "SOLID", color: hexToRgb(style.strokeColour) }];
    frame.strokeWeight = style.strokeWidth;
    frame.strokeAlign = "OUTSIDE"; // bezel sits around the content, not over it
  } else {
    frame.strokes = [];
  }

  // Drop shadow: driven by the shadow preset only.
  const shadows = (OUTLINES[style.outline] || OUTLINES.none).shadows;
  frame.effects = shadows.map((s) => ({
    type: "DROP_SHADOW",
    color: { ...hexToRgb(s.color), a: s.opacity },
    offset: { x: s.x, y: s.y },
    radius: s.blur,
    spread: 0,
    visible: true,
    blendMode: "NORMAL",
  }));
}

function buildScreenshotFrame(item: ProcessedItem, style: FrameStyle): FrameNode {
  const image = figma.createImage(item.bytes);
  const frame = figma.createFrame();
  frame.resize(item.width, item.height);
  frame.name = item.title;
  frame.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
  applyStyle(frame, style, deviceByKey(item.deviceKey));
  return frame;
}

/** Load the label font, falling back if the chosen one isn't installed. The
 * candidate chain comes from FONT_CHOICES (unknown id → the first choice). */
async function loadLabelFont(font: FontId): Promise<FontName> {
  const candidates: FontName[] = fontChoiceById(font).candidates;
  for (const f of candidates) {
    try {
      await figma.loadFontAsync(f);
      return f;
    } catch (e) {
      // try the next fallback
    }
  }
  const fallback: FontName = { family: "Inter", style: "Regular" };
  await figma.loadFontAsync(fallback);
  return fallback;
}

/** Wrap the screenshot frame + a title label in a left-aligned vertical stack. */
async function buildLabelledStack(
  screenshot: FrameNode,
  title: string,
  style: FrameStyle
): Promise<FrameNode> {
  const fontName = await loadLabelFont(style.font);
  const label = figma.createText();
  label.fontName = fontName;
  label.fontSize = TITLE_FONT_SIZE;
  label.characters = title;
  label.fills = [{ type: "SOLID", color: hexToRgb(style.fontColour) }];
  label.setPluginData(TITLE_KEY, "1");

  const stack = figma.createFrame();
  stack.setPluginData(TITLE_KEY, "1");
  stack.name = title;
  stack.layoutMode = "VERTICAL";
  stack.primaryAxisSizingMode = "AUTO";
  stack.counterAxisSizingMode = "AUTO";
  stack.counterAxisAlignItems = "MIN";
  stack.itemSpacing = TITLE_GAP;
  stack.fills = [];
  stack.clipsContent = false;
  stack.appendChild(label);
  stack.appendChild(screenshot);
  return stack;
}

/** Is this frame already wrapped in one of our title stacks? Stacks built
 * since TITLE_KEY landed say so outright; older ones are recognised by shape
 * (vertical auto-layout, no fills, holding this frame plus a TEXT label). */
function findTitleStack(frame: FrameNode): { stack: FrameNode; label: TextNode } | null {
  const parent = frame.parent;
  if (!parent || parent.type !== "FRAME") return null;
  const stack = parent;
  const labels = stack.children.filter((c): c is TextNode => c.type === "TEXT");
  if (labels.length === 0) return null;
  const marked = labels.filter((t) => t.getPluginData(TITLE_KEY) === "1");
  const label = marked.length > 0 ? marked[0] : labels[0];
  if (stack.getPluginData(TITLE_KEY) === "1") return { stack, label };
  // Legacy heuristic for stacks built before the marker existed. Everything
  // else in there must be text, so unwrapping can't strand a sibling.
  if (stack.layoutMode !== "VERTICAL") return null;
  const fills = stack.fills;
  if (fills === figma.mixed || !Array.isArray(fills) || fills.length > 0) return null;
  const others = stack.children.filter((c) => c.id !== frame.id && c.type !== "TEXT");
  if (others.length > 0) return null;
  return { stack, label };
}

/** Wrap an already-placed screenshot frame in a title stack without moving it
 * on canvas: the stack takes the frame's slot in its parent, and shifts up by
 * the label block so the screenshot lands back exactly where it was. */
async function addTitleStack(frame: FrameNode, style: FrameStyle): Promise<FrameNode | null> {
  const parent = frame.parent;
  if (!parent) return null;
  const index = parent.children.indexOf(frame);
  const frameX = frame.x;
  const frameY = frame.y;
  const frameHeight = frame.height;
  // Moves `frame` into the new stack, so the index above is taken beforehand.
  const stack = await buildLabelledStack(frame, frame.name, style);
  parent.insertChild(Math.max(0, Math.min(index, parent.children.length)), stack);
  stack.x = frameX;
  stack.y = frameY - (stack.height - frameHeight);
  return stack;
}

/** Reverse of addTitleStack: put the screenshot frame back in the stack's slot
 * at the stack's position (minus the label block), then bin the stack. */
function removeTitleStack(frame: FrameNode, stack: FrameNode): boolean {
  const parent = stack.parent;
  if (!parent) return false;
  const index = parent.children.indexOf(stack);
  const labelBlock = stack.height - frame.height; // label + gap, before reflow
  const stackX = stack.x;
  const stackY = stack.y;
  parent.insertChild(Math.max(0, Math.min(index, parent.children.length)), frame);
  frame.x = stackX;
  frame.y = stackY + labelBlock;
  // Only bin the wrapper if all that's left is the title text.
  const leftovers = stack.children.filter((c) => c.type !== "TEXT");
  if (leftovers.length === 0) stack.remove();
  return true;
}

/** Re-point an existing label at the current font + colour, keeping whatever
 * the user typed. Figma needs every font already on the node loaded first. */
async function restyleLabel(label: TextNode, style: FrameStyle) {
  const fontName = await loadLabelFont(style.font);
  const existing = label.fontName;
  if (existing !== figma.mixed) {
    try {
      await figma.loadFontAsync(existing);
    } catch (e) {
      // The old font is gone; setting the new one below still works.
    }
  }
  label.fontName = fontName;
  label.fills = [{ type: "SOLID", color: hexToRgb(style.fontColour) }];
}

async function turnItAll(items: ProcessedItem[], options: ProcessOptions) {
  const style = options.style;
  const withLabel = style.titleOn;

  // Pass 1: snapshot every original's ABSOLUTE top-left before mutating
  // anything (removing a node reflows auto-layout/group siblings).
  const snaps: { item: ProcessedItem; node: SceneNode | null; ax: number; ay: number }[] = [];
  for (const item of items) {
    const node = (await figma.getNodeByIdAsync(item.id)) as SceneNode | null;
    let ax = item.x;
    let ay = item.y;
    if (node && node.absoluteTransform) {
      ax = node.absoluteTransform[0][2];
      ay = node.absoluteTransform[1][2];
    }
    snaps.push({ item, node, ax, ay });
  }

  const clipped = options.tab === "computer" && !!options.clipShadow;
  const offX = clipped ? MAC_SHADOW_INSETS.left : 0;
  const offY = clipped ? MAC_SHADOW_INSETS.top : 0;

  let placed = 0;
  const results: SceneNode[] = [];
  for (const snap of snaps) {
    const screenshot = buildScreenshotFrame(snap.item, style);
    stampFrame(screenshot, options.tab, style, snap.item.deviceKey || options.deviceKey);

    // Status bar swap: drop a component instance over the top strip. The
    // image fill stays untouched — delete the instance to get the original.
    if (snap.item.statusBar) {
      const device = deviceByKey(snap.item.deviceKey);
      if (device && device.statusBarKind) {
        try {
          await placeStatusBar(screenshot, device, snap.item.statusBar);
        } catch (e) {
          console.warn("Retina Turner: could not place status bar", e);
          const detail = e instanceof Error ? e.message : String(e);
          figma.notify(`Status bar failed: ${detail}`, { error: true });
        }
      }
    }

    let result: FrameNode = screenshot;
    if (withLabel) {
      result = await buildLabelledStack(screenshot, snap.item.title, style);
    }

    figma.currentPage.appendChild(result);
    result.x = snap.ax + offX;
    if (withLabel) {
      const labelBlock = result.height - screenshot.height;
      result.y = snap.ay + offY - labelBlock;
    } else {
      result.y = snap.ay + offY;
    }

    if (snap.node && !snap.node.removed) snap.node.remove();
    results.push(result);
    placed++;
  }

  figma.currentPage.selection = results;
  figma.notify(
    placed === 1
      ? "Turned 1 screenshot. Simply the best."
      : `Turned ${placed} screenshots. Simply the best.`
  );
}

/** Re-apply frame style (radius + outline + shadow) to previously-turned
 * frames, reconcile the title with the current toggle (on → add or restyle the
 * label, off → unwrap the stack) and reconcile the status bar too: on → add one
 * (using the freshly sampled colour from the UI), off → remove the existing
 * one. Pixel options (clip/resize) are untouched. */
async function restyleAll(ids: string[], style: FrameStyle, statusBar: RestyleStatusBar[]) {
  const sbById = new Map(statusBar.map((s) => [s.id, s]));
  let updated = 0;
  let sbSkipped = 0;
  // Nodes to re-select afterwards, but only when a wrap/unwrap moved things —
  // otherwise the user's own selection is left alone.
  const reselect: SceneNode[] = [];
  let renested = false;
  for (const id of ids) {
    const node = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
    if (!node || node.removed || node.type !== "FRAME") continue;
    const stamp = readStamp(node);
    if (!stamp) continue;
    stamp.style.cornerRadius = style.cornerRadius;
    stamp.style.radiusFromDevice = style.radiusFromDevice;
    stamp.style.strokeWidth = style.strokeWidth;
    stamp.style.strokeColour = style.strokeColour;
    stamp.style.outline = style.outline;
    applyStyle(node, stamp.style, deviceByKey(stamp.deviceKey));

    // Title reconcile.
    let outermost: SceneNode = node;
    const found = findTitleStack(node);
    if (style.titleOn && found) {
      await restyleLabel(found.label, style);
      // Persist the marker on stacks recognised by the legacy heuristic.
      found.stack.setPluginData(TITLE_KEY, "1");
      found.label.setPluginData(TITLE_KEY, "1");
      outermost = found.stack;
    } else if (style.titleOn && !found) {
      const stack = await addTitleStack(node, style);
      if (stack) {
        renested = true;
        outermost = stack;
      }
    } else if (!style.titleOn && found) {
      if (removeTitleStack(node, found.stack)) renested = true;
    }
    stamp.style.titleOn = style.titleOn;
    stamp.style.font = style.font;
    stamp.style.fontColour = style.fontColour;

    node.setPluginData(STAMP_KEY, JSON.stringify(stamp));
    reselect.push(outermost);
    updated++;

    const sb = sbById.get(id);
    if (sb) {
      const existing = findStatusBar(node);
      if (!sb.on) {
        if (existing) existing.remove();
      } else if (!existing) {
        // Add a bar only where we know the device and got a colour sample.
        const device = deviceByKey(stamp.deviceKey);
        if (device && device.statusBarKind && sb.sample) {
          try {
            await placeStatusBar(node, device, sb.sample);
          } catch (e) {
            console.warn("Retina Turner: could not place status bar", e);
            const detail = e instanceof Error ? e.message : String(e);
            figma.notify(`Status bar failed: ${detail}`, { error: true });
          }
        } else {
          sbSkipped++;
        }
      }
    }
  }
  // Wrapping/unwrapping changes which node the user is holding — keep the
  // outermost results selected so Update stays live on the same screenshots.
  if (renested && reselect.length > 0) {
    try {
      figma.currentPage.selection = reselect.filter((n) => !n.removed);
    } catch (e) {
      // Nodes off the current page can't be selected; not worth failing over.
    }
  }
  figma.notify(
    updated === 1
      ? "Restyled 1 frame. Simply the best."
      : `Restyled ${updated} frames. Simply the best.`
  );
  if (sbSkipped > 0) {
    figma.notify(
      `Status bar skipped on ${sbSkipped} frame${sbSkipped === 1 ? "" : "s"} — ` +
        "no recognised device or no colour sample."
    );
  }
}

/** Apply device sizing + status bar + styling to plain, user-drawn frames.
 * A chosen phone device resizes the frame to its logical points (children
 * reflow via their own Figma constraints — pixels aren't scaled) and can drop
 * in a status bar. "Desktop"/no device leaves the frame's size alone and just
 * styles it. The frame is stamped afterwards, so it joins the restyle path. */
async function applyToFrames(
  ids: string[],
  options: ProcessOptions,
  statusBar: RestyleStatusBar[]
) {
  const sbById = new Map(statusBar.map((s) => [s.id, s]));
  const style = options.style;
  const device = deviceByKey(options.deviceKey);
  let updated = 0;
  const results: SceneNode[] = [];
  for (const id of ids) {
    const node = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
    if (!node || node.removed || node.type !== "FRAME") continue;
    if (readStamp(node)) continue; // already ours — belongs to restyle

    // Phone device → resize to logical points; children reflow via constraints.
    // Desktop / no device → leave the size untouched.
    if (device) node.resize(device.ptWidth, device.ptHeight);

    applyStyle(node, style, device);
    stampFrame(node, options.tab, style, options.deviceKey);

    const sb = sbById.get(id);
    const wantsBar = sb ? sb.on : !!options.statusBar;
    if (wantsBar && device && device.statusBarKind) {
      // No screenshot to sample here — use the caller's sample if present,
      // else read the frame's own background fill.
      const sample = (sb && sb.sample) || frameStatusBarSample(node);
      try {
        await placeStatusBar(node, device, sample);
      } catch (e) {
        console.warn("Retina Turner: could not place status bar", e);
        const detail = e instanceof Error ? e.message : String(e);
        figma.notify(`Status bar failed: ${detail}`, { error: true });
      }
    }

    results.push(node);
    updated++;
  }
  if (results.length > 0) {
    try {
      figma.currentPage.selection = results;
    } catch (e) {
      // Off-page nodes can't be selected; not worth failing over.
    }
  }
  figma.notify(
    updated === 1
      ? "Applied to 1 frame. Simply the best."
      : `Applied to ${updated} frames. Simply the best.`
  );
}

// ---- boot ------------------------------------------------------------------

async function pushSelection() {
  const selection = figma.currentPage.selection;
  const images = await collectImages(selection);
  const styled = await collectStyled(selection);
  const frames = collectFrames(selection);
  const msg: MainToUI = { type: "images", images, styled, frames };
  figma.ui.postMessage(msg);
}

async function loadPrefs(): Promise<Prefs> {
  try {
    const saved = (await figma.clientStorage.getAsync(PREFS_KEY)) as Prefs | undefined;
    if (saved) {
      return {
        activeTab: saved.activeTab || DEFAULT_PREFS.activeTab,
        computer: { ...DEFAULT_COMPUTER, ...saved.computer },
        phone: { ...DEFAULT_PHONE, ...saved.phone },
        window: {
          ...clampWindow(
            (saved.window && saved.window.width) || WINDOW.defWidth,
            (saved.window && saved.window.height) || WINDOW.defHeight
          ),
          userSized: !!(saved.window && saved.window.userSized),
        },
      };
    }
  } catch (e) {
    console.warn("Retina Turner: could not load prefs", e);
  }
  return DEFAULT_PREFS;
}

async function main() {
  // Load prefs before showing the UI so the window opens at the saved size.
  const prefs = await loadPrefs();
  figma.showUI(__html__, {
    width: prefs.window.width,
    height: prefs.window.height,
    themeColors: false,
  });

  figma.on("selectionchange", () => {
    pushSelection();
  });

  figma.ui.onmessage = async (msg: UIToMain) => {
    if (msg.type === "ready") {
      const config: MainToUI = {
        type: "config",
        devices: DEVICES,
        fonts: FONT_CHOICES,
        prefs,
        insets: MAC_SHADOW_INSETS,
      };
      figma.ui.postMessage(config);
      await pushSelection();
    } else if (msg.type === "resize") {
      const size: WindowSize = clampWindow(msg.width, msg.height);
      figma.ui.resize(size.width, size.height);
      prefs.window = size; // persisted by the UI's save-prefs on drag end
    } else if (msg.type === "process") {
      try {
        await turnItAll(msg.items, msg.options);
      } catch (e) {
        console.error(e);
        figma.notify("Something went wrong while framing. Check the console.", {
          error: true,
        });
      }
    } else if (msg.type === "restyle") {
      try {
        await restyleAll(msg.ids, msg.style, msg.statusBar || []);
        await pushSelection(); // refresh the UI's stored styles
      } catch (e) {
        console.error(e);
        figma.notify("Something went wrong while restyling. Check the console.", {
          error: true,
        });
      }
    } else if (msg.type === "apply-frames") {
      try {
        await applyToFrames(msg.ids, msg.options, msg.statusBar || []);
        await pushSelection(); // the frames are now ours → refresh as styled
      } catch (e) {
        console.error(e);
        figma.notify("Something went wrong while applying to the frame. Check the console.", {
          error: true,
        });
      }
    } else if (msg.type === "save-prefs") {
      try {
        await figma.clientStorage.setAsync(PREFS_KEY, msg.prefs);
      } catch (e) {
        console.warn("Retina Turner: could not save prefs", e);
      }
    } else if (msg.type === "notify") {
      figma.notify(msg.message);
    } else if (msg.type === "cancel") {
      figma.closePlugin();
    }
  };
}

main();
