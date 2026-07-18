import { GRID, PAD, UNITS } from "../geometry";
import type { Style } from "../types";
import { pixelsFromGrid } from "./helpers";

// Death — canvas-wide / downward / ballistic / bottom-up rows.
export const gravityScatter: Style = {
  name: "gravity-scatter",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => ({
      ...p,
      vr: -(rng() * 4) * intensity, // slight upward kick, units/s
      vc: (rng() - 0.5) * 10 * intensity, // sideways drift, units/s
      delay: (GRID - 1 - (p.targetR - PAD)) * 12 + rng() * 25,
    }));
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      if (p.done) continue;
      const t = (elapsed - p.delay) / 1000; // seconds of flight
      if (t < 0) { running = true; continue; }
      p.r = p.startR + p.vr * t + 200 * t * t; // gravity 400 units/s²
      p.c = p.startC + p.vc * t;
      if (p.r > UNITS + 1 || p.c < -1 || p.c > UNITS + 1) p.done = true;
      else running = true;
    }
    return running;
  },
};
