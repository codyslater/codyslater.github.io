import type { PixelAnim, Remain, Style } from "../types";
import { clamp01, easeInOut, lerp, mixColor, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 900;
const LEAD_MS = 40; // the remains show where they lie before they go

// Birth — the last creature's pixels, wherever they ended up, travel to the
// new creature's cells. Matter is conserved: every remain goes somewhere, and
// if there are fewer remains than cells some split on the way.
// Scratch: startR/C = where it begins, vr = arc bulge, phase = -1 for extra
// remains that have no cell of their own and are absorbed on arrival.
export const coalesce: Style = {
  name: "coalesce",
  duration: DURATION,
  init(grid, rng, intensity, env) {
    const body = pixelsFromGrid(grid);
    const remains: Remain[] = env.remains.length > 0 ? env.remains : [];
    if (remains.length === 0) return body; // the stage never picks this without remains
    // pair left to right so the flows do not cross each other much
    const bySpace = (a: { r: number; c: number }, b: { r: number; c: number }) =>
      a.c - b.c || a.r - b.r;
    const targets = [...body].sort((a, b) => bySpace({ r: a.targetR, c: a.targetC }, { r: b.targetR, c: b.targetC }));
    const sources = [...remains].sort(bySpace);
    const used = new Set<number>();
    targets.forEach((p, i) => {
      const j = Math.min(sources.length - 1, Math.floor((i * sources.length) / targets.length));
      used.add(j);
      const s = sources[j];
      p.startR = s.r;
      p.startC = s.c;
      p.r = s.r;
      p.c = s.c;
      p.color = s.color;
      p.from = s.color;
      p.delay = LEAD_MS + rng() * 230;
      p.duration = 400 + rng() * 150;
      p.vr = (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 2.5) * intensity;
    });
    const extras: PixelAnim[] = [];
    sources.forEach((s, j) => {
      if (used.has(j)) return;
      // nearest cell absorbs it
      let near = body[0];
      let nd = Infinity;
      for (const p of body) {
        const d = Math.hypot(p.targetR - s.r, p.targetC - s.c);
        if (d < nd) { nd = d; near = p; }
      }
      const e = pixel(s.r, s.c, s.color, 1);
      e.targetR = near.targetR;
      e.targetC = near.targetC;
      e.delay = LEAD_MS + rng() * 230;
      e.duration = 400 + rng() * 150;
      e.vr = (rng() < 0.5 ? -1 : 1) * (1 + rng() * 2) * intensity;
      e.from = s.color;
      e.phase = -1;
      extras.push(e);
    });
    return [...body, ...extras];
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      const t = clamp01((elapsed - p.delay) / p.duration);
      const e = easeInOut(t);
      const bulge = Math.sin(t * Math.PI) * p.vr;
      // the arc is perpendicular to the way it is going
      const dr = p.targetR - p.startR;
      const dc = p.targetC - p.startC;
      const len = Math.hypot(dr, dc) || 1;
      p.r = lerp(p.startR, p.targetR, e) + (dc / len) * bulge;
      p.c = lerp(p.startC, p.targetC, e) - (dr / len) * bulge;
      if (p.phase === -1) {
        p.alpha = 1 - clamp01((t - 0.75) / 0.25);
      } else {
        p.alpha = 1;
        p.color = mixColor(p.from ?? p.base, p.base, 0.25 + 0.75 * t);
      }
    }
    return elapsed < DURATION;
  },
};
