import type { Style } from "../types";
import { clamp01, pixelsFromGrid } from "./helpers";

// Reduced-motion substitutes: pure alpha ramps, no movement. Not part of
// the BIRTHS/DEATHS registries.
export const fadeIn: Style = {
  name: "fade-in",
  init(grid) {
    return pixelsFromGrid(grid).map((p) => ({ ...p, alpha: 0 }));
  },
  step(pixels, elapsed) {
    const t = clamp01(elapsed / 250);
    for (const p of pixels) p.alpha = t;
    return t < 1;
  },
};

export const fadeOut: Style = {
  name: "fade-out",
  init(grid) {
    return pixelsFromGrid(grid);
  },
  step(pixels, elapsed) {
    const t = clamp01(elapsed / 250);
    for (const p of pixels) p.alpha = 1 - t;
    return t < 1;
  },
};
