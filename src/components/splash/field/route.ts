// Wire paths: the board route (Manhattan with 45-degree chamfers), the organic tendril
// (cubic with a bowed control point), and path sampling that lerps one into the other by the
// local blend t. Pure.

import type { BlendField } from "./blend";
import { quietAlpha, wireDist } from "./quiet";
import { GRID, MAX_SAMPLES, WIRE_TEXT_NEAR, WIRE_TEXT_RAMP, type QuietRect, type Wire } from "./types";

const CHAMFER = 10;
const UNIFORM = 17; // uniform samples per wire (route vertices are added on top)

export interface Board {
  n: number;
  px: Float64Array;
  py: Float64Array;
  cum: Float64Array;
  via: Uint8Array; // 1 where vertex i starts a chamfer pair
  len: number;
}

export function makeBoard(): Board {
  return {
    n: 0,
    px: new Float64Array(8),
    py: new Float64Array(8),
    cum: new Float64Array(8),
    via: new Uint8Array(8),
    len: 0,
  };
}

const board: Board = makeBoard();

function push(b: Board, x: number, y: number, via = 0): void {
  b.px[b.n] = x;
  b.py[b.n] = y;
  b.via[b.n] = via;
  b.n++;
}

/** Fill `b` with the polyline a -> b for a route variant (0 H|V, 1 V|H, 2 H-V-H, 3 V-H-V). */
export function buildBoard(b: Board, ax: number, ay: number, bx: number, by: number, variant: number): void {
  b.n = 0;
  const dx = bx - ax;
  const dy = by - ay;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  push(b, ax, ay);
  if (adx < 0.75 || ady < 0.75) {
    // aligned: straight
  } else if (variant === 0) {
    const c = Math.min(CHAMFER, adx / 2, ady / 2);
    push(b, bx - sx * c, ay, 1);
    push(b, bx, ay + sy * c);
  } else if (variant === 1) {
    const c = Math.min(CHAMFER, adx / 2, ady / 2);
    push(b, ax, by - sy * c, 1);
    push(b, ax + sx * c, by);
  } else if (variant === 2) {
    const xm = ax + dx / 2;
    const c = Math.min(CHAMFER, adx / 4, ady / 2);
    push(b, xm - sx * c, ay, 1);
    push(b, xm, ay + sy * c);
    push(b, xm, by - sy * c, 1);
    push(b, xm + sx * c, by);
  } else {
    const ym = ay + dy / 2;
    const c = Math.min(CHAMFER, ady / 4, adx / 2);
    push(b, ax, ym - sy * c, 1);
    push(b, ax + sx * c, ym);
    push(b, bx - sx * c, ym, 1);
    push(b, bx, ym + sy * c);
  }
  push(b, bx, by);
  let acc = 0;
  b.cum[0] = 0;
  for (let i = 1; i < b.n; i++) {
    acc += Math.hypot(b.px[i] - b.px[i - 1], b.py[i] - b.py[i - 1]);
    b.cum[i] = acc;
  }
  b.len = acc;
}

const tmpBoard = board;

/** Is the board route for this variant clear of the quiet boxes? */
export function variantClear(rects: QuietRect[], ax: number, ay: number, bx: number, by: number, variant: number): boolean {
  buildBoard(tmpBoard, ax, ay, bx, by, variant);
  for (let i = 1; i < tmpBoard.n; i++) {
    const x0 = tmpBoard.px[i - 1];
    const y0 = tmpBoard.py[i - 1];
    const x1 = tmpBoard.px[i];
    const y1 = tmpBoard.py[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / 10));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const y = y0 + ((y1 - y0) * k) / n;
      for (const r of rects) {
        if (wireDist(r, x, y) < (r.ell ? WIRE_TEXT_NEAR + WIRE_TEXT_RAMP : r.near + r.ramp) + 2) return false;
      }
    }
  }
  return true;
}

/** Choose a clear variant (the preferred one first). Returns the variant, or -1 if none is clear. */
export function pickVariant(rects: QuietRect[], ax: number, ay: number, bx: number, by: number, preferred: number): number {
  for (let k = 0; k < 4; k++) {
    const v = (preferred + k) & 3;
    if (variantClear(rects, ax, ay, bx, by, v)) return v;
  }
  return -1;
}

function boardAt(b: Board, s: number, out: number[]): void {
  let i = 1;
  while (i < b.n - 1 && b.cum[i] < s) i++;
  const seg = b.cum[i] - b.cum[i - 1];
  const f = seg > 0 ? (s - b.cum[i - 1]) / seg : 0;
  out[0] = b.px[i - 1] + (b.px[i] - b.px[i - 1]) * f;
  out[1] = b.py[i - 1] + (b.py[i] - b.py[i - 1]) * f;
}

const pt = [0, 0];
const us = new Float64Array(MAX_SAMPLES);
const uv = new Uint8Array(MAX_SAMPLES);

interface SampleCtx {
  field: Pick<BlendField, "at">;
  quiet: QuietRect[];
  time: number;
  /** Frozen tendril sway (reduced motion). */
  still: boolean;
}

/**
 * Sample a wire between drawn node positions A and B into the wire's geometry arrays.
 * Each sample = lerp(board(u), organic(u), t(sample)).
 */
