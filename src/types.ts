// Shared types for messages passed between the main thread (code.ts) and the
// UI iframe (ui.html). All pixel work lives in the UI (it has a DOM/canvas);
// the main thread owns the document, the data tables, and clientStorage.

import type { FontChoice } from "./styles";

export type TabId = "computer" | "phone";

/** Which title font the user picked: an id from FONT_CHOICES in styles.ts
 * (mapped to a real font on the main thread). Kept loose so the font list is
 * data, not a type — old ids in saved prefs/stamps still round-trip. */
export type FontId = string;

/** Frame outline + shadow look. Values resolved in code.ts (see OUTLINES). */
export type OutlineId = "none" | "simple" | "soft";

/** The WYSIWYG style choices applied to the output frame + title label. */
export interface FrameStyle {
  titleOn: boolean;
  font: FontId;
  fontColour: string; // hex, e.g. "#6b7280"
  cornerRadius: number; // px: 17 | 22 | 41.5
  outline: OutlineId;
}

/** Which status bar family a device wears (absent = no swap offered). */
export type StatusBarKind = "se" | "notch" | "island";

/** Colour sampled from a screenshot's status bar strip by the UI canvas. */
export interface StatusBarSample {
  bg: string; // hex of the dominant strip colour
  mode: "light" | "dark"; // iOS interface style implied by that colour
}

/** One physical device the plugin can recognise and size to. */
export interface DevicePreset {
  key: string;
  name: string;
  pxWidth: number;
  pxHeight: number;
  ptWidth: number;
  ptHeight: number;
  scale: number;
  cornerRadius: number;
  statusBarHeight: number;
  statusBarKind?: StatusBarKind;
}

/** Fixed pixel crop amounts for macOS window-screenshot shadow/padding. */
export interface MacShadowInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Snapshot of an image node handed from the main thread to the UI. */
export interface ImagePayload {
  id: string;
  name: string;
  bytes: Uint8Array;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
}

/** Per-run options the UI collects and echoes back to the main thread. */
export interface ProcessOptions {
  tab: TabId;
  style: FrameStyle;
  // Computer tab
  clipShadow?: boolean;
  // Both tabs: overlay a status bar when the device is a phone
  statusBar?: boolean;
  // Both: chosen/overridden device ("" = none/auto)
  deviceKey?: string;
  /** Both tabs: keep the source pixels in the image fill (no canvas
   * downsample). Frames still get their exact pt sizes. */
  keepQuality?: boolean;
}

/** One finished image the UI hands back for framing. */
export interface ProcessedItem {
  id: string;
  bytes: Uint8Array;
  width: number; // final frame width (canvas units)
  height: number;
  x: number;
  y: number;
  title: string; // label / frame name (from layer or device name)
  deviceKey?: string;
  /** Present when the UI wants a status bar overlaid on this item. */
  statusBar?: StatusBarSample;
}

/** What we stamp on every output frame via setPluginData (as JSON), so the
 * plugin can recognise and restyle its own frames in a later session. */
export interface Stamp {
  version: 1;
  tab: TabId;
  style: FrameStyle;
  deviceKey?: string;
}

/** A previously-styled frame found in the current selection. Carries enough
 * context (origin tab, device, image bytes) for the UI to re-sample and
 * add/remove a status bar during a restyle. */
export interface StyledItem {
  id: string;
  name: string;
  style: FrameStyle;
  tab: TabId;
  deviceKey?: string;
  width: number;
  height: number;
  bytes?: Uint8Array; // the frame's image fill, for status-bar sampling
}

/** Per-frame status bar intent sent along with a restyle. */
export interface RestyleStatusBar {
  id: string;
  on: boolean;
  sample: StatusBarSample | null; // null when on=true but sampling failed
}

/** Per-tab persisted preferences. */
export interface TabPrefs {
  deviceKey: string;
  clipShadow: boolean; // computer only
  statusBarOn: boolean; // both tabs (needs a phone device to take effect)
  keepQuality: boolean; // both tabs; default true (crisper fill, bigger file)
  titleOn: boolean;
  font: FontId;
  fontColour: string;
  cornerRadius: number;
  outline: OutlineId;
}

export interface Prefs {
  activeTab: TabId;
  computer: TabPrefs;
  phone: TabPrefs;
}

// ---- Message envelopes ----

export type MainToUI =
  | {
      type: "config";
      devices: DevicePreset[];
      fonts: FontChoice[];
      prefs: Prefs;
      insets: MacShadowInsets;
    }
  | { type: "images"; images: ImagePayload[]; styled: StyledItem[] };

export type UIToMain =
  | { type: "ready" }
  | { type: "process"; options: ProcessOptions; items: ProcessedItem[] }
  | {
      type: "restyle";
      ids: string[];
      style: FrameStyle;
      statusBar: RestyleStatusBar[];
    }
  | { type: "save-prefs"; prefs: Prefs }
  | { type: "notify"; message: string }
  | { type: "cancel" };
