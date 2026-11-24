import type { PixelAnim, Remain, Style } from "../types";
import { bodyBounds, clamp01, mixColor, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 1180;
const SWEEP_MS = 480;
const FLASH_MS = 90; // white-hot
const GLOW_MS = 170; // orange, then red
const ASH_MS = 100; // char
const FADE_MS = 110;
const SPARKS = 14;
const SPARK_COLORS = ["#ffd45a", "#ff9b2e", "#ff7a1a"];

// Death — an ember front sweeps across the body. What it passes flashes warm,
// goes gray and vanishes; a few sparks rise. Not offered under reduced motion.
// Scratch: delay = when the front reaches this pixel, keep = ash left behind.
export const burn: Style = {
  name: "burn",
  duration: DURATION,
  init(grid, rng) {
    const body = pixelsFromGrid(grid);
    const { minC, maxC, minR, maxR } = bodyBounds(body);
    const dir = rng() < 0.5 ? 1 : -1;
    const span = Math.max(1, maxC - minC);
    const rows = Math.max(1, maxR - minR);
    for (const p of body) {
      const along = dir === 1 ? (p.targetC - minC) / span : (maxC - p.targetC) / span;
      p.delay = (along * 0.8 + ((p.targetR - minR) / rows) * 0.2) * SWEEP_MS + rng() * 40;
      p.keep = 0; // nothing is left lying there
    }
    const out: PixelAnim[] = body;
    for (let i = 0; i < SPARKS; i++) {
      const host = body[Math.floor(rng() * body.length)];
      const s = pixel(host.targetR, host.targetC, SPARK_COLORS[i % SPARK_COLORS.length], 0);
      s.delay = host.delay + 40 + rng() * 160; // launch time
      s.vr = 7 + rng() * 6; // rise speed, units/s
      s.vc = (rng() - 0.5) * 3;
      s.phase = rng() * 6.28;
      s.duration = 300 + rng() * 120;
      out.push(s);
    }
    return out;
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      if (p.vr !== 0 && p.keep === undefined) {
        // spark
        const t = (elapsed - p.delay) / p.duration;
        if (t < 0 || t > 1) { p.alpha = 0; continue; }
        p.alpha = 1 - t * t;
        p.r = p.startR - (p.vr * (elapsed - p.delay)) / 1000;
        p.c = p.startC + p.vc * t + Math.sin(p.phase + t * 8) * 0.5;
        continue;
      }
      const since = elapsed - p.delay;
      if (since < 0) continue;
      const g = since - FLASH_MS;
      if (g < 0) {
        p.color = mixColor("#ffffff", "#ffd45a", since / FLASH_MS);
      } else if (g < GLOW_MS) {
        const k = g / GLOW_MS;
        p.color = k < 0.5 ? mixColor("#ffb020", "#ff5a14", k * 2) : mixColor("#ff5a14", "#a8300f", (k - 0.5) * 2);
      } else {
        const a = g - GLOW_MS;
        p.color = mixColor("#8a3a1a", "#3a1a10", clamp01(a / ASH_MS));
        const floor = p.keep ?? 0;
        p.alpha = Math.max(floor, 1 - clamp01((a - ASH_MS) / FADE_MS));
      }
    }
    return elapsed < DURATION;
  },
  remains(pixels) {
    const out: Remain[] = [];
    for (const p of pixels) if (p.keep && p.alpha > 0.2) out.push({ r: p.r, c: p.c, color: p.color });
    return out;
  },
};
