import { GRID, PAD } from "../geometry";
import type { Grid, PixelAnim, Style } from "../types";
import { PUPIL_COLOR, mix } from "../palette";
import { pixel } from "./helpers";

const DURATION = 500;
const COLS = [-3, GRID + 3]; // columns the body can swell into, beside its own twelve
const ROWS = 16; // rows it can stretch into, above its own twelve

// How tall it is at each moment (1 = its own height): flat, a stretch past
// 130%, an overshoot below, two wobbles that die down, and rest.
const SPRING: [number, number][] = [
  [0, 0.22], [50, 0.22], [160, 1.3], [240, 0.86], [310, 1.12], [370, 0.95], [420, 1.04], [470, 1],
];

const grids = new WeakMap<PixelAnim[], Grid>();

function heightAt(t: number): number {
  if (t >= SPRING[SPRING.length - 1][0]) return 1;
  for (let i = 1; i < SPRING.length; i++) {
    const [t1, y1] = SPRING[i];
    if (t <= t1) {
      const [t0, y0] = SPRING[i - 1];
      return y0 + ((y1 - y0) * (t - t0)) / (t1 - t0);
    }
  }
  return 1;
}

// Birth — a real spring: it starts squashed flat, stretches to about 130% of
// its height, overshoots below it, wobbles twice and settles. No particles:
// the body itself is rescaled in whole rows and columns about its feet, wider
// when it is flat and narrower when it is tall.
export const springSnap: Style = {
  name: "spring-snap",
  duration: DURATION,
  init(grid) {
    const out: PixelAnim[] = [];
    for (let k = 0; k < ROWS; k++) {
      for (let dc = COLS[0]; dc < COLS[1]; dc++) {
        const p = pixel(PAD + GRID - 1 - k, PAD + dc, "#ffffff", 0);
        p.vr = k;
        p.vc = dc;
        out.push(p);
      }
    }
    grids.set(out, grid);
    return out;
  },
  step(pixels, elapsed) {
    const grid = grids.get(pixels);
    if (!grid) return false;
    const sy = heightAt(elapsed);
    const sx = Math.min(1.6, Math.max(0.8, 1 + (1 - sy) * 0.55));
    const stretch = Math.abs(sy - 1);
    const tint = stretch > 0.5 ? 0.4 : stretch > 0.2 ? 0.2 : stretch > 0.07 ? 0.1 : 0;
    for (const p of pixels) {
      const row = GRID - 1 - Math.floor((p.vr + 0.5) / sy);
      const col = Math.floor(GRID / 2 + (p.vc + 0.5 - GRID / 2) / sx);
      const color = row >= 0 && col >= 0 && col < GRID ? grid[row]?.[col] : null;
      if (color) { p.color = tint && color !== PUPIL_COLOR ? mix(color, "#ffffff", tint) : color; p.alpha = 1; } else p.alpha = 0;
    }
    return elapsed < DURATION;
  },
};
