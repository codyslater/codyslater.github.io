import { CANVAS_H, CANVAS_W, GRID, PAD, SCALE } from "./geometry";
import type { Grid, PixelAnim, Rng, Style } from "./types";

export type RunHandle = { cancel: () => void };

// Draw the resting creature (used after a birth settles and for blink repaints).
export function drawGrid(ctx: CanvasRenderingContext2D, grid: Grid) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c]) {
        ctx.fillStyle = grid[r][c]!;
        ctx.fillRect((c + PAD) * SCALE, (r + PAD) * SCALE, SCALE, SCALE);
      }
    }
  }
}

export function drawPixels(ctx: CanvasRenderingContext2D, pixels: PixelAnim[]) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  for (const p of pixels) {
    if (p.done || p.alpha <= 0) continue;
    ctx.globalAlpha = p.alpha > 1 ? 1 : p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.c * SCALE), Math.round(p.r * SCALE), SCALE, SCALE);
  }
  ctx.globalAlpha = 1;
}

// One rAF loop per active animation. speed > 1 slows the style down
// (elapsed is divided by it); maxMs is a WALL-CLOCK hard stop (death cap).
export function runStyle(
  ctx: CanvasRenderingContext2D,
  style: Style,
  grid: Grid,
  rng: Rng,
  opts: { intensity: number; speed: number; maxMs?: number },
  onDone: () => void,
): RunHandle {
  const pixels = style.init(grid, rng, opts.intensity);
  let raf = 0;
  let cancelled = false;
  const start = performance.now();

  const frame = (now: number) => {
    if (cancelled) return;
    const wall = now - start;
    const running = style.step(pixels, wall / opts.speed);
    drawPixels(ctx, pixels);
    if (running && !(opts.maxMs !== undefined && wall >= opts.maxMs)) {
      raf = requestAnimationFrame(frame);
    } else {
      onDone();
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    cancel: () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
