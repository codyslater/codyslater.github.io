import { PAD } from "./geometry";
import type { PixelAnim, Remain, StyleEnv } from "./types";

// Drawing, shared by every canvas the creature appears on. Positions are in
// units (one unit = one sprite cell = `k` canvas pixels). Everything is drawn
// on the creature's own pixel grid: a pixel sits on a whole cell, never in
// between, and fades in a few steps, never smoothly, so edges stay sharp.

// Pixel animations live in sprite-canvas rows and columns (PAD included);
// (oy, ox) is where the sprite's own top-left sits on the stage, in units.
export function drawPixels(
  ctx: CanvasRenderingContext2D,
  pixels: PixelAnim[],
  ox: number,
  oy: number,
  k: number,
  groundPx: number,
) {
  // nothing is drawn below the ground line: debris lands behind it
  ctx.save();
  ctx.beginPath();
  ctx.rect(-8192, -8192, 16384, 8192 + groundPx);
  ctx.clip();
  const cell = Math.round(k);
  for (const p of pixels) {
    if (p.done || p.alpha <= 0) continue;
    const a = stepAlpha(p.alpha);
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect((ox + Math.round(p.c) - PAD) * cell, (oy + Math.round(p.r) - PAD) * cell, cell, cell);
  }
  ctx.restore();
}

// Four levels of see-through, no more: a fade reads as steps, like the rest.
function stepAlpha(a: number): number {
  if (a >= 0.88) return 1;
  if (a >= 0.6) return 0.75;
  if (a >= 0.34) return 0.5;
  if (a >= 0.12) return 0.25;
  return 0;
}

// Nothing is cut by the edge of the stage: a pixel that nears the top or a
// side fades out over its last four cells instead of being clipped.
export function fitToStage(pixels: PixelAnim[], env: StyleEnv) {
  for (const p of pixels) {
    if (p.done || p.alpha <= 0) continue;
    const r = Math.round(p.r);
    const c = Math.round(p.c);
    const room = Math.min(r - env.topR, c - env.leftC, env.rightC - 1 - c);
    if (room < 4) p.alpha *= room < 0 ? 0 : (room + 1) / 5;
  }
}

// How far outside the stage a set of pixels reaches, in cells (0 = inside).
export function overshoot(pixels: PixelAnim[], env: StyleEnv): number {
  let worst = 0;
  for (const p of pixels) {
    if (p.alpha <= 0.12) continue;
    const r = Math.round(p.r);
    const c = Math.round(p.c);
    worst = Math.max(worst, env.topR - r, env.leftC - c, c - (env.rightC - 1));
  }
  return worst;
}

// Loose points already in stage units (the leftovers of an ending, fading).
export function drawRemains(
  ctx: CanvasRenderingContext2D,
  pts: Remain[],
  alpha: number,
  k: number,
) {
  const a = stepAlpha(alpha);
  if (a <= 0) return;
  const cell = Math.round(k);
  ctx.globalAlpha = a;
  for (const p of pts) {
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.c) * cell, Math.round(p.r) * cell, cell, cell);
  }
  ctx.globalAlpha = 1;
}
