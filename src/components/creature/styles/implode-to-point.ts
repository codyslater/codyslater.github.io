import { CENTER } from "../geometry";
import type { Style } from "../types";
import { easeInCubic, pixelsFromGrid, progress } from "./helpers";

// Death — inward / all pixels → center / accelerating tween; the last
// pixel blinks out / radial stagger, outermost first.
export const implodeToPoint: Style = {
  name: "implode-to-point",
  // extent is fixed (everything converges on CENTER) — intensity omitted,
  // which TS allows structurally
  init(grid, rng) {
    const pixels = pixelsFromGrid(grid);
    const dist = (p: (typeof pixels)[number]) =>
      Math.hypot(p.targetR - CENTER, p.targetC - CENTER);
    const maxDist = Math.max(1, ...pixels.map(dist));
    return pixels.map((p) => ({
      ...p,
      delay: (maxDist - dist(p)) * 14 + rng() * 15, // outermost first
      duration: 220,
    }));
  },
  step(pixels, elapsed) {
    if (pixels.length === 0) return false;
    let running = false;
    let allIn = true;
    let maxEnd = 0;
    for (const p of pixels) {
      const t = progress(p, elapsed);
      if (t < 1) { running = true; allIn = false; }
      if (p.delay + p.duration > maxEnd) maxEnd = p.delay + p.duration;
      if (elapsed < p.delay) continue;
      const e = easeInCubic(t);
      p.r = p.startR + (CENTER - p.startR) * e;
      p.c = p.startC + (CENTER - p.startC) * e;
      if (t >= 1) p.alpha = 0; // absorbed
    }
    if (allIn) {
      const spark = pixels[0]; // any pixel serves as the final spark
      const over = elapsed - maxEnd;
      if (over < 120) {
        spark.r = CENTER;
        spark.c = CENTER;
        spark.alpha = Math.floor(over / 40) % 2 === 0 ? 1 : 0;
        running = true;
      } else {
        spark.alpha = 0;
      }
    }
    return running;
  },
};
