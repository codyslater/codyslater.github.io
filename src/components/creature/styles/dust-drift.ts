import { GRID, PAD } from "../geometry";
import type { Style } from "../types";
import { pixelsFromGrid, progress } from "./helpers";

// Death — off-screen / sideways wind / drag with alpha fade / column sweep
// (upwind columns crumble first).
export const dustDrift: Style = {
  name: "dust-drift",
  init(grid, rng, intensity) {
    const wind = rng() < 0.5 ? 1 : -1;
    return pixelsFromGrid(grid).map((p) => {
      const col = p.targetC - PAD;
      return {
        ...p,
        vc: wind * (14 + rng() * 8) * intensity, // drift distance
        vr: (rng() - 0.3) * 3, // slight vertical waft
        delay: (wind === 1 ? col : GRID - 1 - col) * 12 + rng() * 15,
        duration: 340,
      };
    });
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const t = progress(p, elapsed);
      if (t < 1) running = true;
      if (elapsed < p.delay) continue;
      const f = 1 - Math.exp(-3 * t);
      p.c = p.startC + p.vc * f;
      p.r = p.startR + p.vr * t;
      p.alpha = 1 - t * t;
    }
    return running;
  },
};
