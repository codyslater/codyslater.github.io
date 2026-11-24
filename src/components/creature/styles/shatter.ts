import type { Style } from "../types";
import { bodyBounds, clamp01, mixColor, pixelsFromGrid } from "./helpers";

const DURATION = 800;
const FREEZE_MS = 120; // it holds still, cracks showing, before it goes
const FLIGHT_MS = DURATION - FREEZE_MS;

// Death — a 120 ms freeze with the cracks darkening, then the body splits
// into 4 to 6 rigid shards that fly apart (no turning: a shard keeps its
// shape), drop, and go out in steps. Quick by design.
// Scratch, per pixel: vr/vc = the shard's velocity, keep = 1 on a crack cell.
export const shatter: Style = {
  name: "shatter",
  duration: DURATION,
  init(grid, rng, intensity) {
    const body = pixelsFromGrid(grid);
    const { minR, maxR, minC, maxC, midC } = bodyBounds(body);
    const count = 4 + Math.floor(rng() * 3);
    const centers = Array.from({ length: count }, () => ({
      r: minR + rng() * (maxR - minR),
      c: minC + rng() * (maxC - minC),
    }));
    const owner = body.map((p) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((q, i) => {
        const d = Math.hypot(p.targetR - q.r, p.targetC - q.c);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    });
    const shards = centers.map((_, i) => {
      const members = body.filter((_p, k) => owner[k] === i);
      const n = Math.max(1, members.length);
      const cr = members.reduce((s, p) => s + p.targetR, 0) / n;
      const cc = members.reduce((s, p) => s + p.targetC, 0) / n;
      const dr = cr - (minR + maxR) / 2;
      const dc = cc - midC + (rng() - 0.5);
      const len = Math.hypot(dr, dc) || 1;
      const speed = (9 + rng() * 6) * intensity;
      return { vr: (dr / len) * speed - 3.5, vc: (dc / len) * speed };
    });
    // cells next to another shard's cells are where the cracks run
    const at = new Map(body.map((p, k) => [`${p.targetR},${p.targetC}`, owner[k]]));
    body.forEach((p, k) => {
      const s = shards[owner[k]];
      const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
        const o = at.get(`${p.targetR + dr},${p.targetC + dc}`);
        return o !== undefined && o !== owner[k];
      });
      p.keep = edge ? 1 : 0;
      p.vr = s.vr;
      p.vc = s.vc;
    });
    return body;
  },
  step(pixels, elapsed) {
    if (elapsed < FREEZE_MS) {
      const k = Math.sin((elapsed / FREEZE_MS) * Math.PI) * 0.4;
      for (const p of pixels) p.color = p.keep ? mixColor(p.base, "#0a0a0a", Math.min(1, k * 2.2)) : mixColor(p.base, "#ffffff", k);
      return true;
    }
    const t = (elapsed - FREEZE_MS) / 1000;
    const fade = clamp01(((elapsed - FREEZE_MS) / FLIGHT_MS - 0.55) / 0.45);
    for (const p of pixels) {
      p.color = fade > 0.5 ? mixColor(p.base, "#000000", 0.5) : p.base;
      p.r = p.targetR + p.vr * t + 44 * t * t;
      p.c = p.targetC + p.vc * t;
      p.alpha = 1 - fade;
    }
    return elapsed < DURATION;
  },
};
