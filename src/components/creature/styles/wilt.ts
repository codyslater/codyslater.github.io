import { EYE_COLOR, PUPIL_COLOR, bodyColor, mix } from "../palette";
import type { Style } from "../types";
import { bodyBounds, clamp01, hash, pixelsFromGrid } from "./helpers";

const DURATION = 900;
const SAG_MS = 100; // the body sags one row at a time
const SAG_STEPS = 6;
const FADE_FROM = SAG_MS * SAG_STEPS;
const GREY_GREEN = "#6f6f78"; // the body color drained toward grey (mixed in, so it stays a tone of the creature)
const DEAD = "#2c2c34";

// Death — no turning, no scaling: the head and shoulders droop a row at a
// time, the ends of the body sag more than the middle, the eyes close, the
// color goes grey-green and darker, and the pieces drop out one by one.
// Scratch: vr = how far this cell droops at most (rows), vc = how far it leans,
// delay = when it drops out, phase = 1 for an eye cell.
export const wilt: Style = {
  name: "wilt",
  duration: DURATION,
  init(grid, rng) {
    const body = pixelsFromGrid(grid);
    const { minR, maxR, midC } = bodyBounds(body);
    const rows = Math.max(1, maxR - minR);
    const lean = rng() < 0.5 ? -1 : 1;
    const lid = bodyColor(grid);
    return body.map((p) => {
      const top = 1 - (p.targetR - minR) / rows; // 1 at the head, 0 at the feet
      const edge = Math.abs(p.targetC - midC) / 6;
      const eye = p.base === EYE_COLOR || p.base === PUPIL_COLOR;
      return {
        ...p,
        vr: Math.pow(top, 1.15) * 0.85 + edge * 0.4 * top,
        vc: lean * Math.pow(top, 1.5) * 0.42,
        delay: FADE_FROM + 40 + hash(p.targetR * 13 + p.targetC, 5) * (DURATION - FADE_FROM - 190),
        phase: eye ? 1 : 0,
        from: lid,
      };
    });
  },
  step(pixels, elapsed) {
    const n = Math.min(SAG_STEPS, Math.floor(elapsed / SAG_MS));
    for (const p of pixels) {
      p.r = p.targetR + Math.round(p.vr * n);
      p.c = p.targetC + Math.round(p.vc * n);
      const gray = clamp01((n - 1) / 3);
      const base = p.phase === 1 && n >= 1 ? p.from ?? p.base : p.base; // the eyes close
      p.color = n >= 5 ? mix(base, DEAD, 0.85) : n >= 3 ? mix(base, GREY_GREEN, 0.55 + 0.2 * gray) : n >= 1 ? mix(base, GREY_GREEN, 0.3) : base;
      const gone = elapsed - p.delay;
      p.alpha = gone <= 0 ? 1 : gone < 90 ? 0.5 : 0;
    }
    return elapsed < DURATION;
  },
};
