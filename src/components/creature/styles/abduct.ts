import { bodyColor, lighter } from "../palette";
import type { Style } from "../types";
import { bodyBounds, clamp01, easeInOut, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 1000;
const GATHER_MS = 260; // lift a little and slide into the column


// Death — a pale beam comes down and the pixels are pulled straight up its
// narrow column, one after another, out of the top of the stage.
// Scratch: delay = when this pixel is taken, vr = its column offset,
// vc = how far it rises (set by the stage height).
export const abduct: Style = {
  name: "abduct",
  duration: DURATION,
  init(grid, rng, intensity, env) {
    const body = pixelsFromGrid(grid);
    const { midC, maxR } = bodyBounds(body);
    const beam = lighter(bodyColor(grid), 0.3);
    const out = body.map((p) => ({
      ...p,
      delay: 120 + rng() * 380,
      vr: (rng() - 0.5) * 1.6,
      vc: midC,
      phase: 150 + rng() * 90 * intensity, // pull, units/s²
    }));
    // the beam: two columns of faint cells from the top of the stage to the ground
    for (const dc of [-0.5, 0.5]) {
      for (let r = Math.floor(env.topR); r <= Math.min(maxR, env.groundR - 1); r++) {
        const b = pixel(r, midC + dc, beam, 0);
        b.phase = -1; // marks a beam cell
        out.push(b);
      }
    }
    return out;
  },
  step(pixels, elapsed) {
    const beam = clamp01(elapsed / 160) * (1 - clamp01((elapsed - (DURATION - 220)) / 220));
    for (const p of pixels) {
      if (p.phase === -1) {
        p.alpha = beam * (0.5 + 0.1 * Math.sin(elapsed / 60 + p.startR));
        continue;
      }
      const t = (elapsed - p.delay) / 1000;
      if (t < 0) continue;
      const gather = easeInOut(clamp01((t * 1000) / GATHER_MS));
      p.c = p.startC + (p.vc + p.vr - p.startC) * gather;
      const lift = -0.9 * gather;
      const rise = t > GATHER_MS / 1000 ? 0.5 * p.phase * Math.pow(t - GATHER_MS / 1000, 2) : 0;
      p.r = p.startR + lift - rise;
      p.alpha = (1 - clamp01((rise - 8) / 14)) * (1 - clamp01((elapsed - (DURATION - 200)) / 200));
    }
    return elapsed < DURATION;
  },
};
