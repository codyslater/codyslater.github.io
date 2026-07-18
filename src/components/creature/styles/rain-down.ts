import type { Style } from "../types";
import { pixelsFromGrid, progress } from "./helpers";

// Birth — off-screen / above → down / accelerating fall with one small
// bounce on landing / random stagger.
export const rainDown: Style = {
  name: "rain-down",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => ({
      ...p,
      startR: -1 - rng() * 5,
      startC: p.targetC,
      phase: (0.6 + rng() * 0.8) * intensity, // bounce amplitude, grid units
      delay: rng() * 260,
      duration: 300 + rng() * 140,
    }));
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const t = progress(p, elapsed);
      if (t < 1) running = true;
      if (elapsed < p.delay) { p.alpha = 0; continue; }
      p.alpha = 1;
      if (t < 0.7) {
        const f = t / 0.7;
        p.r = p.startR + (p.targetR - p.startR) * f * f; // accelerating fall
      } else {
        const b = (t - 0.7) / 0.3;
        p.r = p.targetR - Math.sin(b * Math.PI) * p.phase; // one bounce, lands exactly
      }
    }
    return running;
  },
};
