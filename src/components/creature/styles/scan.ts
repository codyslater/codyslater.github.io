import { PAD, GRID } from "../geometry";
import type { Style } from "../types";
import { bodyColor, lighter } from "../palette";
import { mixColor, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 800;
const ROW_MS = 48;
const LINE_MIX = 0.6; // the scan line is the body's own color, lightened

// Birth — printed row by row, top to bottom, behind a faint scan line.
// Scratch: delay = the moment this row prints; phase -1 marks a scan-line cell.
export const scan: Style = {
  name: "scan",
  duration: DURATION,
  init(grid, rng, intensity, env) {
    const body = pixelsFromGrid(grid).map((p) => ({
      ...p,
      alpha: 0,
      delay: 60 + (p.targetR - PAD) * ROW_MS,
    }));
    const lineColor = lighter(bodyColor(grid), LINE_MIX);
    const line = [];
    const used = new Set(body.map((p) => p.targetC - PAD)); // the bar is only as wide as the body: it never overhangs
    for (const c of used) {
      const l = pixel(PAD, PAD + c, lineColor, 0);
      l.phase = -1;
      line.push(l);
    }
    void rng; void intensity; void env;
    return [...body, ...line];
  },
  step(pixels, elapsed) {
    const row = Math.floor((elapsed - 60) / ROW_MS); // the row being printed now
    for (const p of pixels) {
      if (p.phase === -1) {
        // the line sits just under the last printed row
        const on = row >= 0 && row < GRID - 1;
        p.alpha = on ? 0.5 : 0;
        p.r = PAD + row + 1;
        continue;
      }
      const since = elapsed - p.delay;
      if (since < 0) { p.alpha = 0; continue; }
      p.alpha = 1;
      p.color = since < ROW_MS * 1.5 && !p.lid ? mixColor(p.base, "#ffffff", 0.5 * (1 - since / (ROW_MS * 1.5))) : p.base;
    }
    return elapsed < DURATION;
  },
};
