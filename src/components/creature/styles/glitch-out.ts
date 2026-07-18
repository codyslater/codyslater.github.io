import { UNITS } from "../geometry";
import type { Style } from "../types";
import { frac, pixelsFromGrid } from "./helpers";

const SHEAR_MS = 240; // three 80 ms beats of row shear, then collapse

// Death — local shear → collapse / rows shear horizontally on beats,
// then everything drops ballistically / row-beat stagger.
export const glitchOut: Style = {
  name: "glitch-out",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => ({
      ...p,
      vr: intensity, // shear amplitude multiplier
      phase: 200 + rng() * 120, // per-pixel collapse acceleration, units/s²
    }));
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      if (p.done) continue;
      if (elapsed < SHEAR_MS) {
        running = true;
        const beat = Math.floor(elapsed / 80);
        const h = frac(Math.sin((p.targetR + 1) * 12.9898 + beat * 4.1414) * 43758.5);
        p.c = p.startC + Math.round((h * 6 - 3) * p.vr); // whole row shears together
        p.alpha = h > 0.15 ? 1 : 0.3;
      } else {
        const t = (elapsed - SHEAR_MS) / 1000;
        p.r = p.startR + p.phase * t * t; // quick, slightly ragged collapse
        p.alpha = Math.max(0, 1 - t * 4);
        if (p.alpha === 0 || p.r > UNITS + 1) p.done = true;
        else running = true;
      }
    }
    return running;
  },
};
