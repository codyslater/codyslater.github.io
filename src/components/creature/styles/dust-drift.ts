import { mix } from "../palette";
import type { Style } from "../types";
import { bodyBounds, hash, pixelsFromGrid } from "./helpers";

const DURATION = 1000;
const WEAR_MS = 470; // the leading edge reaches the far side of the body
const LIFE_MS = 420; // each grain stays this long once it lets go
const STEP_MS = 95; // a grain moves a cell every so often, never in between

// Death — the body stays where it is and wears away from its leading edge
// (the side the wind comes from). Each cell that lets go becomes a one cell
// grain, carried up and to the right, lighter and then dark, and is gone.
// Scratch: delay = when this cell lets go, vr/vc = the grain's drift (cells per step).
export const dustDrift: Style = {
  name: "dust-drift",
  duration: DURATION,
  init(grid, rng) {
    const body = pixelsFromGrid(grid);
    const { minC, maxC, minR, maxR } = bodyBounds(body);
    const span = Math.max(1, maxC - minC);
    const rows = Math.max(1, maxR - minR);
    return body.map((p) => {
      // the right side wears first; the top a little before the bottom
      const along = (maxC - p.targetC) / span;
      const up = (p.targetR - minR) / rows;
      return {
        ...p,
        delay: 60 + (along * 0.78 + up * 0.14 + rng() * 0.08) * WEAR_MS,
        vr: -(0.5 + rng() * 0.5),
        vc: 0.6 + rng() * 0.7,
        phase: rng(),
      };
    });
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      const since = elapsed - p.delay;
      if (since < 0) continue;
      const t = since / LIFE_MS;
      if (t >= 1) { p.alpha = 0; continue; }
      const steps = Math.floor(since / STEP_MS);
      p.r = p.targetR + Math.round(p.vr * steps * 1.3 + (hash(p.targetC, p.targetR) > 0.7 ? -1 : 0));
      p.c = p.targetC + Math.round(p.vc * steps * 1.8);
      p.color = t < 0.3 ? (p.lid ? p.base : mix(p.base, "#ffffff", 0.35)) : t < 0.65 ? p.base : mix(p.lid ?? p.base, "#000000", 0.6);
      p.alpha = t < 0.7 ? 1 : 0.5;
    }
    return elapsed < DURATION;
  },
};
