// Board-route clearance: a new board wire may not run on top of, or closer than one grid cell to, another
// wire's route, and may not pass over a pad or chip that is not its own. Pure.

import { buildBoard, makeBoard, type Board } from "./route";
import { GRID, type FNode, type Wire } from "./types";

const SHARED_CUT = 28; // near a shared node two routes may be closer than the gap
const bufA = makeBoard();
const bufB = makeBoard();

interface Poly {
  x: number[];
  y: number[];
}

/** The route's polyline with `cutA` px removed from its start and `cutB` from its end. */
function polyOf(b: Board, cutA: number, cutB: number): Poly {
  const out: Poly = { x: [], y: [] };
  const s0 = cutA;
  const s1 = b.len - cutB;
  if (s1 <= s0) return out;
  const at = (s: number): [number, number] => {
    let i = 1;
    while (i < b.n - 1 && b.cum[i] < s) i++;
    const seg = b.cum[i] - b.cum[i - 1];
    const f = seg > 0 ? (s - b.cum[i - 1]) / seg : 0;
    return [b.px[i - 1] + (b.px[i] - b.px[i - 1]) * f, b.py[i - 1] + (b.py[i] - b.py[i - 1]) * f];
  };
  const p0 = at(s0);
  out.x.push(p0[0]);
  out.y.push(p0[1]);
  for (let i = 1; i < b.n - 1; i++) {
    if (b.cum[i] > s0 && b.cum[i] < s1) {
      out.x.push(b.px[i]);
      out.y.push(b.py[i]);
    }
  }
  const p1 = at(s1);
  out.x.push(p1[0]);
  out.y.push(p1[1]);
  return out;
}

function pointSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const l2 = sx * sx + sy * sy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * sx + (py - y1) * sy) / l2));
  return Math.hypot(px - (x1 + t * sx), py - (y1 + t * sy));
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segSeg(a: Poly, i: number, b: Poly, j: number): number {
  const x1 = a.x[i];
  const y1 = a.y[i];
  const x2 = a.x[i + 1];
  const y2 = a.y[i + 1];
  const x3 = b.x[j];
  const y3 = b.y[j];
  const x4 = b.x[j + 1];
  const y4 = b.y[j + 1];
  const d1 = cross(x3, y3, x4, y4, x1, y1);
  const d2 = cross(x3, y3, x4, y4, x2, y2);
  const d3 = cross(x1, y1, x2, y2, x3, y3);
  const d4 = cross(x1, y1, x2, y2, x4, y4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSeg(x1, y1, x3, y3, x4, y4), pointSeg(x2, y2, x3, y3, x4, y4), pointSeg(x3, y3, x1, y1, x2, y2), pointSeg(x4, y4, x1, y1, x2, y2));
}

function polyDist(a: Poly, b: Poly): number {
  let d = Infinity;
  for (let i = 0; i + 1 < a.x.length; i++) for (let j = 0; j + 1 < b.x.length; j++) d = Math.min(d, segSeg(a, i, b, j));
  return d;
}

function polyPoint(a: Poly, px: number, py: number): number {
  let d = Infinity;
  for (let i = 0; i + 1 < a.x.length; i++) d = Math.min(d, pointSeg(px, py, a.x[i], a.y[i], a.x[i + 1], a.y[i + 1]));
  return d;
}

/** Unit direction of the first leg leaving the route's start (or end when reversed). */
function leaving(b: Board, fromEnd: boolean): [number, number] {
  const i = fromEnd ? b.n - 1 : 0;
  const j = fromEnd ? b.n - 2 : 1;
  const dx = b.px[j] - b.px[i];
  const dy = b.py[j] - b.py[i];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/** Is a straight stub from `node` to (x1, y1) clear of every wire's route (by `gap`) and of every other node? */
export function stubClear(nodes: FNode[], wires: Wire[], node: FNode, x1: number, y1: number, gap = GRID): boolean {
  const stub: Poly = { x: [node.x, x1], y: [node.y, y1] };
  const sl = Math.hypot(x1 - node.x, y1 - node.y) || 1;
  const sx = (x1 - node.x) / sl;
  const sy = (y1 - node.y) / sl;
  for (const k of nodes) {
    if (!k.alive || k.id === node.id) continue;
    if (polyPoint(stub, k.x, k.y) < (k.ic ? 24 : 15)) return false;
  }
  for (const e of wires) {
    if (e.dying >= 0) continue;
    const ea = nodes[e.a];
    const eb = nodes[e.b];
    buildBoard(bufB, ea.x, ea.y, eb.x, eb.y, e.variant);
    const mine = e.a === node.id || e.b === node.id;
    let pb: Poly;
    if (mine) {
      const [vx, vy] = leaving(bufB, e.b === node.id);
      if (sx * vx + sy * vy > 0.7) return false;
      pb = e.a === node.id ? polyOf(bufB, SHARED_CUT, 0) : polyOf(bufB, 0, SHARED_CUT);
      const cut: Poly = { x: [node.x + sx * SHARED_CUT, x1], y: [node.y + sy * SHARED_CUT, y1] };
      if (pb.x.length >= 2 && polyDist(cut, pb) < gap) return false;
      continue;
    }
    pb = polyOf(bufB, 0, 0);
    if (pb.x.length >= 2 && polyDist(stub, pb) < gap) return false;
  }
  return true;
}

/**
 * Is the board route a -> b (a variant) clear of every other wire's route by `gap`, and of every other node?
 * `skip` is a wire to leave out (the one being replaced).
 */
export function routeClear(
  nodes: FNode[],
  wires: Wire[],
  ai: number,
  bi: number,
  variant: number,
  gap = GRID,
  skip: Wire | null = null,
  filter?: (e: Wire) => boolean,
): boolean {
  const a = nodes[ai];
  const b = nodes[bi];
  buildBoard(bufA, a.x, a.y, b.x, b.y, variant);
  const full = polyOf(bufA, 0, 0);
  for (const k of nodes) {
    if (!k.alive || k.id === ai || k.id === bi) continue;
    if (polyPoint(full, k.x, k.y) < (k.ic ? 24 : 15)) return false;
  }
  for (const e of wires) {
    if (e === skip || e.dying >= 0 || (filter && !filter(e))) continue;
    const shareA = e.a === ai || e.b === ai;
    const shareB = e.a === bi || e.b === bi;
    if (shareA && shareB) return false;
    const ea = nodes[e.a];
    const eb = nodes[e.b];
    buildBoard(bufB, ea.x, ea.y, eb.x, eb.y, e.variant);
    let cutA0 = 0;
    let cutA1 = 0;
    let cutB0 = 0;
    let cutB1 = 0;
    if (shareA) {
      cutA0 = SHARED_CUT;
      if (e.a === ai) cutB0 = SHARED_CUT;
      else cutB1 = SHARED_CUT;
      const [ux, uy] = leaving(bufA, false);
      const [vx, vy] = leaving(bufB, e.b === ai);
      if (ux * vx + uy * vy > 0.7) return false;
    }
    if (shareB) {
      cutA1 = SHARED_CUT;
      if (e.a === bi) cutB0 = SHARED_CUT;
      else cutB1 = SHARED_CUT;
      const [ux, uy] = leaving(bufA, true);
      const [vx, vy] = leaving(bufB, e.b === bi);
      if (ux * vx + uy * vy > 0.7) return false;
    }
    const pa = polyOf(bufA, cutA0, cutA1);
    const pb = polyOf(bufB, cutB0, cutB1);
    if (pa.x.length < 2 || pb.x.length < 2) continue;
    if (polyDist(pa, pb) < gap) return false;
  }
  return true;
}
