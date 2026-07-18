import { CENTER } from "../geometry";
import type { Style } from "../types";
import { easeOutCubic, pixelsFromGrid, progress } from "./helpers";

// Birth — canvas-wide / circular orbit shrinking onto the body / floaty
// angular drift / staggered by angular position.
export const spiralVortex: Style = {
  name: "spiral-vortex",
  init(grid, rng, intensity) {
    const spin = rng() < 0.5 ? 1 : -1;
    return pixelsFromGrid(grid).map((p) => {
      const dr = p.targetR - CENTER;
      const dc = p.targetC - CENTER;
      return {
        ...p,
        phase: Math.atan2(dr, dc), // final angle
        vr: Math.hypot(dr, dc), // final radius (scratch reuse)
        vc: spin * (1.5 + rng()) * Math.PI * intensity, // extra angle to unwind
        delay: ((Math.atan2(dr, dc) + Math.PI) / (2 * Math.PI)) * 200,
        duration: 450 + rng() * 100,
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
      const e = easeOutCubic(t);
      const ang = p.phase + p.vc * (1 - e);
      const rad = p.vr + (CENTER + 2 - p.vr) * (1 - e); // spiral in from beyond edge
      p.r = CENTER + Math.sin(ang) * rad;
      p.c = CENTER + Math.cos(ang) * rad;
    }
    return running;
  },
};
