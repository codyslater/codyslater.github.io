import { PAD } from "../geometry";
import type { PixelAnim, Style } from "../types";
import { clamp01, easeOutBack, pixelsFromGrid } from "./helpers";

const DURATION = 950; // the fall takes less on a short stage
const SQUASH_MS = 130;
const RECOVER_MS = 150;

// Birth — falls from above the stage, lands with a squash that also widens it
// by a cell or two on each side, and pops back up to its own size.
// Scratch: vr = how far it falls, duration = fall ms, phase = the ground row;
// keep = 1 or 2 marks a cell that exists only while it is squashed (the
// widening), that many cells outside the body's edge in its row.
export const dropIn: Style = {
  name: "drop-in",
  duration: DURATION,
  init(grid, rng, intensity, env) {
    const body = pixelsFromGrid(grid);
    const fall = Math.max(8, PAD + 12 - env.topR + 1); // its feet clear the top
    const fallMs = Math.min(640, 170 + 55 * Math.sqrt(fall));
    const out: PixelAnim[] = body.map((p) => ({
      ...p,
      alpha: 0,
      vr: fall,
      duration: fallMs,
      phase: env.groundR,
    }));
    // the widening: the end cells of every row, repeated outward
    const edges = new Map<number, { l: PixelAnim; r: PixelAnim }>();
    for (const p of out) {
      const e = edges.get(p.targetR);
      if (!e) edges.set(p.targetR, { l: p, r: p });
      else {
        if (p.targetC < e.l.targetC) e.l = p;
        if (p.targetC > e.r.targetC) e.r = p;
      }
    }
    for (const { l, r } of edges.values()) {
      for (const k of [1, 2]) {
        out.push({ ...l, targetC: l.targetC - k, c: l.targetC - k, keep: k, alpha: 0 });
        out.push({ ...r, targetC: r.targetC + k, c: r.targetC + k, keep: k, alpha: 0 });
      }
    }
    return out;
  },
  step(pixels, elapsed) {
    let running = false;
    for (const p of pixels) {
      const fallMs = p.duration;
      const extra = p.keep ?? 0;
      if (elapsed < fallMs) {
        const t = elapsed / fallMs;
        p.alpha = extra ? 0 : 1;
        p.r = p.targetR - p.vr * (1 - t * t);
        p.c = p.targetC;
        running = true;
        continue;
      }
      const s = elapsed - fallMs;
      // squash flat for SQUASH_MS, then overshoot back to full height
      const squash = s < SQUASH_MS
        ? 1 - 0.32 * Math.sin((s / SQUASH_MS) * (Math.PI / 2))
        : 0.68 + 0.32 * easeOutBack(clamp01((s - SQUASH_MS) / RECOVER_MS));
      p.r = p.phase - (p.phase - p.targetR) * squash;
      p.c = p.targetC;
      // the first extra cell shows once it is squashed a little, the second when it is squashed fully
      p.alpha = extra === 0 ? 1 : squash < (extra === 1 ? 0.9 : 0.78) ? 1 : 0;
      if (s < SQUASH_MS + RECOVER_MS) running = true;
    }
    return running;
  },
};
