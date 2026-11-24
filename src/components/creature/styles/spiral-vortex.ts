import { CENTER } from "../geometry";
import { darker, mix } from "../palette";
import type { PixelAnim, Style } from "../types";
import { clamp01, easeOutCubic, pixelsFromGrid } from "./helpers";

const DURATION = 880;
const ECHO_LAG = [48, 100]; // the trailing arc: two echoes behind every cell

// Birth — the cells arrive along a spiral, winding in from beyond the body
// about its middle, each with a short trailing arc of dimmer echoes behind
// it, so the spiral itself is visible. Each cell lands on its own spot.
// Scratch: phase = final angle, vr = final radius, vc = turns still to unwind
// (radians), keep = an echo's lag in ms (0 for the cell itself).
export const spiralVortex: Style = {
  name: "spiral-vortex",
  duration: DURATION,
  init(grid, rng) {
    const spin = rng() < 0.5 ? 1 : -1;
    const turn = (0.8 + rng() * 0.4) * Math.PI * 2;
    const body = pixelsFromGrid(grid).map((p) => {
      const dr = p.targetR - CENTER;
      const dc = p.targetC - CENTER;
      const ang = Math.atan2(dr, dc);
      return {
        ...p,
        phase: ang,
        vr: Math.hypot(dr, dc),
        vc: spin * turn,
        delay: ((ang + Math.PI) / (2 * Math.PI)) * 170,
        duration: 480 + rng() * 80,
        keep: 0,
      };
    });
    const echoes: PixelAnim[] = [];
    for (const p of body) {
      ECHO_LAG.forEach((lag, i) => {
        echoes.push({ ...p, keep: lag, alpha: 0, color: darker(p.base, 0.35 + i * 0.2) });
      });
    }
    return [...body, ...echoes];
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      const lag = p.keep ?? 0;
      const t = clamp01((elapsed - lag - p.delay) / p.duration);
      if (elapsed - lag < p.delay) { p.alpha = 0; continue; }
      const e = easeOutCubic(t);
      const ang = p.phase + p.vc * (1 - e);
      const rad = p.vr + (10.5 - p.vr) * (1 - e); // winds in from a ring around the body
      p.r = CENTER + Math.sin(ang) * rad;
      p.c = CENTER + Math.cos(ang) * rad;
      if (lag > 0) {
        // an echo: dim while it flies, gone when it reaches its place
        p.alpha = t >= 1 ? 0 : lag < 70 ? 0.6 : 0.3;
      } else {
        p.alpha = 1;
        p.color = t < 0.55 ? mix(p.base, "#ffffff", 0.4) : p.base;
      }
    }
    return elapsed < DURATION;
  },
};
