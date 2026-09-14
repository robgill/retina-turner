// Status bar replacement (Phase 2).
//
// The three iOS status bars (SE / notch / Dynamic Island) live here as SVG
// strings + layout tables, exported once from the reference Figma file. The
// plugin materialises them into a local component set ("Status Bar", variants
// Device × Mode) inside a titled Section on a dedicated "❖ Components" page the
// first time they're needed, then places instances on top of screenshot
// frames. Self-contained on
// purpose: no team library, so this works on any account (community-safe).
//
// Pieces are anchored (left/center/right) rather than stretched, so one
// component serves every device width (360–448pt). Content pieces are
// repainted per Mode via the sentinel colours; chrome pieces (notch cutout,
// island pill) stay their original hardware black.

import { DevicePreset, StatusBarKind, StatusBarSample } from "./types";

/** Bump when the embedded art/layout changes; stale sets are rebuilt.
 *  v2: moved onto the "❖ Components" page, wrapped in a titled Section. */
export const STATUS_BAR_VERSION = "2";

const COMPONENTS_PAGE_NAME = "❖ Components";
const SECTION_NAME = "Retina Turner — Status Bars";
const ROOT_KEY = "rt-statusbar-set"; // root pluginData: "<nodeId>|<version>"

/** pluginData marker on placed instances, so restyle can find/remove them. */
export const STATUS_BAR_CHILD_KEY = "retina-turner:statusbar";

/** The status bar instance previously placed inside a frame, if any. */
export function findStatusBar(frame: FrameNode): SceneNode | undefined {
  return frame.children.find(
    (c) =>
      c.getPluginData(STATUS_BAR_CHILD_KEY) === "1" ||
      (c.type === "INSTANCE" && c.name === "Status Bar")
  );
}

// Deliberately not #ffffff/#000000 so the sentinels stand out when inspecting.
export const CONTENT_LIGHT = "#F9F9F9";
export const CONTENT_DARK = "#1B1B1B";

type Anchor = "left" | "center" | "right";
type Weight = "Regular" | "Medium" | "Semi Bold";

interface PieceDef {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: Anchor;
  /** Vector artwork (mutually exclusive with text/rect). */
  svg?: string;
  /** Live, editable text (time / carrier / percentage). */
  text?: { chars: string; fontSize: number; weight: Weight };
  /** Plain rounded rectangle (battery capacity fill). */
  rect?: { radius: number };
  /** Hardware chrome (notch, island): never recoloured by Mode. */
  chrome?: boolean;
}

interface StatusBarDef {
  kind: StatusBarKind;
  /** Variant value for the "Device" property. */
  label: string;
  width: number;
  height: number;
  pieces: PieceDef[];
}

// ---- artwork (exported from the reference file) -----------------------------

const SVG_SE_SIGNAL = `<svg width="14.5" height="9.5" viewBox="0 0 14.5 9.5" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 0C12.2239 0 12 0.223857 12 0.5V9C12 9.27614 12.2239 9.5 12.5 9.5H14C14.2761 9.5 14.5 9.27614 14.5 9V0.5C14.5 0.223858 14.2761 0 14 0H12.5Z" fill="#1B1B1B"/><path d="M8.5 2.5C8.22386 2.5 8 2.72386 8 3V9C8 9.27614 8.22386 9.5 8.5 9.5H10C10.2761 9.5 10.5 9.27614 10.5 9V3C10.5 2.72386 10.2761 2.5 10 2.5H8.5Z" fill="#1B1B1B"/><path d="M4 5C4 4.72386 4.22386 4.5 4.5 4.5H6C6.27614 4.5 6.5 4.72386 6.5 5V9C6.5 9.27614 6.27614 9.5 6 9.5H4.5C4.22386 9.5 4 9.27614 4 9V5Z" fill="#1B1B1B"/><path d="M0.5 6.5C0.223858 6.5 0 6.72386 0 7V9C0 9.27614 0.223858 9.5 0.5 9.5H2C2.27614 9.5 2.5 9.27614 2.5 9V7C2.5 6.72386 2.27614 6.5 2 6.5H0.5Z" fill="#1B1B1B"/></svg>`;

