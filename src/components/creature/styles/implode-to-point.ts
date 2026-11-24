import { EYE_COLOR, PUPIL_COLOR, mix } from "../palette";
import type { PixelAnim, Style } from "../types";
import { bodyBounds, clamp01, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 860;
const HOLD_MS = 60;
const SHRINK_MS = 600;
const SCALES = [1, 0.84, 0.67, 0.5, 0.34, 0.18]; // each step drops whole rows and columns
const GLINT_END = SHRINK_MS + HOLD_MS + 70;
const STAR_END = GLINT_END + 110;

// Death — the body shrinks toward its middle in whole-pixel steps, losing
// rows and columns, getting brighter at every step. The eyes are the last
// to go; it ends on a one pixel glint and a four pixel star flash.
// Scratch: phase = 1 for an eye cell, -1..-5 for the glint (-1) and star arms.
export const implodeToPoint: Style = {
  name: "implode-to-point",
  duration: DURATION,
  init(grid) {
    const body = pixelsFromGrid(grid);
    const b = bodyBounds(body);
    const cr = (b.minR + b.maxR) / 2;
    const cc = b.midC;
    const out: PixelAnim[] = body.map((p) => ({
      ...p,
      vr: cr,
      vc: cc,
      phase: p.base === EYE_COLOR || p.base === PUPIL_COLOR ? 1 : 0,
    }));
    const gr = Math.round(cr);
    const gc = Math.round(cc);
    const glint = pixel(gr, gc, "#ffffff", 0);
    glint.phase = -1;
    out.push(glint);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const arm = pixel(gr + dr, gc + dc, "#bff6ff", 0);
      arm.phase = -2;
      out.push(arm);
    }
    return out;
  },
  step(pixels, elapsed) {
    const level = Math.min(SCALES.length - 1, Math.floor(clamp01((elapsed - HOLD_MS) / SHRINK_MS) * SCALES.length));
    const f = elapsed < HOLD_MS ? 1 : SCALES[level];
    const shrinking = elapsed < SHRINK_MS + HOLD_MS;
    for (const p of pixels) {
      if (p.phase === -1) {
        // the glint shows once the body is gone, and stays for the star
        p.alpha = elapsed >= SHRINK_MS + HOLD_MS && elapsed < STAR_END ? 1 : 0;
        continue;
      }
      if (p.phase === -2) {
        p.alpha = elapsed >= GLINT_END && elapsed < STAR_END ? 1 : 0;
        continue;
      }
      const eye = p.phase === 1;
      // the body goes first; the eyes hold to the last step
      if (!shrinking || (!eye && level >= SCALES.length - 2) || (eye && level >= SCALES.length)) {
        p.alpha = 0;
        continue;
      }
      p.r = p.vr + (p.targetR - p.vr) * f;
      p.c = p.vc + (p.targetC - p.vc) * f;
      p.color = p.lid ? p.base : mix(p.base, "#ffffff", level / 6);
    }
    return elapsed < DURATION;
  },
};
