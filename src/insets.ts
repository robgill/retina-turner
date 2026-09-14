// Fixed crop insets for macOS full-window screenshots.
//
// When you screenshot an entire app window (⌘⇧4 then Space), macOS bakes in a
// drop shadow + transparent padding of a *consistent pixel size*, the same on
// Retina and non-Retina displays. So instead of sniffing alpha bounds (which is
// fragile), we just crop these fixed amounts off each edge.
//
// Measured empirically — tweak here if Apple ever changes the shadow.

import { MacShadowInsets } from "./types";

// Base shadow/padding + 1px extra on every edge to trim the occasional
// anti-aliased fringe left at the window boundary.
export const MAC_SHADOW_INSETS: MacShadowInsets = {
  left: 57,
  right: 57,
  top: 39,
  bottom: 75,
};

// Once the shadow is clipped, the frame's rectangular corners expose the
// transparent triangles left by the macOS window's own rounded corners.
// Rounding the frame by this much masks them. All Mac windows are this shape.
export const MAC_WINDOW_CORNER_RADIUS = 17;
