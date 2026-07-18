import { CENTER } from "../geometry";
import type { Style } from "../types";
import { pixelsFromGrid, progress } from "./helpers";

// Death — off-screen / center-out radial / impulse + drag / simultaneous.
export const explosion: Style = {
  name: "explosion",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => {
      const dr = p.targetR - CENTER + (rng() - 0.5) * 2;
      const dc = p.targetC - CENTER + (rng() - 0.5) * 2;
      const len = Math.hypot(dr, dc) || 1;
      const dist = (20 + rng() * 10) * intensity; // well past the canvas edge
      return { ...p, vr: (dr / len) * dist, vc: (dc / len) * dist, duration: 420 };
    });
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const t = progress(p, elapsed);
      if (t < 1) running = true;
      const f = 1 - Math.exp(-4 * t); // hard impulse, drag decay
      p.r = p.startR + p.vr * f;
      p.c = p.startC + p.vc * f;
    }
    return running;
  },
};
