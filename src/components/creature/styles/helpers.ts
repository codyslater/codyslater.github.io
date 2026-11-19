import { PAD } from "../geometry";
import { EYE_COLOR, PUPIL_COLOR, bodyColor } from "../palette";
import type { Grid, PixelAnim, Style } from "../types";

// One PixelAnim per filled cell, at rest on its target. Styles spread this
// and override the fields they animate. An eye cell carries `lid`, the body
// color; a style that darkens or tints a body mixes from `lid ?? base`.
export function pixelsFromGrid(grid: Grid): PixelAnim[] {
  const pixels: PixelAnim[] = [];
  const body = bodyColor(grid);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const color = grid[r][c];
      if (!color) continue;
      const p = pixel(r + PAD, c + PAD, color);
      if (color === EYE_COLOR || color === PUPIL_COLOR) p.lid = body;
      pixels.push(p);
    }
  }
  return pixels;
}

// A loose pixel (sparks, shell bits, beam cells) that belongs to no body cell.
export function pixel(r: number, c: number, color: string, alpha = 1): PixelAnim {
  return {
    r, c, color, base: color, alpha,
    targetR: r, targetC: c,
    startR: r, startC: c,
    vr: 0, vc: 0, delay: 0, duration: 300, phase: 0, done: false,
  };
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const frac = (x: number) => x - Math.floor(x);
// 0 before a pixel's delay has passed, 1 once its duration is spent
export const progress = (p: PixelAnim, elapsed: number) =>
  clamp01((elapsed - p.delay) / p.duration);

// Cheap deterministic per-pixel noise in [0, 1): frames stay reproducible
// without handing the step function an Rng.
export const hash = (a: number, b = 0) => frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");

// Mix two #rrggbb colors; t = 0 gives a, t = 1 gives b.
export function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const k = clamp01(t);
  return `#${toHex(ar + (br - ar) * k)}${toHex(ag + (bg - ag) * k)}${toHex(ab + (bb - ab) * k)}`;
}

// Plays a style that steps over 70 to 420 ms at `factor` times that length,
// slowing it without changing its shape.
export function stretched(style: Omit<Style, "duration">, factor: number, duration: number): Style {
  return {
    ...style,
    duration,
    step: (pixels, elapsed) => {
      const running = style.step(pixels, elapsed / factor);
      // whatever is still flying at the end fades out instead of stopping dead
      const tail = clamp01((elapsed / duration - 0.7) / 0.3);
      if (tail > 0) for (const p of pixels) if (p.alpha > 1 - tail) p.alpha = 1 - tail;
      return running;
    },
  };
}

// Body cells of a pixel set that still has its resting layout (init time).
export function bodyBounds(pixels: PixelAnim[]) {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (const p of pixels) {
    if (p.targetR < minR) minR = p.targetR;
    if (p.targetR > maxR) maxR = p.targetR;
    if (p.targetC < minC) minC = p.targetC;
    if (p.targetC > maxC) maxC = p.targetC;
  }
  return { minR, maxR, minC, maxC, midC: (minC + maxC) / 2 };
}
