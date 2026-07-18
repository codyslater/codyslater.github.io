import * as R from "./sim/rules";
import type { World } from "./sim/types";

// Flat pixels on black, like the rest of the site. Blink/breath are draw-time
// offsets only — never sim-state mutations.

// The underground rarely changes wholesale, so it is rendered to an offscreen
// canvas and blitted each frame. A full repaint happens only on a world/regen
// change (key includes the world uid so a remount never serves a prior world's
// layout); ordinary mining/burial patches just the changed cells listed in
// w.substrateDirty, so an active dig never triggers a full repaint.
let subCanvas: HTMLCanvasElement | null = null;
let subCtx: CanvasRenderingContext2D | null = null;
let subKey = "";

function paintCell(ctx: CanvasRenderingContext2D, k: number, v: number, scale: number) {
  const r = R.keyR(k), c = R.keyC(k);
  ctx.fillStyle = R.ROCK_COLOR;
  ctx.fillRect(c * scale, r * scale, scale, scale);
  if (v !== R.ROCK) {
    // ore: a dim mineral grain embedded in the rock, not a creature-bright
    // block — the underground must read as geology, never as buried monsters.
    // fossils are bone-grey: matter visibly locked out of circulation.
    const inset = scale * 0.25;
    ctx.fillStyle = v === R.FOSSIL ? R.FOSSIL_COLOR : R.COLORS[v];
    ctx.globalAlpha = v === R.FOSSIL ? 0.6 : 0.45;
    ctx.fillRect(c * scale + inset, r * scale + inset, scale - 2 * inset, scale - 2 * inset);
    ctx.globalAlpha = 1;
  }
}

function drawSubstrate(w: World, scale: number) {
  if (typeof document === "undefined") return null;
  if (!subCanvas) {
    subCanvas = document.createElement("canvas");
    subCtx = subCanvas.getContext("2d");
  }
  if (!subCtx) return null;
  const pxW = Math.max(1, Math.round(w.width * scale));
  const pxH = Math.max(1, Math.round(w.height * scale));
  const key = `${w.uid}:${w.substrateVersion}:${w.width}:${w.height}:${w.groundLevel}:${scale}`;
  if (key !== subKey) {
    if (subCanvas.width !== pxW) subCanvas.width = pxW;
    if (subCanvas.height !== pxH) subCanvas.height = pxH;
    subCtx.clearRect(0, 0, pxW, pxH);
    for (const [k, v] of w.substrate) paintCell(subCtx, k, v, scale);
    subKey = key;
    w.substrateDirty.length = 0; // the full paint already reflects every cell
  } else if (w.substrateDirty.length > 0) {
    for (const k of w.substrateDirty) {
      const c = R.keyC(k), r = R.keyR(k);
      subCtx.clearRect(c * scale, r * scale, scale, scale); // dug cell → transparent (black tunnel)
      const v = w.substrate.get(k);
      if (v !== undefined) paintCell(subCtx, k, v, scale);
    }
    w.substrateDirty.length = 0;
  }
  return subCanvas;
}

export function render(ctx: CanvasRenderingContext2D, w: World, scale: number) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w.width * scale, w.height * scale);

  // underground rock + ore
  const sub = drawSubstrate(w, scale);
  if (sub) ctx.drawImage(sub, 0, 0);

  // ground line: a faint seam where the surface meets the substrate
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0, w.groundLevel * scale, w.width * scale, Math.max(1, scale * 0.15));

  // sinking corpses, dim
  ctx.globalAlpha = 0.45;
  for (const d of w.detritus) {
    ctx.fillStyle = R.COLORS[d.color];
    ctx.fillRect(Math.round(d.x * scale), Math.round(d.y * scale), scale, scale);
  }
  ctx.globalAlpha = 1;

  for (const p of w.pixels) {
    const x = Math.round(p.x * scale);
    const y = Math.round(p.y * scale);
    ctx.fillStyle = R.COLORS[p.color];
    if (p.streak > 0) {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x, y - 2 * scale, scale, 2 * scale);
      ctx.globalAlpha = 1;
    }
    ctx.fillRect(x, y, scale, scale);
  }

  // division pulse: a newborn's body flashes a shade lighter a few times
  // and fades — enough to catch the eye, never a beacon
  let flashes: Map<number, number> | null = null;
  if (w.births.length > 0) {
    flashes = new Map();
    for (const b of w.births) {
      const t = Math.min(1, Math.max(0, (w.time - b.time) / R.BIRTH_FLASH_LEN));
      const on = Math.sin(t * Math.PI * 2 * R.BIRTH_FLASH_PULSES) > 0 ? 1 : 0;
      flashes.set(b.id, 0.4 * on * (1 - t));
    }
  }

  for (const cl of w.clusters) {
    const bob = cl.formed
      ? Math.round(Math.sin(w.time * R.BREATH_FREQ + cl.id) * R.BREATH_AMP)
      : 0;
    const ax = Math.round(cl.x);
    const ay = Math.round(cl.y) + bob;
    const flash = flashes?.get(cl.id) ?? 0;
    for (const [k, color] of cl.cells) {
      const r = R.keyR(k);
      const c = R.keyC(k);
      ctx.fillStyle =
        color === R.EYE
          ? cl.blinking > 0
            ? R.COLORS[cl.dominant]
            : R.EYE_COLOR
          : R.COLORS[color];
      ctx.fillRect((ax + c) * scale, (ay + r) * scale, scale, scale);
      if (flash > 0) {
        // newborn pulse: lighten the body cell, don't paint over it
        ctx.globalAlpha = flash;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect((ax + c) * scale, (ay + r) * scale, scale, scale);
        ctx.globalAlpha = 1;
      }
    }
  }
}
