import { GRID, PAD } from "../geometry";
import { PUPIL_COLOR, lighter } from "../palette";
import type { Grid, PixelAnim, Style } from "../types";
import { pixel } from "./helpers";

const DURATION = 780;
const HOLD_MS = 70; // a speck of it first
const STEP_MS = 125;
const SIZES = [0.17, 0.34, 0.5, 0.67, 0.84, 1]; // whole-pixel sizes it passes through

const grids = new WeakMap<PixelAnim[], Grid>();

// Birth — the creature itself, small and getting bigger: at every size it is
// the same creature (ears, arms, legs and eyes where they belong), cut on whole
// pixels and standing on its feet. Each step is a tone paler than the next.
// Scratch: vr = rows up from the feet, vc = columns from the middle.
export const grow: Style = {
  name: "grow",
  duration: DURATION,
  init(grid) {
    const out: PixelAnim[] = [];
    for (let k = 0; k < GRID; k++) {
      for (let dc = 0; dc < GRID; dc++) {
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
    const step = elapsed < HOLD_MS ? 0 : Math.min(SIZES.length - 1, 1 + Math.floor((elapsed - HOLD_MS) / STEP_MS));
    const f = SIZES[step];
    const pale = step >= SIZES.length - 1 ? 0 : step >= 3 ? 0.1 : step >= 1 ? 0.2 : 0.3;
    for (const p of pixels) {
      const row = GRID - 1 - Math.floor((p.vr + 0.5) / f);
      const col = Math.floor(GRID / 2 + (p.vc + 0.5 - GRID / 2) / f);
      const color = row >= 0 && col >= 0 && col < GRID ? grid[row]?.[col] : null;
      if (color) { p.color = pale && color !== PUPIL_COLOR ? lighter(color, pale) : color; p.alpha = 1; } else p.alpha = 0;
    }
    return elapsed < DURATION;
  },
};
