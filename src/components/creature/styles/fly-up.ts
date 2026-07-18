import { GRID, PAD, UNITS } from "../geometry";
import type { Style } from "../types";
import { easeOutCubic, pixelsFromGrid, progress } from "./helpers";

// Birth — canvas-wide / below → up / eased tween / bottom-up rows.
export const flyUp: Style = {
  name: "fly-up",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => ({
      ...p,
      startR: UNITS - 1 + rng() * 3,
      startC: p.targetC + (rng() - 0.5) * 2 * PAD * intensity,
      delay: (GRID - 1 - (p.targetR - PAD)) * 25 + rng() * 30,
      duration: 280 + rng() * 120,
    }));
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const t = progress(p, elapsed);
      if (t < 1) running = true;
      if (elapsed < p.delay) { p.alpha = 0; continue; }
      p.alpha = 1;
      const e = easeOutCubic(t);
      p.r = p.startR + (p.targetR - p.startR) * e;
      p.c = p.startC + (p.targetC - p.startC) * e;
    }
    return running;
  },
};