const SVG_SE_WIFI = `<svg width="13" height="9" viewBox="0 0 13 9" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.48756 0C9.05057 0 11.363 1.03944 13 2.70688L11.9119 3.76404C10.5539 2.36553 8.626 1.49223 6.48756 1.49223C4.36289 1.49223 2.44608 2.35432 1.08956 3.73709L0 2.68164C1.63555 1.02896 3.93751 0 6.48756 0Z" fill="#1B1B1B"/><path d="M10.8235 4.82144C9.74478 3.69175 8.20144 2.98446 6.48756 2.98446C4.78827 2.98446 3.25663 3.67976 2.17927 4.79269L3.2693 5.8486C4.0672 5.00537 5.21365 4.47668 6.48756 4.47668C7.77688 4.47668 8.93563 5.01824 9.73462 5.87933L10.8235 4.82144Z" fill="#1B1B1B"/><path d="M8.64442 6.9385C8.12637 6.34545 7.35236 5.96891 6.48756 5.96891C5.63901 5.96891 4.87786 6.33143 4.36017 6.90532L6.52254 9L8.64442 6.9385Z" fill="#1B1B1B"/></svg>`;

const SVG_BATTERY_STROKE = `<svg width="24.5" height="10.5" viewBox="0 0 24.5 10.5" fill="none" xmlns="http://www.w3.org/2000/svg"><g opacity="0.5"><path fill-rule="evenodd" clip-rule="evenodd" d="M0 2.5C0 1.11929 1.11929 0 2.5 0H19.5C20.8807 0 22 1.11929 22 2.5V8C22 9.38071 20.8807 10.5 19.5 10.5H2.5C1.11929 10.5 0 9.38071 0 8V2.5ZM2.5 1H19.5C20.3284 1 21 1.67157 21 2.5V8C21 8.82843 20.3284 9.5 19.5 9.5H2.5C1.67157 9.5 1 8.82843 1 8V2.5C1 1.67157 1.67157 1 2.5 1Z" fill="#1B1B1B"/><path d="M24.5 5.43699C24.5 6.36891 23.8626 7.15196 23 7.37398V3.5C23.8626 3.72202 24.5 4.50507 24.5 5.43699Z" fill="#1B1B1B"/></g></svg>`;

// Middle subpath only of the exported notch boolean — the two screen-corner
// wedges are dropped because the output frame's own cornerRadius handles that.
const SVG_NOTCH = `<svg width="219" height="31" viewBox="78 0 219 31" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M296.108 0.21582C294.211 0.675751 292.668 2.0734 292.002 3.90039C291.969 3.99073 291.954 4.08452 291.954 4.18066L291.961 8C291.961 20.7025 281.663 31 268.961 31H106.039C93.3365 31 83.039 20.7025 83.0391 7.96094L83.0459 4.18066C83.046 4.08559 83.0378 3.98958 83.0049 3.90039C82.3338 2.08648 80.7794 0.673542 78.8916 0.21582L78 0H297L296.108 0.21582Z" fill="#030303"/></svg>`;

const SVG_X_WIFI = `<svg width="15.3333" height="11" viewBox="0 0 15.3333 11" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M7.66707 2.28448C9.8918 2.28457 12.0315 3.13869 13.6438 4.67028C13.7652 4.78852 13.9593 4.78703 14.0789 4.66693L15.2395 3.4966C15.3 3.43569 15.3338 3.35318 15.3333 3.26733C15.3328 3.18148 15.2981 3.09937 15.2368 3.03917C11.0049 -1.01306 4.32857 -1.01306 0.0966565 3.03917C0.0353544 3.09933 0.000572274 3.18141 6.99859e-06 3.26726C-0.000558277 3.35311 0.0331399 3.43565 0.0936446 3.4966L1.25459 4.66693C1.37409 4.78721 1.56831 4.78871 1.68965 4.67028C3.30221 3.13859 5.44212 2.28447 7.66707 2.28448ZM7.66707 6.09206C8.88942 6.09199 10.0681 6.54594 10.9742 7.36571C11.0968 7.48206 11.2898 7.47954 11.4093 7.36003L12.5685 6.1897C12.6296 6.12831 12.6635 6.04504 12.6626 5.9585C12.6617 5.87197 12.6261 5.78939 12.5639 5.72926C9.8047 3.16485 5.53178 3.16485 2.77262 5.72926C2.7103 5.78939 2.67474 5.87201 2.67392 5.95857C2.6731 6.04513 2.70709 6.1284 2.76827 6.1897L3.92721 7.36003C4.04667 7.47954 4.23972 7.48206 4.36227 7.36571C5.26774 6.54648 6.44553 6.09257 7.66707 6.09206ZM9.98929 8.6539C9.99106 8.74068 9.95692 8.82434 9.89492 8.88514L7.88962 10.9071C7.83084 10.9666 7.75069 11 7.66707 11C7.58345 11 7.5033 10.9666 7.44452 10.9071L5.43888 8.88514C5.37693 8.8243 5.34284 8.7406 5.34468 8.65383C5.34652 8.56705 5.38411 8.48487 5.44859 8.4267C6.72925 7.34443 8.60489 7.34443 9.88555 8.4267C9.94998 8.48492 9.98752 8.56712 9.98929 8.6539Z" fill="#1B1B1B"/></svg>`;

