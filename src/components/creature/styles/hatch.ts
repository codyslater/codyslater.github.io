import { PAD } from "../geometry";
import type { PixelAnim, Style } from "../types";
import { bodyColor, lighter } from "../palette";
import { clamp01, easeOutCubic, lerp, mixColor, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 1000;
const ROCK_END = 430;
const CRACK_END = 520;
const OUT_MS = 330; // the creature unfolds over this long
// the shell and its cracks are the body color, lightened: no stray grey
const CRACK = "#ffffff";

// 8 wide, 10 tall; X = shell
const EGG = [
  "...XX...",
  "..XXXX..",
  ".XXXXXX.",
  ".XXXXXX.",
  "XXXXXXXX",
  "XXXXXXXX",
  "XXXXXXXX",
  "XXXXXXXX",
  ".XXXXXX.",
  "..XXXX..",
];

// Cracks: a zigzag across the middle of the egg, left to right ([row, col])
const CRACKS: [number, number][] = [[4, 0], [5, 1], [4, 2], [5, 3], [4, 4], [5, 5], [4, 6], [5, 7]];

// Birth — a small egg outline rocks, cracks, splits; the creature unfolds out
// of it. Scratch: phase = -1 for shell pixels, vr/vc = a shell piece's flight.
export const hatch: Style = {
  name: "hatch",
  duration: DURATION,
  init(grid, rng, intensity, env) {
    const body = pixelsFromGrid(grid).map((p) => ({ ...p, alpha: 0 }));
    const shellLight = lighter(bodyColor(grid), 0.55);
    const shellDark = lighter(bodyColor(grid), 0.3);
    const cr = env.groundR - 5; // egg center
    const cc = PAD + 5.5;
    const shell: PixelAnim[] = [];
    EGG.forEach((row, i) => {
      [...row].forEach((ch, j) => {
        if (ch !== "X") return;
        const s = pixel(env.groundR - EGG.length + i, PAD + 2 + j, i >= 6 ? shellDark : shellLight, 0);
        s.phase = -1;
        const top = i < EGG.length / 2;
        // the top half jumps away; the bottom half stays and fades late
        s.vr = top ? -(7 + rng() * 5) * intensity : 0;
        s.vc = (j - 3.5) * (top ? 3.2 : 0.6) + (rng() - 0.5);
        s.delay = rng() * 1000; // crack order
        shell.push(s);
      });
    });
    CRACKS.forEach(([i, j], n) => {
      const k = pixel(env.groundR - EGG.length + i, PAD + 2 + j, CRACK, 0);
      k.phase = -2; // a crack cell: shows from its moment on
      k.delay = ROCK_END - 150 + n * 14;
      k.vr = i; // egg row, for the rock
      shell.push(k);
    });
    // creature pixels start at the egg's center and unfold to their cells
    for (const p of body) {
      // it starts as a small, tight version of itself and unfolds
      p.startR = lerp(cr, p.targetR, 0.2);
      p.startC = lerp(cc, p.targetC, 0.2);
      p.delay = CRACK_END + Math.hypot(p.targetR - cr, p.targetC - cc) * 8 + rng() * 40;
      p.duration = OUT_MS;
    }
    return [...body, ...shell];
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      if (p.phase === -2) {
        // a crack cell: it rocks with the egg, then goes with the shell
        const rockC = elapsed < ROCK_END ? Math.round(Math.sin((elapsed / ROCK_END) * (Math.PI * 5))) : 0;
        p.alpha = elapsed >= p.delay ? 1 - clamp01((elapsed - CRACK_END - 40) / 120) : 0;
        p.c = p.targetC + (elapsed < CRACK_END ? rockC : 0);
        continue;
      }
      if (p.phase === -1) {
        if (elapsed < 1) { p.alpha = 0; continue; }
        p.alpha = 1;
        // rocking: the whole egg shifts a cell left and right as one piece
        const rock = elapsed < ROCK_END
          ? Math.round(Math.sin((elapsed / ROCK_END) * (Math.PI * 5)))
          : 0;
        if (elapsed < CRACK_END) {
          p.c = p.targetC + rock;
        } else {
          const t = (elapsed - CRACK_END) / 1000;
          if (p.vr !== 0) {
            p.r = p.targetR + p.vr * t + 40 * t * t;
            p.c = p.targetC + p.vc * t;
            p.alpha = t < 0.3 ? 1 : 0;
          } else {
            p.c = p.targetC + p.vc * t * 0.3;
            p.alpha = t < 0.14 ? 1 : 0;
          }
        }
        continue;
      }
      const t = clamp01((elapsed - p.delay) / p.duration);
      if (elapsed < p.delay) { p.alpha = 0; continue; }
      const e = easeOutCubic(t);
      p.alpha = 1;
      p.r = p.startR + (p.targetR - p.startR) * e;
      p.c = p.startC + (p.targetC - p.startC) * e;
      p.color = t < 1 && !p.lid ? mixColor(p.base, "#ffffff", 0.3 * (1 - t)) : p.base;
    }
    return elapsed < DURATION;
  },
};
