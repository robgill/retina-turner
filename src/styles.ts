// Frame style building blocks, taken from the three reference frames in the
// Figma file (Clean / Note / Blur). Standalone so the looks are easy to tweak.

import { OutlineId } from "./types";

export interface ShadowDef {
  x: number;
  y: number;
  blur: number;
  color: string; // hex
  opacity: number; // 0..1
}

export interface OutlineDef {
  stroke?: string; // hex; omit for no border
  strokeWeight?: number;
  shadows: ShadowDef[];
}

// Corner-radius options offered in the UI (px).
export const CORNER_RADII = { clean: 17, mid: 22, iphone: 41.5 };

// Outline & Shadow options.
//  - none   → Clean frame: no border, no shadow
//  - simple → Note frame:  thick border + a hard offset shadow
//  - soft   → Blur frame:  thick border + a big soft blurred shadow
export const OUTLINES: Record<OutlineId, OutlineDef> = {
  none: { shadows: [] },
  simple: {
    stroke: "#2c2c2c",
    strokeWeight: 12,
    shadows: [{ x: -20, y: 20, blur: 0, color: "#000000", opacity: 0.12 }],
  },
  soft: {
    stroke: "#2c2c2c",
    strokeWeight: 12,
    shadows: [
      { x: 0, y: 11, blur: 40, color: "#000000", opacity: 0.36 },
      { x: 0, y: 38, blur: 50, color: "#000000", opacity: 0.15 },
    ],
  },
};

// Title fonts offered in the dropdown. Data-driven so adding one is a single
// entry here: the ids travel in prefs/stamps, the css string drives the UI
// preview, and the candidates are tried in order on the main thread (they are
// all Google Fonts, so Figma has them — but a chain always ends at Inter).
export interface FontChoice {
  id: string; // stored in prefs/stamps
  label: string; // dropdown text
  css: string; // CSS font-family stack for the UI preview
  candidates: FontName[]; // tried in order on the main thread
}

const INTER_FALLBACK: FontName = { family: "Inter", style: "Medium" };

export const FONT_CHOICES: FontChoice[] = [
  {
    id: "inter",
    label: "Inter",
    css: "Inter, -apple-system, sans-serif",
    candidates: [INTER_FALLBACK],
  },
  {
    id: "roboto",
    label: "Roboto",
    css: "Roboto, sans-serif",
    candidates: [{ family: "Roboto", style: "Medium" }, INTER_FALLBACK],
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    css: '"Space Grotesk", sans-serif',
    candidates: [{ family: "Space Grotesk", style: "Medium" }, INTER_FALLBACK],
  },
  {
    id: "fira",
    label: "Fira Mono",
    css: '"Fira Mono", "Roboto Mono", monospace',
    candidates: [
      { family: "Fira Mono", style: "Medium" },
      { family: "Roboto Mono", style: "Medium" },
      INTER_FALLBACK,
    ],
  },
  {
    id: "roboto-mono",
    label: "Roboto Mono",
    css: '"Roboto Mono", monospace',
    candidates: [{ family: "Roboto Mono", style: "Medium" }, INTER_FALLBACK],
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    css: '"JetBrains Mono", monospace',
    candidates: [{ family: "JetBrains Mono", style: "Medium" }, INTER_FALLBACK],
  },
];

export function fontChoiceById(id: string): FontChoice {
  for (const choice of FONT_CHOICES) {
    if (choice.id === id) return choice;
  }
  return FONT_CHOICES[0];
}

// Title label sizing (px). Reference frames use ~20px.
export const TITLE_FONT_SIZE = 20;

// Gap between the title label and the screenshot frame (px), per the designs.
export const TITLE_GAP = 48;