const SVG_X_CELLULAR = `<svg width="17" height="10.6667" viewBox="0 0 17 10.6667" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M16 0H15C14.4477 0 14 0.447715 14 1V9.66667C14 10.219 14.4477 10.6667 15 10.6667H16C16.5523 10.6667 17 10.219 17 9.66667V1C17 0.447715 16.5523 0 16 0ZM10.3333 2.33333H11.3333C11.8856 2.33333 12.3333 2.78105 12.3333 3.33333V9.66667C12.3333 10.219 11.8856 10.6667 11.3333 10.6667H10.3333C9.78105 10.6667 9.33333 10.219 9.33333 9.66667V3.33333C9.33333 2.78105 9.78105 2.33333 10.3333 2.33333ZM6.66667 4.66667H5.66667C5.11438 4.66667 4.66667 5.11438 4.66667 5.66667V9.66667C4.66667 10.219 5.11438 10.6667 5.66667 10.6667H6.66667C7.21895 10.6667 7.66667 10.219 7.66667 9.66667V5.66667C7.66667 5.11438 7.21895 4.66667 6.66667 4.66667ZM2 6.66667H1C0.447715 6.66667 0 7.11438 0 7.66667V9.66667C0 10.219 0.447715 10.6667 1 10.6667H2C2.55228 10.6667 3 10.219 3 9.66667V7.66667C3 7.11438 2.55228 6.66667 2 6.66667Z" fill="#1B1B1B"/></svg>`;

const SVG_ISLAND = `<svg width="111" height="31" viewBox="0 0 111 31" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="110" height="31" rx="15.5" fill="#030303"/><circle cx="93.6202" cy="15.6202" r="9.62021" fill="#0E0B0F"/><circle cx="93.62" cy="15.6202" r="5.34456" fill="#161424"/><circle cx="93.6203" cy="15.6202" r="3.20674" fill="#0F0F2A"/><circle cx="93.6202" cy="14.5512" r="1.06891" fill="#393752"/></svg>`;

