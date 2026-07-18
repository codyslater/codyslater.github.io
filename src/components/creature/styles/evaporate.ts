import { PAD } from "../geometry";
import type { Style } from "../types";
import { pixelsFromGrid, progress } from "./helpers";

// Death — canvas-wide / upward / floaty drag with sine wobble, alpha fade /
// top-down rows.
export const evaporate: Style = {
  name: "evaporate",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => ({
      ...p,
      vr: (6 + rng() * 4) * intensity, // rise distance, grid units
      phase: rng() * Math.PI * 2, // wobble phase
      delay: (p.targetR - PAD) * 9 + rng() * 15, // top rows first
      duration: 320,
    }));
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const t = progress(p, elapsed);
      if (t < 1) running = true;
      if (elapsed < p.delay) continue;
      p.r = p.startR - p.vr * t;
      p.c = p.startC + Math.sin(p.phase + t * 6) * 0.6 * t; // wobble grows as it rises
      p.alpha = 1 - t;
    }
    return running;
  },
};
