import { mix } from "../palette";
import type { PixelAnim, Style } from "../types";
import { bodyBounds, pixelsFromGrid } from "./helpers";

const DURATION = 1250;
const ROW_MS = 52; // the break runs down the body, a chunk row at a time
const HOLD_MS = 110; // after the bounce it lies still a moment
const BLINK_MS = 70;

// Death — the body breaks from the top down into 2x2 chunks. Each chunk
// cracks (it goes pale for a beat), lets go, falls, bounces once and blinks
// out. Under reduced motion they fall slowly, do not bounce or blink, and
// just fade where they land. Nothing is left lying there.
// Scratch: delay = when this chunk lets go, vr = how far it falls (rows),
// vc = its sideways drift, phase = the row it lands on.
export const crumble: Style = {
  name: "crumble",
  duration: DURATION,
  init(grid, rng, _intensity, env) {
    const body = pixelsFromGrid(grid);
    const { minR, minC } = bodyBounds(body);
    const key = (p: PixelAnim) => `${Math.floor((p.targetR - minR) / 2)},${Math.floor((p.targetC - minC) / 2)}`;
    const maxR = new Map<string, number>();
    const params = new Map<string, { delay: number; drift: number }>();
    for (const p of body) {
      const k = key(p);
      maxR.set(k, Math.max(maxR.get(k) ?? -1e9, p.targetR));
      if (!params.has(k)) {
        const row = Math.floor((p.targetR - minR) / 2);
        params.set(k, { delay: row * ROW_MS * 2 * 0.5 + rng() * 70, drift: Math.round((rng() - 0.5) * 3) });
      }
    }
    return body.map((p) => {
      const k = key(p);
      const rest = env.groundR - 1 - (maxR.get(k)! - p.targetR);
      const { delay, drift } = params.get(k)!;
      return { ...p, delay: delay + 70, vr: Math.max(0, rest - p.targetR), vc: drift, phase: rest, keep: env.reduced ? 1 : 0 };
    });
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      const reduced = p.keep === 1;
      const g = reduced ? 80 : 170; // cells per second, squared
      const since = elapsed - p.delay;
      if (since < -70) continue; // still part of the body
      if (since < 0) { p.color = mix(p.base, "#ffffff", 0.4); continue; } // the crack
      const t = since / 1000;
      const fall = Math.sqrt((2 * p.vr) / g);
      const bounce = reduced ? 0 : 0.2;
      if (t < fall) {
        p.r = p.targetR + 0.5 * g * t * t;
        p.c = p.targetC + p.vc * (t / (fall + bounce));
        p.color = p.base;
        continue;
      }
      const tb = t - fall;
      p.c = p.targetC + p.vc;
      if (tb < bounce) {
        const u = tb / bounce;
        p.r = p.phase - Math.round(Math.min(2, p.vr * 0.22) * 4 * u * (1 - u));
        continue;
      }
      p.r = p.phase;
      const after = tb - bounce;
      if (reduced) {
        p.alpha = after < 0.1 ? 1 : after < 0.3 ? 0.5 : 0;
        continue;
      }
      // blink out: on, off, on, off
      const beat = Math.floor((after * 1000 - HOLD_MS) / BLINK_MS);
      p.alpha = beat < 0 || beat === 1 ? 1 : 0;
      if (beat === 1) p.color = mix(p.base, "#000000", 0.55);
    }
    return elapsed < DURATION;
  },
};