const SVG_ISLAND_LEVELS = `<svg width="93.5" height="22" viewBox="0 0 93.5 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M19.2 6.03302C19.2 5.39998 18.7224 4.88679 18.1333 4.88679H17.0667C16.4776 4.88679 16 5.39998 16 6.03302V15.967C16 16.6 16.4776 17.1132 17.0667 17.1132H18.1333C18.7224 17.1132 19.2 16.6 19.2 15.967V6.03302ZM11.7659 7.33207H12.8326C13.4217 7.33207 13.8992 7.85757 13.8992 8.50581V15.9395C13.8992 16.5877 13.4217 17.1132 12.8326 17.1132H11.7659C11.1768 17.1132 10.6992 16.5877 10.6992 15.9395V8.50581C10.6992 7.85757 11.1768 7.33207 11.7659 7.33207ZM7.43411 9.98112H6.36745C5.77834 9.98112 5.30078 10.5133 5.30078 11.1698V15.9245C5.30078 16.581 5.77834 17.1132 6.36745 17.1132H7.43411C8.02322 17.1132 8.50078 16.581 8.50078 15.9245V11.1698C8.50078 10.5133 8.02322 9.98112 7.43411 9.98112ZM2.13333 12.4264H1.06667C0.477563 12.4264 0 12.951 0 13.5981V15.9415C0 16.5886 0.477563 17.1132 1.06667 17.1132H2.13333C2.72244 17.1132 3.2 16.5886 3.2 15.9415V13.5981C3.2 12.951 2.72244 12.4264 2.13333 12.4264Z" fill="#1B1B1B"/><path fill-rule="evenodd" clip-rule="evenodd" d="M39.7713 7.30213C42.2584 7.30223 44.6504 8.22432 46.4529 9.8778C46.5887 10.0055 46.8056 10.0038 46.9393 9.87419L48.2368 8.61072C48.3045 8.54496 48.3422 8.45588 48.3417 8.3632C48.3411 8.27052 48.3023 8.18188 48.2338 8.11688C43.5028 3.74217 36.0391 3.74217 31.3081 8.11688C31.2395 8.18183 31.2006 8.27045 31.2 8.36313C31.1994 8.45581 31.237 8.54491 31.3047 8.61072L32.6026 9.87419C32.7362 10.004 32.9533 10.0056 33.0889 9.8778C34.8917 8.22421 37.2839 7.30212 39.7713 7.30213ZM39.7679 11.5224C41.1253 11.5223 42.4341 12.0341 43.4403 12.9582C43.5764 13.0893 43.7907 13.0865 43.9234 12.9518L45.2107 11.6325C45.2784 11.5633 45.3161 11.4694 45.3151 11.3718C45.3141 11.2743 45.2746 11.1812 45.2054 11.1134C42.1416 8.22257 37.3969 8.22257 34.333 11.1134C34.2638 11.1812 34.2244 11.2743 34.2234 11.3719C34.2225 11.4695 34.2603 11.5634 34.3282 11.6325L35.6151 12.9518C35.7478 13.0865 35.9621 13.0893 36.0982 12.9582C37.1037 12.0347 38.4115 11.523 39.7679 11.5224ZM42.2924 14.316C42.2943 14.4213 42.2572 14.5229 42.1899 14.5967L40.0133 17.0514C39.9495 17.1236 39.8625 17.1642 39.7717 17.1642C39.6809 17.1642 39.5939 17.1236 39.5301 17.0514L37.3531 14.5967C37.2859 14.5228 37.2489 14.4212 37.2509 14.3159C37.2528 14.2105 37.2937 14.1108 37.3636 14.0401C38.7537 12.7262 40.7897 12.7262 42.1798 14.0401C42.2497 14.1108 42.2904 14.2106 42.2924 14.316Z" fill="#1B1B1B"/><rect opacity="0.35" x="60.8417" y="5" width="24" height="12" rx="3.8" stroke="#1B1B1B"/><path opacity="0.4" d="M86.3417 9V13.0755C87.1464 12.7303 87.6697 11.9273 87.6697 11.0377C87.6697 10.1481 87.1464 9.34517 86.3417 9" fill="#1B1B1B"/><rect x="62.3417" y="6.5" width="21" height="9" rx="2.5" fill="#1B1B1B"/></svg>`;

// ---- layout tables ----------------------------------------------------------

const STATUS_BARS: StatusBarDef[] = [
  {
    kind: "se",
    label: "SE",
    width: 320,
    height: 20,
    pieces: [
      { name: "Mobile Signal", svg: SVG_SE_SIGNAL, x: 7, y: 5, w: 14.5, h: 9.5, anchor: "left" },
      { name: "Carrier", text: { chars: "XX", fontSize: 12, weight: "Regular" }, x: 26, y: 3.5, w: 17, h: 14, anchor: "left" },
      { name: "Wifi", svg: SVG_SE_WIFI, x: 45.5, y: 5.5, w: 13, h: 9, anchor: "left" },
      { name: "Time", text: { chars: "9:41 AM", fontSize: 12, weight: "Medium" }, x: 136, y: 3.5, w: 49, h: 14, anchor: "center" },
      { name: "Percent", text: { chars: "100%", fontSize: 12, weight: "Regular" }, x: 255, y: 3.5, w: 33, h: 14, anchor: "right" },
      { name: "Battery Stroke", svg: SVG_BATTERY_STROKE, x: 291, y: 5, w: 24.5, h: 10.5, anchor: "right" },
      { name: "Battery Fill", rect: { radius: 1.6 }, x: 293, y: 7, w: 18, h: 6.5, anchor: "right" },
    ],
  },
  {
    kind: "notch",
    label: "Notch",
    width: 375,
    height: 44,
    pieces: [
      { name: "Time", text: { chars: "9:41", fontSize: 16, weight: "Semi Bold" }, x: 21, y: 14, w: 54, h: 18, anchor: "left" },
      { name: "Notch", svg: SVG_NOTCH, x: 78, y: 0, w: 219, h: 31, anchor: "center", chrome: true },
      { name: "Cellular Connection", svg: SVG_X_CELLULAR, x: 294, y: 17.6667, w: 17, h: 10.6667, anchor: "right" },
      { name: "Wifi", svg: SVG_X_WIFI, x: 316, y: 17.3307, w: 15.3333, h: 11, anchor: "right" },
      { name: "Battery Stroke", svg: SVG_BATTERY_STROKE, x: 336, y: 18, w: 24.5, h: 10.5, anchor: "right" },
      { name: "Battery Fill", rect: { radius: 1.6 }, x: 338, y: 20, w: 18, h: 6.5, anchor: "right" },
    ],
  },
  {
    kind: "island",
    label: "Island",
    width: 375,
    height: 54,
    pieces: [
      { name: "Time", text: { chars: "10:09", fontSize: 17, weight: "Semi Bold" }, x: 47.25, y: 16, w: 47, h: 22, anchor: "left" },
      { name: "Dynamic Island", svg: SVG_ISLAND, x: 132, y: 12, w: 111, h: 31, anchor: "center", chrome: true },
      { name: "Levels", svg: SVG_ISLAND_LEVELS, x: 257.5, y: 16, w: 93.5, h: 22, anchor: "right" },
    ],
  },
];

