import { PAD } from "../geometry";
import { bodyColor, darker, lighter, mix } from "../palette";
import type { PixelAnim, Style } from "../types";
import { bodyBounds, clamp01, pixel, pixelsFromGrid } from "./helpers";

const DURATION = 1000;
const HOLD_END = 70; // the body holds still
const SWELL_END = 140; // then swells a cell
const FLASH_END = 200; // one white frame
const FLIGHT_MS = 640;
const EMBERS = 7;




// Death — the body holds still, swells one cell, and goes white for a single
// frame. It bursts into 2x2 chunks that fly out from the middle fast and then
// slow, turning white, cyan, dark. They stay within about three body widths;
// a few embers fall at the end.
// Scratch: vr/vc = the chunk's travel (rows, columns), phase = -1 for an ember.
export const explosion: Style = {
  name: "explosion",
  duration: DURATION,
  init(grid, rng, intensity) {
    const body = pixelsFromGrid(grid);
    const { minR, minC, maxR, maxC } = bodyBounds(body);
    const mr = (minR + maxR) / 2;
    const mc = (minC + maxC) / 2;
    // 2x2 chunks, cut from the body's own corner
    const chunk = (p: PixelAnim) => `${Math.floor((p.targetR - minR) / 2)},${Math.floor((p.targetC - minC) / 2)}`;
    const dir = new Map<string, [number, number]>();
    for (const p of body) {
      const key = chunk(p);
      if (dir.has(key)) continue;
      const cr = minR + Math.floor((p.targetR - minR) / 2) * 2 + 0.5;
      const cc = minC + Math.floor((p.targetC - minC) / 2) * 2 + 0.5;
      let dr = cr - mr;
      let dc = cc - mc;
      const len = Math.hypot(dr, dc) || 1;
      dr /= len;
      dc /= len;
      const reach = (6 + rng() * 4.5) * (0.85 + 0.15 * intensity);
      dir.set(key, [dr * reach - 1.5, dc * reach]); // a little upward lift
    }
    const out: PixelAnim[] = [];
    for (const p of body) {
      const [vr, vc] = dir.get(chunk(p))!;
      out.push({ ...p, vr, vc, phase: p.targetR - mr, from: lighter(bodyColor(grid), 0.45) });
    }
    // embers: a few of the chunks leave sparks that fall at the end, in the creature's own tones
    const body0 = bodyColor(grid);
    const EMBER = [lighter(body0, 0.4), body0, darker(body0, 0.3)];
    for (let i = 0; i < EMBERS; i++) {
      const src = out[Math.floor(rng() * out.length)];
      const e = pixel(src.targetR + src.vr, src.targetC + src.vc, EMBER[i % EMBER.length], 0);
      e.phase = -100;
      e.delay = 200 + FLIGHT_MS * (0.45 + rng() * 0.15);
      e.duration = 260 + rng() * 120;
      out.push(e);
    }
    return out;
  },
  step(pixels, elapsed) {
    for (const p of pixels) {
      if (p.phase === -100) {
        // an ember: it hangs a beat, then drops a row at a time
        const t = (elapsed - p.delay) / p.duration;
        if (t < 0 || t >= 1) { p.alpha = 0; continue; }
        p.r = p.startR + Math.floor(t * 4.2);
        p.color = t < 0.5 ? p.base : mix(p.base, "#000000", 0.6);
        p.alpha = t < 0.8 ? 1 : 0.5;
        continue;
      }
      if (elapsed < HOLD_END) { p.r = p.targetR; p.c = p.targetC; continue; }
      if (elapsed < SWELL_END) {
        // a one cell swell: the outer cells step out
        const dc = p.targetC - PAD - 5.5;
        const dr = p.phase;
        p.c = p.targetC + (Math.abs(dc) > 3.2 ? Math.sign(dc) : 0);
        p.r = p.targetR + (Math.abs(dr) > 3.2 ? Math.sign(dr) : 0);
        p.color = p.lid ? p.base : mix(p.base, "#ffffff", 0.35);
        continue;
      }
      if (elapsed < FLASH_END) { p.r = p.targetR; p.c = p.targetC; p.color = "#ffffff"; continue; }
      const t = clamp01((elapsed - FLASH_END) / FLIGHT_MS);
      const e = 1 - Math.pow(1 - t, 3); // fast, then slowing
      p.r = p.targetR + p.vr * e;
      p.c = p.targetC + p.vc * e;
      p.color = t < 0.16 ? "#ffffff" : t < 0.5 ? mix("#ffffff", p.from ?? "#ffffff", 0.8) : mix(p.from ?? "#ffffff", "#000000", 0.8 * clamp01((t - 0.5) / 0.4));
      p.alpha = 1 - clamp01((t - 0.72) / 0.28);
    }
    return elapsed < DURATION;
  },
};
