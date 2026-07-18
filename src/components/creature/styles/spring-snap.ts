import type { Style } from "../types";
import { pixelsFromGrid, progress } from "./helpers";

// Birth — local / just outside final position / damped spring overshoot /
// random stagger.
export const springSnap: Style = {
  name: "spring-snap",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => {
      const ang = rng() * Math.PI * 2;
      const dist = (2 + rng() * 2) * intensity;
      return {
        ...p,
        vr: Math.sin(ang) * dist,
        vc: Math.cos(ang) * dist,
        delay: rng() * 150,
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
      if (t >= 1) { p.r = p.targetR; p.c = p.targetC; continue; }
      const osc = Math.exp(-5 * t) * Math.cos(14 * t); // damped oscillation
      p.r = p.targetR + p.vr * osc;
      p.c = p.targetC + p.vc * osc;
    }
    return running;
  },
};
