import type { Style } from "../types";
import { frac, pixelsFromGrid } from "./helpers";

const BEAT_MS = 80;

// Birth — in-place (wrong offsets ±2 cells) / quantized snaps on beats /
// random per-beat stagger. No Rng in step: per-pixel salt + beat hashing
// keeps frames deterministic.
export const glitchIn: Style = {
  name: "glitch-in",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => ({
      ...p,
      phase: 2 + Math.floor(rng() * 4), // beat on which this pixel locks in
      delay: rng() * 100, // hash salt, not a time delay
      vr: intensity,
    }));
  },
  step(pixels, elapsed) {
    const beat = Math.floor(elapsed / BEAT_MS);
    let running = false;
    for (const p of pixels) {
      if (beat >= p.phase) {
        p.r = p.targetR; p.c = p.targetC; p.alpha = 1;
        continue;
      }
      running = true;
      const h1 = frac(Math.sin(p.delay * 999 + (beat + 1) * 7.13) * 43758.5);
      const h2 = frac(h1 * 977.77);
      p.r = p.targetR + Math.round((Math.floor(h1 * 5) - 2) * p.vr);
      p.c = p.targetC + Math.round((Math.floor(h2 * 5) - 2) * p.vr);
      p.alpha = h1 > 0.25 ? 1 : 0.4; // flicker
    }
    return running;
  },
};
