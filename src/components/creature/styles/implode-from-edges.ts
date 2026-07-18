import { CENTER } from "../geometry";
import type { Style } from "../types";
import { pixelsFromGrid, progress } from "./helpers";

// Birth — off-screen / all four edges → inward / impulse + drag decay /
// radial stagger (innermost first).
export const implodeFromEdges: Style = {
  name: "implode-from-edges",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => {
      const dr = p.targetR - CENTER;
      const dc = p.targetC - CENTER;
      const len = Math.hypot(dr, dc) || 1;
      const dist = (CENTER + 3 + rng() * 3) * intensity; // start beyond the edges
      return {
        ...p,
        startR: p.targetR + (dr / len) * dist,
        startC: p.targetC + (dc / len) * dist,
        delay: len * 22 + rng() * 40,
        duration: 320 + rng() * 100,
      };
    });
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const t = progress(p, elapsed);
      if (t < 1) running = true;
      if (elapsed < p.delay) { p.alpha = 0; continue; }
      p.alpha = 1;
      // hard arrival impulse that drains to exactly 0 at t = 1
      const decay = Math.exp(-5 * t) * (1 - t);
      p.r = p.targetR + (p.startR - p.targetR) * decay;
      p.c = p.targetC + (p.startC - p.targetC) * decay;
    }
    return running;
  },
};
