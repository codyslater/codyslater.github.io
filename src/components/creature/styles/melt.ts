import { PAD } from "../geometry";
import { bodyColor, darker } from "../palette";
import type { PixelAnim, Style } from "../types";
import { bodyBounds, clamp01, easeInOut, hash, mixColor, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 1100;
const SAG_MS = 400; // one column sags this long
const SAG_STAGGER = 230; // columns start at different moments
const POOL_AT = 380; // the puddle spreads beside the body
const DRAIN_AT = 560; // then the puddle drains into the ground, ends first
const DRAIN_STEP = 45;

// Death — the body sags column by column: each column's cells close up
// toward the ground until the whole body is one low puddle, a little darker
// and wider than the feet. The puddle then drains into the ground line from
// its ends toward the middle. Nothing is left lying there.
// Scratch: vr = how far above the ground this cell sat (rows), vc = its
// column's start, phase = when its column drains, phase 100 = a puddle cell.
export const melt: Style = {
  name: "melt",
  duration: DURATION,
  init(grid, rng, _intensity, env) {
    const body = pixelsFromGrid(grid);
    const { midC, minC, maxC } = bodyBounds(body);
    const base = env.groundR - 1;
    const out: PixelAnim[] = body.map((p) => ({
      ...p,
      vr: PAD + 11 - p.targetR,
      keep: base,
      vc: hash(p.targetC, 3) * SAG_STAGGER,
      phase: DRAIN_AT + Math.abs(p.targetC - midC) * DRAIN_STEP + rng() * 40,
    }));
    // the puddle: two or three cells past each end, at ground level
    const pool = darker(bodyColor(grid), 0.35);
    for (const side of [-1, 1]) {
      const edge = side < 0 ? minC : maxC;
      for (let i = 1; i <= 3; i++) {
        const c = pixel(base, edge + side * i, pool, 0);
        c.phase = 100;
        c.delay = POOL_AT + i * 50 + rng() * 40;
        c.vc = DRAIN_AT + Math.abs(edge + side * i - midC) * DRAIN_STEP;
        out.push(c);
      }
    }
    return out;
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      if (p.phase === 100) {
        p.alpha = elapsed >= p.delay ? 1 : 0;
        if (elapsed >= p.vc) p.alpha = elapsed < p.vc + 70 ? 0.5 : 0;
        continue;
      }
      const m = easeInOut(clamp01((elapsed - p.vc) / SAG_MS));
      // closes up toward the ground row (a creature that was off the ground settles onto it as it goes)
      p.r = PAD + 11 + Math.round(((p.keep ?? PAD + 11) - (PAD + 11)) * m) - Math.round(p.vr * (1 - m));
      p.color = m < 0.34 ? p.base : m < 0.67 ? mixColor(p.lid ?? p.base, "#000000", 0.28) : mixColor(p.lid ?? p.base, "#000000", 0.52);
      p.alpha = 1;
      if (elapsed >= p.phase) {
        p.alpha = elapsed < p.phase + 70 ? 0.5 : 0;
      }
    }
    if (elapsed > DURATION - 60) for (const p of pixels) p.alpha = 0; // an empty stage at the end
    return elapsed < DURATION;
  },
};
