// Retina Turner — main thread.
//
// Owns the document, the data tables (devices/styles) and clientStorage.
// All pixel manipulation happens in the UI iframe (it has canvas); this thread
// ships bytes out, receives cleaned bytes back, and builds the frames.
// "Simply the best (screenshot cleanup)."

import { DEVICES, deviceByKey } from "./devices";
import { MAC_SHADOW_INSETS } from "./insets";
import { findStatusBar, placeStatusBar } from "./statusbars";
import { FONT_CHOICES, fontChoiceById, OUTLINES, TITLE_FONT_SIZE, TITLE_GAP } from "./styles";
import {
  FontId,
  FrameStyle,
  ImagePayload,
  MainToUI,
  Prefs,
  ProcessOptions,
  ProcessedItem,
  RestyleStatusBar,
  Stamp,
  StyledItem,
  TabId,
  TabPrefs,
  UIToMain,
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
  cornerRadius: 41.5,
  outline: "soft",
};

const DEFAULT_PREFS: Prefs = {
  activeTab: "phone",
  computer: DEFAULT_COMPUTER,
  phone: DEFAULT_PHONE,
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

/** Apply the WYSIWYG frame style: corner radius + outline + shadow. */
function applyStyle(frame: FrameNode, style: FrameStyle) {
  // All four corners on the output frame (the top-left-only look is only the
  // dialog's radius selector chips).
  frame.cornerRadius = style.cornerRadius;
  frame.clipsContent = true;

  const outline = OUTLINES[style.outline];
  if (outline.stroke && outline.strokeWeight) {
    frame.strokes = [{ type: "SOLID", color: hexToRgb(outline.stroke) }];
    frame.strokeWeight = outline.strokeWeight;
    frame.strokeAlign = "OUTSIDE"; // bezel sits around the content, not over it
  } else {
    frame.strokes = [];
  }

  frame.effects = outline.shadows.map((s) => ({
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
  applyStyle(frame, style);
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
    stamp.style.outline = style.outline;
    applyStyle(node, stamp.style);

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

// ---- boot ------------------------------------------------------------------

async function pushSelection() {
  const selection = figma.currentPage.selection;
  const images = await collectImages(selection);
  const styled = await collectStyled(selection);
  const msg: MainToUI = { type: "images", images, styled };
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
      };
    }
  } catch (e) {
    console.warn("Retina Turner: could not load prefs", e);
  }
  return DEFAULT_PREFS;
}

async function main() {
  figma.showUI(__html__, { width: 400, height: 660, themeColors: false });

  figma.on("selectionchange", () => {
    pushSelection();
  });

  figma.ui.onmessage = async (msg: UIToMain) => {
    if (msg.type === "ready") {
      const prefs = await loadPrefs();
      const config: MainToUI = {
        type: "config",
        devices: DEVICES,
        fonts: FONT_CHOICES,
        prefs,
        insets: MAC_SHADOW_INSETS,
      };
      figma.ui.postMessage(config);
      await pushSelection();
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
