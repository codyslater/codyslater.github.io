import { PAD } from "../geometry";
import type { Grid, PixelAnim } from "../types";

// One PixelAnim per filled cell, at rest on its target. Styles spread this
// and override the fields they animate.
export function pixelsFromGrid(grid: Grid): PixelAnim[] {
  const pixels: PixelAnim[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const color = grid[r][c];
      if (!color) continue;
      pixels.push({
        r: r + PAD, c: c + PAD, color, alpha: 1,
        targetR: r + PAD, targetC: c + PAD,
        startR: r + PAD, startC: c + PAD,
        vr: 0, vc: 0, delay: 0, duration: 300, phase: 0, done: false,
      });
    }
  }
  return pixels;
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const frac = (x: number) => x - Math.floor(x);
// 0 before a pixel's delay has passed, 1 once its duration is spent
export const progress = (p: PixelAnim, elapsed: number) =>
  clamp01((elapsed - p.delay) / p.duration);