export function sampleWire(w: Wire, ax: number, ay: number, bx: number, by: number, c: SampleCtx): void {
  buildBoard(board, ax, ay, bx, by, w.variant);
  const L = board.len || 1;

  // sample parameters: uniform + route vertices (the vertices keep chamfers crisp)
  let n = 0;
  for (let k = 0; k < UNIFORM; k++) {
    us[n] = k / (UNIFORM - 1);
    uv[n] = 0;
    n++;
  }
  for (let i = 1; i < board.n - 1; i++) {
    const u = board.cum[i] / L;
    let j = 0;
    while (j < n && us[j] < u) j++;
    if (j < n && Math.abs(us[j] - u) < 0.012) {
      us[j] = u;
      if (board.via[i]) uv[j] = 1;
      continue;
    }
    if (j > 0 && Math.abs(us[j - 1] - u) < 0.012) {
      us[j - 1] = u;
      if (board.via[i]) uv[j - 1] = 1;
      continue;
    }
    for (let m = n; m > j; m--) {
      us[m] = us[m - 1];
      uv[m] = uv[m - 1];
    }
    us[j] = u;
    uv[j] = board.via[i] ? 1 : 0;
    n++;
  }

  // organic control points
  const dx = bx - ax;
  const dy = by - ay;
  const chord = Math.hypot(dx, dy) || 1;
  const nx = -dy / chord;
  const ny = dx / chord;
  // a column strand (phone) sways only a few px, and its samples are held in its column below
  const swayCap = w.colHalf > 0 ? w.colHalf * 1.1 : Infinity;
  const sway = c.still ? 0 : Math.max(-swayCap, Math.min(swayCap, Math.sin(c.time * 0.33 + w.ph) * chord * 0.035));
  const sway2 = c.still ? 0 : Math.sin(c.time * 0.27 + w.ph * 1.7) * chord * 0.03;
  const colLo = w.colHalf > 0 ? Math.min(w.col - w.colHalf, ax, bx) : -Infinity;
  const colHi = w.colHalf > 0 ? Math.max(w.col + w.colHalf, ax, bx) : Infinity;
  const off = w.flip * w.curl * chord + sway;
  let c1x: number, c1y: number, c2x: number, c2y: number;
  if (w.cubic) {
    c1x = ax + dx / 3 + nx * off * 1.2;
    c1y = ay + dy / 3 + ny * off * 1.2;
    c2x = ax + (2 * dx) / 3 - nx * (off * 0.6 + sway2);
    c2y = ay + (2 * dy) / 3 - ny * (off * 0.6 + sway2);
  } else {
    const cx = ax + dx / 2 + nx * off * 1.5;
    const cy = ay + dy / 2 + ny * off * 1.5;
    c1x = ax + ((cx - ax) * 2) / 3;
    c1y = ay + ((cy - ay) * 2) / 3;
    c2x = bx + ((cx - bx) * 2) / 3;
    c2y = by + ((cy - by) * 2) / 3;
  }

  w.nVias = 0;
  let tSum = 0;
  let cum = 0;
  for (let k = 0; k < n; k++) {
    const u = us[k];
    boardAt(board, u * L, pt);
    const bxk = pt[0];
    const byk = pt[1];
    const m = 1 - u;
    const a0 = m * m * m;
    const a1 = 3 * m * m * u;
    const a2 = 3 * m * u * u;
    const a3 = u * u * u;
    const oxk = a0 * ax + a1 * c1x + a2 * c2x + a3 * bx;
    const oyk = a0 * ay + a1 * c1y + a2 * c2y + a3 * by;
    const t = c.field.at((bxk + oxk) * 0.5, (byk + oyk) * 0.5);
    const x = Math.max(colLo, Math.min(colHi, bxk + (oxk - bxk) * t));
    const y = byk + (oyk - byk) * t;
    w.x[k] = x;
    w.y[k] = y;
    w.t[k] = t;
    w.u[k] = u;
    w.qa[k] = quietAlpha(c.quiet, x, y, 0, "wire");
    tSum += t;
    if (k > 0) cum += Math.hypot(x - w.x[k - 1], y - w.y[k - 1]);
    w.cum[k] = cum;
    if (uv[k] && w.nVias < 4) w.vias[w.nVias++] = k;
  }
  w.n = n;
  w.len = cum;
  w.tAvg = tSum / n;

  // tendril side-branch stub: short, curved, from the curve near u ~ 0.5
  if (w.stub) {
    const us0 = 0.38 + 0.2 * ((w.id * 0.618) % 1);
    let k = 0;
    while (k < n - 2 && w.u[k + 1] < us0) k++;
    const f = (us0 - w.u[k]) / Math.max(1e-6, w.u[k + 1] - w.u[k]);
    const sxp = w.x[k] + (w.x[k + 1] - w.x[k]) * f;
    const syp = w.y[k] + (w.y[k + 1] - w.y[k]) * f;
    const tx = w.x[k + 1] - w.x[k];
    const ty = w.y[k + 1] - w.y[k];
    const tl = Math.hypot(tx, ty) || 1;
    const side = w.flip * (w.id % 2 ? 1 : -1);
    const px = (-ty / tl) * side;
    const py = (tx / tl) * side;
    const sl = 16;
    w.stubX = sxp;
    w.stubY = syp;
    w.stubCx = sxp + (tx / tl) * sl * 0.35 + px * sl * 0.55;
    w.stubCy = syp + (ty / tl) * sl * 0.35 + py * sl * 0.55;
    w.stubT = w.t[k] + (w.t[k + 1] - w.t[k]) * f;
    w.stubQ = Math.min(w.qa[k], w.qa[k + 1]);
  }
}

/** Snap value to the board grid. */
export const snap = (v: number) => Math.round(v / GRID) * GRID;
