import { PAD } from "../geometry";
import type { Style } from "../types";
import { clamp01, easeInCubic, pixelsFromGrid } from "./helpers";

const DURATION = 1000;
const ROW_STAGGER = 52;
const SLIDE_MS = 380;

// Death — the rows slide off sideways one after another, top first, each
// the other way from the one above, like a thread being pulled out.
export const unravel: Style = {
  name: "unravel",
  duration: DURATION,
  init(grid, rng, intensity) {
    const first = rng() < 0.5 ? 1 : -1;
    return pixelsFromGrid(grid).map((p) => {
      const row = p.targetR - PAD;
      return {
        ...p,
        vc: (row % 2 === 0 ? first : -first) * (16 + rng() * 2) * intensity,
        delay: row * ROW_STAGGER,
        duration: SLIDE_MS,
        phase: row * 0.9,
      };
    });
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const t = clamp01((elapsed - p.delay) / p.duration);
      if (t < 1) running = true;
      if (elapsed < p.delay) continue;
      const e = easeInCubic(t);
      p.c = p.startC + p.vc * e;
      p.r = p.startR + Math.sin(p.phase + t * 5) * 0.35 * t; // the thread wavers
      p.alpha = 1 - clamp01((t - 0.55) / 0.45);
    }
    return running;
  },
};