// ---- building ---------------------------------------------------------------

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** Repaint every solid fill/stroke in a subtree, preserving per-paint opacity. */
function repaint(node: SceneNode, colour: RGB) {
  if ("fills" in node && node.fills !== figma.mixed && Array.isArray(node.fills)) {
    node.fills = node.fills.map((p) =>
      p.type === "SOLID" ? { ...p, color: colour } : p
    );
  }
  if ("strokes" in node && Array.isArray(node.strokes)) {
    node.strokes = node.strokes.map((p) =>
      p.type === "SOLID" ? { ...p, color: colour } : p
    );
  }
  if ("children" in node) {
    for (const child of node.children) repaint(child, colour);
  }
}

const CONSTRAINT_X: Record<Anchor, ConstraintType> = {
  left: "MIN",
  center: "CENTER",
  right: "MAX",
};

async function loadPieceFonts() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
}

function buildPiece(def: PieceDef, contentColour: RGB): SceneNode {
  let node: SceneNode;
  if (def.svg) {
    const wrap = figma.createNodeFromSvg(def.svg);
    wrap.fills = [];
    wrap.clipsContent = false;
    if (!def.chrome) repaint(wrap, contentColour);
    node = wrap;
  } else if (def.text) {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: def.text.weight };
    t.fontSize = def.text.fontSize;
    t.characters = def.text.chars;
    t.textAlignHorizontal = "CENTER";
    t.textAlignVertical = "CENTER";
    t.textAutoResize = "NONE";
    t.resize(def.w, def.h);
    t.fills = [{ type: "SOLID", color: contentColour }];
    node = t;
  } else {
    const r = figma.createRectangle();
    r.resize(def.w, def.h);
    r.cornerRadius = def.rect ? def.rect.radius : 0;
    r.fills = [{ type: "SOLID", color: contentColour }];
    node = r;
  }
  node.name = def.name;
  node.x = def.x;
  node.y = def.y;
  return node;
}

function buildVariant(def: StatusBarDef, mode: "Light" | "Dark"): ComponentNode {
  const bg = mode === "Light" ? CONTENT_LIGHT : CONTENT_DARK;
  const content = mode === "Light" ? CONTENT_DARK : CONTENT_LIGHT;
  const contentRgb = hexToRgb(content);

  const comp = figma.createComponent();
  comp.name = `Device=${def.label}, Mode=${mode}`;
  comp.resize(def.width, def.height);
  comp.fills = [{ type: "SOLID", color: hexToRgb(bg) }];
  comp.clipsContent = false;

  for (const piece of def.pieces) {
    const node = buildPiece(piece, contentRgb);
    comp.appendChild(node);
    node.x = piece.x;
    node.y = piece.y;
    if ("constraints" in node) {
      node.constraints = { horizontal: CONSTRAINT_X[piece.anchor], vertical: "MIN" };
    }
  }
  return comp;
}

