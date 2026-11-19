import type { Remain, Style } from "../types";
import { clamp01, frac, hash, lerp, mixColor, pixelsFromGrid } from "./helpers";

const DURATION = 900;
const OUT_SPAN = 560; // pixels wink out at random times inside this window
const FLICKER_MS = 150;

// Death — random pixels wink out, flickering a little just before they go.
// A few motes drift on and stay. Under reduced motion each one just fades:
// no jitter, no flicker.
// Scratch: delay = the moment this pixel goes, vr/vc = its one-cell jitter.
export const dissolve: Style = {
  name: "dissolve",
  duration: DURATION,
  init(grid, rng, intensity, env) {
    return pixelsFromGrid(grid).map((p) => ({
      ...p,
      delay: FLICKER_MS + 40 + Math.pow(rng(), 0.85) * OUT_SPAN,
      duration: env.reduced ? 200 : 40,
      phase: env.reduced ? 1 : 0,
      keep: 0, // it ends on an empty stage
      vr: intensity,
    }));
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      const until = p.delay - elapsed; // ms before it goes
      const floor = p.keep ?? 0;
      if (p.phase === 1) {
        // reduced: a plain fade
        const gone = clamp01((elapsed - p.delay) / p.duration);
        p.color = mixColor(p.lid ?? p.base, "#000000", 0.5 * gone);
        p.alpha = Math.max(floor, 1 - gone);
        continue;
      }
      if (until > FLICKER_MS) continue;
      if (until > 0) {
        // flicker and jitter, in 50 ms beats
        const beat = Math.floor(elapsed / 50);
        const h = hash(p.startR * 31 + p.startC, beat);
        // a flicker is a dimmer tone of the pixel's own color, never a see-through grey
        p.alpha = 1;
        p.color = h > 0.35 ? p.base : mixColor(p.lid ?? p.base, "#000000", 0.5);
        p.c = p.startC + (h > 0.8 ? 1 : h < 0.1 ? -1 : 0);
        p.r = p.startR + (frac(h * 7.7) > 0.85 ? -1 : 0);
      } else {
        const out = clamp01(-until / p.duration);
        p.color = mixColor(p.lid ?? p.base, "#000000", 0.5 * out);
        p.alpha = Math.max(floor, 1 - out);
        if (floor > 0) {
          // motes lift off a little, slowly
          p.r = lerp(p.startR, p.startR - 1.5, clamp01(-until / 600));
          p.c = p.startC;
        }
      }
    }
    return elapsed < DURATION;
  },
  remains(pixels) {
    const out: Remain[] = [];
    for (const p of pixels) if (p.alpha > 0.2) out.push({ r: p.r, c: p.c, color: p.color });
    return out;
  },
};
