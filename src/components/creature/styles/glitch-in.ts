import { mix } from "../palette";
import type { Style } from "../types";
import { frac, pixelsFromGrid } from "./helpers";

const BEAT_MS = 80;

// Birth — a few cells flicker on in the wrong places, more with every beat,
// jumping up to two cells off and snapping onto their own spot one by one.
// No Rng in step: per-pixel salt + beat hashing keeps frames deterministic.
// Scratch: vc = the beat this cell first shows, phase = the beat it locks in,
// delay = a hash salt (not a time).
export const glitchIn: Omit<Style, "duration"> = {
  name: "glitch-in",
  init(grid, rng, intensity) {
    return pixelsFromGrid(grid).map((p) => {
      const appear = Math.floor(rng() * 3);
      return {
        ...p,
        vc: appear,
        phase: appear + 2 + Math.floor(rng() * 3),
        delay: rng() * 100,
        vr: intensity,
        alpha: 0,
      };
    });
  },
  step(pixels, elapsed) {
    const beat = Math.floor(elapsed / BEAT_MS);
    let running = false;
    for (const p of pixels) {
      if (beat >= p.phase) {
        p.r = p.targetR; p.c = p.targetC; p.alpha = 1; p.color = p.base;
        continue;
      }
      running = true;
      if (beat < p.vc) { p.alpha = 0; continue; }
      const h1 = frac(Math.sin(p.delay * 999 + (beat + 1) * 7.13) * 43758.5);
      const h2 = frac(h1 * 977.77);
      p.r = p.targetR + Math.round((Math.floor(h1 * 5) - 2) * p.vr);
      p.c = p.targetC + Math.round((Math.floor(h2 * 5) - 2) * p.vr);
      p.alpha = 1;
      p.color = h1 > 0.7 ? "#ffffff" : h1 > 0.35 ? mix(p.base, "#ffffff", 0.45) : p.base;
    }
    return running;
  },
};