/** Lowest free Y on a page, so we drop our section clear of existing content. */
function freeSpotY(page: PageNode): number {
  let maxBottom = 0;
  let any = false;
  for (const c of page.children) {
    if ("y" in c && "height" in c) {
      any = true;
      maxBottom = Math.max(maxBottom, c.y + c.height);
    }
  }
  return any ? maxBottom + 120 : 0;
}

async function buildComponentSet(): Promise<ComponentSetNode> {
  await loadPieceFonts();

  let page = figma.root.children.find((p) => p.name === COMPONENTS_PAGE_NAME);
  if (!page) {
    page = figma.createPage();
    page.name = COMPONENTS_PAGE_NAME;
  }
  await page.loadAsync();

  // Remove a stale section from a previous build so rebuilds don't stack up.
  for (const child of page.children) {
    if (child.type === "SECTION" && child.name === SECTION_NAME) child.remove();
  }

  // Drop everything below whatever already lives on the page.
  const baseX = 0;
  const baseY = freeSpotY(page);
  const PAD = 40;

  const variants: ComponentNode[] = [];
  STATUS_BARS.forEach((def, i) => {
    (["Light", "Dark"] as const).forEach((mode, m) => {
      const comp = buildVariant(def, mode);
      // combineAsVariants requires nodes to already live on the target page.
      page.appendChild(comp);
      comp.x = baseX + PAD + i * 480;
      comp.y = baseY + PAD + m * 120;
      variants.push(comp);
    });
  });

  const set = figma.combineAsVariants(variants, page);
  set.name = "Status Bar";
  set.setPluginData("rt-sb-version", STATUS_BAR_VERSION);

  // Wrap the set in a titled Section so the components read as a tidy group
  // rather than floating loose on the canvas.
  const section = figma.createSection();
  section.name = SECTION_NAME;
  page.appendChild(section);
  section.resizeWithoutConstraints(set.width + PAD * 2, set.height + PAD * 2);
  section.x = baseX;
  section.y = baseY;
  section.appendChild(set); // keeps the set's absolute position

  figma.root.setPluginData(ROOT_KEY, `${set.id}|${STATUS_BAR_VERSION}`);
  return set;
}

let setPromise: Promise<ComponentSetNode> | null = null;

/** Find the materialised component set (rebuilding if missing/stale). */
function ensureStatusBarSet(): Promise<ComponentSetNode> {
  if (!setPromise) {
    setPromise = (async () => {
      const stored = figma.root.getPluginData(ROOT_KEY);
      const [id, version] = stored ? stored.split("|") : ["", ""];
      if (id && version === STATUS_BAR_VERSION) {
        const node = await figma.getNodeByIdAsync(id);
        if (node && node.type === "COMPONENT_SET" && !node.removed) return node;
      }
      return buildComponentSet();
    })();
    // Allow a retry on the next run if this one fails.
    setPromise.catch(() => {
      setPromise = null;
    });
  }
  return setPromise;
}

// ---- placing ----------------------------------------------------------------

/**
 * Drop a status bar instance on top of a screenshot frame. The frame keeps its
 * image fill untouched — the bar is just a child covering the top strip.
 */
export async function placeStatusBar(
  frame: FrameNode,
  device: DevicePreset,
  sample: StatusBarSample
): Promise<void> {
  if (!device.statusBarKind) return;
  const def = STATUS_BARS.find((d) => d.kind === device.statusBarKind);
  if (!def) return;

  const set = await ensureStatusBarSet();
  const instance = set.defaultVariant.createInstance();
  instance.setProperties({
    Device: def.label,
    Mode: sample.mode === "light" ? "Light" : "Dark",
  });
  instance.name = "Status Bar";
  instance.setPluginData(STATUS_BAR_CHILD_KEY, "1");

  // Sampled screenshot colour overrides the sentinel background.
  instance.fills = [{ type: "SOLID", color: hexToRgb(sample.bg) }];

  // Size at logical points first (anchors reposition, nothing distorts), then
  // rescale uniformly in case the screenshot wasn't Retina-resized to points.
  instance.resize(device.ptWidth, device.statusBarHeight);
  const scale = frame.width / device.ptWidth;
  if (Math.abs(scale - 1) > 0.001) instance.rescale(scale);

  frame.appendChild(instance);
  instance.x = 0;
  instance.y = 0;
  instance.constraints = { horizontal: "STRETCH", vertical: "MIN" };
}
