// Device preset table — iPhone-only for now. Add new devices here — this module
// is intentionally standalone so the table can grow without touching plugin
// logic.
//
// pxWidth/pxHeight are the native *portrait* capture resolutions. The plugin
// matches a screenshot against these in either orientation. ptWidth/ptHeight
// are the logical point sizes we resize down to. statusBarHeight is in points
// and feeds the Phase 2 status-bar replacement.

import { DevicePreset } from "./types";

export const DEVICES: DevicePreset[] = [
  // ---- iPhone (newest first) ----
  {
    key: "iphone-17-pro-max",
    name: "iPhone 17 Pro Max / 16 Pro Max",
    pxWidth: 1320,
    pxHeight: 2868,
    ptWidth: 440,
    ptHeight: 956,
    scale: 3,
    cornerRadius: 62,
    statusBarHeight: 62,
    statusBarKind: "island",
  },
  {
    key: "iphone-17",
    name: "iPhone 17 / 17 Pro / 16 Pro",
    pxWidth: 1206,
    pxHeight: 2622,
    ptWidth: 402,
    ptHeight: 874,
    scale: 3,
    cornerRadius: 62,
    statusBarHeight: 62,
    statusBarKind: "island",
  },
  {
    key: "iphone-air",
    name: "iPhone Air",
    pxWidth: 1260,
    pxHeight: 2736,
    ptWidth: 420,
    ptHeight: 912,
    scale: 3,
    cornerRadius: 62,
    statusBarHeight: 62,
    statusBarKind: "island",
  },
  {
    key: "iphone-15-pro-max",
    name: "iPhone 16 Plus / 15 Pro Max / 15 Plus",
    pxWidth: 1290,
    pxHeight: 2796,
    ptWidth: 430,
    ptHeight: 932,
    scale: 3,
    cornerRadius: 55,
    statusBarHeight: 59,
    statusBarKind: "island",
  },
  {
    key: "iphone-15-plus",
    name: "iPhone 15 Plus",
    pxWidth: 1290,
    pxHeight: 2796,
    ptWidth: 430,
    ptHeight: 932,
    scale: 3,
    cornerRadius: 55,
    statusBarHeight: 59,
    statusBarKind: "island",
  },
  {
    key: "iphone-15-pro",
    name: "iPhone 16 / 15 Pro / 15 / 14 Pro",
    pxWidth: 1179,
    pxHeight: 2556,
    ptWidth: 393,
    ptHeight: 852,
    scale: 3,
    cornerRadius: 55,
    statusBarHeight: 59,
    statusBarKind: "island",
  },
  {
    key: "iphone-14-plus",
    name: "iPhone 14 Plus / 13 Pro Max / 12 Pro Max",
    pxWidth: 1284,
    pxHeight: 2778,
    ptWidth: 428,
    ptHeight: 926,
    scale: 3,
    cornerRadius: 53,
    statusBarHeight: 47,
    statusBarKind: "notch",
  },
  {
    key: "iphone-14",
    name: "iPhone 16e / 14 / 13 / 13 Pro / 12 / 12 Pro",
    pxWidth: 1170,
    pxHeight: 2532,
    ptWidth: 390,
    ptHeight: 844,
    scale: 3,
    cornerRadius: 47,
    statusBarHeight: 47,
    statusBarKind: "notch",
  },
  {
    key: "iphone-13-mini",
    name: "iPhone 13 mini / 12 mini",
    pxWidth: 1080,
    pxHeight: 2340,
    ptWidth: 360,
    ptHeight: 780,
    scale: 3,
    cornerRadius: 44,
    statusBarHeight: 50,
    statusBarKind: "notch",
  },
  {
    key: "iphone-11-pro-max",
    name: "iPhone 11 Pro Max / XS Max",
    pxWidth: 1242,
    pxHeight: 2688,
    ptWidth: 414,
    ptHeight: 896,
    scale: 3,
    cornerRadius: 44,
    statusBarHeight: 44,
    statusBarKind: "notch",
  },
  {
    key: "iphone-11-pro",
    name: "iPhone 11 Pro / XS / X",
    pxWidth: 1125,
    pxHeight: 2436,
    ptWidth: 375,
    ptHeight: 812,
    scale: 3,
    cornerRadius: 44,
    statusBarHeight: 44,
    statusBarKind: "notch",
  },
  {
    key: "iphone-11",
    name: "iPhone 11 / XR",
    pxWidth: 828,
    pxHeight: 1792,
    ptWidth: 414,
    ptHeight: 896,
    scale: 2,
    cornerRadius: 41.5,
    statusBarHeight: 44,
    statusBarKind: "notch",
  },
  {
    key: "iphone-se-3",
    name: "iPhone SE (2nd/3rd gen) / 8 / 7",
    pxWidth: 750,
    pxHeight: 1334,
    ptWidth: 375,
    ptHeight: 667,
    scale: 2,
    cornerRadius: 0,
    statusBarHeight: 20,
    statusBarKind: "se",
  },
];

/**
 * Best-effort device match by pixel dimensions, orientation-agnostic.
 * Returns undefined when nothing matches within tolerance.
 */
export function detectDevice(
  pxW: number,
  pxH: number,
  tolerance = 2
): DevicePreset | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  return DEVICES.find(
    (d) =>
      (near(pxW, d.pxWidth) && near(pxH, d.pxHeight)) ||
      (near(pxW, d.pxHeight) && near(pxH, d.pxWidth)) // landscape capture
  );
}

export function deviceByKey(key: string | undefined): DevicePreset | undefined {
  return DEVICES.find((d) => d.key === key);
}
