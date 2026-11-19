// The quiet zone: the keep-clear ellipse around the name and tagline, and the prompt box.
// Nothing is drawn inside them or near them.

import { clamp } from "./rng";
import { WIRE_TEXT_NEAR, WIRE_TEXT_RAMP, type QuietRect } from "./types";

/** Distance from a point to the rect, or to the ellipse when the zone has one (0 inside). */
export function rectDist(r: { x0: number; y0: number; x1: number; y1: number; ell?: { cx: number; cy: number; a: number; b: number } }, x: number, y: number): number {
  const e = r.ell;
  if (e) {
    const dx = x - e.cx;
    const dy = y - e.cy;
    const k = Math.hypot(dx / e.a, dy / e.b);
    if (k <= 1) return 0;
    // first-order distance to the boundary: (k - 1) / |grad k|
    const g = Math.hypot(dx / (e.a * e.a), dy / (e.b * e.b)) / k;
    return (k - 1) / (g || 1);
  }
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}

/**
 * Distance a WIRE keeps from a zone: to the real text box for the name (the ellipse is for nodes, a strand may cross its
 * outer part), to the box itself for the prompt.
 */
export function wireDist(r: QuietRect, x: number, y: number): number {
  return r.ell ? rectDist(r.ell.box, x, y) : rectDist(r, x, y);
}

/**
 * 0 within `near` of any box, ramping to 1 over `ramp` beyond it (smoothstep). `extent` is how far the thing drawn
 * reaches from (x, y). Nodes are held out of the name's ellipse; wires only out of the text boxes (mode "wire").
 */
export function quietAlpha(rects: QuietRect[], x: number, y: number, extent = 0, mode: "node" | "wire" = "node"): number {
  let a = 1;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const wire = mode === "wire";
    const d = (wire ? wireDist(r, x, y) : rectDist(r, x, y)) - extent;
    const near = wire ? (r.ell ? WIRE_TEXT_NEAR : r.near) : r.near;
    const ramp = wire ? (r.ell ? WIRE_TEXT_RAMP : r.ramp) : r.ramp;
    if (d >= near + ramp) continue;
    const f = clamp((d - near) / ramp);
    const s = f * f * (3 - 2 * f);
    if (s < a) a = s;
  }
  return a;
}

/** Push a point out of every box inflated by `margin` (nearest side wins; an ellipse pushes radially). */
export function pushOut(rects: QuietRect[], x: number, y: number, margin: number, out: { x: number; y: number }): void {
  out.x = x;
  out.y = y;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const m = r.kind === "prompt" ? Math.min(margin, 36) : margin;
      if (r.ell) {
        const e = r.ell;
        const a = e.a + m;
        const b = e.b + m;
        let dx = out.x - e.cx;
        let dy = out.y - e.cy;
        const k = Math.hypot(dx / a, dy / b);
        if (k >= 1) continue;
        if (k < 1e-6) {
          dx = 0;
          dy = -1;
          out.x = e.cx;
          out.y = e.cy - b;
          continue;
        }
        out.x = e.cx + dx / k;
        out.y = e.cy + dy / k;
        continue;
      }
      const x0 = r.x0 - m;
      const x1 = r.x1 + m;
      const y0 = r.y0 - m;
      const y1 = r.y1 + m;
      if (out.x <= x0 || out.x >= x1 || out.y <= y0 || out.y >= y1) continue;
      const toL = out.x - x0;
      const toR = x1 - out.x;
      const toT = out.y - y0;
      const toB = y1 - out.y;
      const mn = Math.min(toL, toR, toT, toB);
      if (mn === toT) out.y = y0;
      else if (mn === toB) out.y = y1;
      else if (mn === toL) out.x = x0;
      else out.x = x1;
    }
  }
}

/** Is the segment clear of the boxes' (near-inflated) clearance? Sampled. */
export function segmentClear(rects: QuietRect[], x0: number, y0: number, x1: number, y1: number, extra: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.ceil(len / 10));
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const x = x0 + (x1 - x0) * f;
    const y = y0 + (y1 - y0) * f;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // `extra` is measured from the zone's own edge: for the name that is its text box (WIRE_CLEAR beyond it)
      if (wireDist(r, x, y) < (r.ell ? 0 : r.near) + extra) return false;
    }
  }
  return true;
}
