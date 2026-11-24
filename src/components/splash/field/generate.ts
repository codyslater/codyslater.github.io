// Initial graph: a board of pads, a few filled chips and Manhattan traces along the left edge and the bottom; two corner clusters of organic cells with 1 px links; and a few long hairlines
// pulled from the board across the melting band to the clusters. Everything stays out of the keep-clear ellipse.
// Seeded: the same layout on every load.

import { boardness, type BlendField } from "./blend";
import { routeClear, stubClear } from "./clear";
import { GRID, NODE_QUIET, WIRE_CLEAR, makeNode, makeWire, type FNode, type QuietRect, type Wire } from "./types";
import { mulberry32, clamp } from "./rng";
import { snap, variantClear } from "./route";
import { rectDist, segmentClear } from "./quiet";
import { separateWires } from "./separate";

export const SEED = 20261118;
export const MAX_DEGREE = 4;

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Proper intersection of segments p1p2 and p3p4 (shared endpoints do not count). */
export function segmentsCross(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
  const d1 = orient(x3, y3, x4, y4, x1, y1);
  const d2 = orient(x3, y3, x4, y4, x2, y2);
  const d3 = orient(x1, y1, x2, y2, x3, y3);
  const d4 = orient(x1, y1, x2, y2, x4, y4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function pointSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const l2 = sx * sx + sy * sy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * sx + (py - y1) * sy) / l2));
  return Math.hypot(px - (x1 + t * sx), py - (y1 + t * sy));
}

/** The field color a place gets: five wedges around the board's bottom-left corner, so colors are grouped by region. */
function zoneOf(x: number, y: number, w: number, h: number): number {
  const theta = Math.atan2(h - y, Math.max(1, x)) / (Math.PI / 2);
  return Math.max(0, Math.min(4, Math.floor(theta * 5)));
}

/** Snap to the grid, then keep the value `edge` px or more inside [0, size]. */
function snapIn(v: number, edge: number, size: number): number {
  const lo = Math.ceil(edge / GRID) * GRID;
  const hi = Math.floor((size - edge + 4) / GRID) * GRID;
  return Math.max(lo, Math.min(hi, snap(v)));
}

/** A trace that leaves the screen: drawn straight from its pad to the edge. */
export interface Stub {
  node: FNode;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Gen {
  nodes: FNode[];
  wires: Wire[];
  stubs: Stub[];
}

interface Cand {
  a: number;
  b: number;
  len: number;
  key: number;
  v: number;
  strand?: boolean;
  col?: number; // phone strand: the x of its side-margin column
}

// One try, in steps: it pauses between its phases so a caller can spread the work out.
function* buildSteps(w: number, h: number, quiet: QuietRect[], field: BlendField, seed: number): Generator<undefined, Gen, void> {
  const rnd = mulberry32(seed);
  const sq = Math.sqrt((w * h) / (1440 * 900));
  const portrait = h > w;
  const maxDim = Math.max(w, h);
  const nPads = clamp(Math.round(18 + (sq - 0.5) * 20), 16, 34);
  const nChips = clamp(Math.round(3 + (sq - 0.5) * 4), 3, 5);
  const nOrg = portrait ? clamp(Math.round(28 * sq), 12, 18) : Math.round(20 * clamp(sq, 0.75, 1.3));
  const nodes: FNode[] = [];

  const quietOk = (x: number, y: number, extra: number): boolean => {
    for (const r of quiet) if (rectDist(r, x, y) < (r.kind === "prompt" ? NODE_QUIET - 8 : NODE_QUIET) + extra) return false;
    if (portrait && reservedX.some((ax) => Math.abs(ax - x) < 30)) return false; // the strands' columns stay free
    return true;
  };
  // Phone: two strands join the bottom board to the top clusters in the side margins, beside the text.
  // Each is a straight column: a pad near the foot, a cell near the top, both at the same x.
  // The column is searched for (outermost first, then a step or two inward; a few heights) until one clears the text,
  // so a narrow screen still gets one strand per side where a column exists.
  const reservedX: number[] = [];
  const add = (x: number, y: number, field0: number, board: boolean, ic: boolean): FNode => {
    const n = makeNode(nodes.length, x, y, field0, 0, false, rnd, w, h);
    n.board = board;
    n.ic = ic;
    nodes.push(n);
    return n;
  };
  const bd = (x: number, y: number) => boardness(x, y, w, h);
  const orgIdx: number[][] = field.clusters.map(() => []);
  // ---- phone strand anchors
  const anchorPairs: [number, number, number][] = [];
  const clearAnchor = (x: number, y: number) => quiet.every((r) => rectDist(r, x, y) >= NODE_QUIET - 8) && nodes.every((o) => Math.hypot(o.x - x, o.y - y) >= 40);
  for (const side of portrait ? [0, 1] : []) {
    let found = false;
    for (let step = 0; step < 4 && !found; step++) {
      const ax = side === 0 ? snapIn(32 + step * GRID, 32, w) : snapIn(w - 32 - step * GRID, 32, w);
      if (side === 0 ? ax >= w / 2 : ax <= w / 2) continue;
      for (const ft of [0.12, 0.08, 0.17, 0.22]) {
        for (const fb of [0.82, 0.77, 0.87]) {
          const yb = snapIn(fb * h, 32, h);
          const yt = Math.round(ft * h);
          if (found || yb - yt < 0.4 * h) continue;
          if (!clearAnchor(ax, yb) || !clearAnchor(ax, yt)) continue;
          if (!segmentClear(quiet, ax, yb, ax, yt, WIRE_CLEAR) || !variantClear(quiet, ax, yb, ax, yt, 0)) continue;
          const pad = add(ax, yb, zoneOf(ax, yb, w, h), true, false);
          const ci = field.clusters.reduce((best, c, k) => (Math.hypot(c.cx - ax, c.cy - yt) < Math.hypot(field.clusters[best].cx - ax, field.clusters[best].cy - yt) ? k : best), 0);
          const cell = add(ax, yt, zoneOf(field.clusters[ci].cx, field.clusters[ci].cy, w, h), false, false);
          cell.pin = true; // the strand's column must not wander: its top end holds its place
          orgIdx[ci].push(cell.id);
          anchorPairs.push([pad.id, cell.id, ax]);
          reservedX.push(ax);
          found = true;
        }
      }
    }
  }


  // ---- chips: filled, on the solid board, well apart
  const chipGap = portrait ? 92 : 150 * Math.max(0.8, sq);
  for (let tries = 0, got = 0; tries < 600 && got < nChips; tries++) {
    const x = snapIn(44 + rnd() * (w - 88), 48, w);
    const y = snapIn(44 + rnd() * (h - 88), 48, h);
    if (bd(x, y) < 0.95 || !quietOk(x, y, 10)) continue;
    if (nodes.some((o) => Math.hypot(o.x - x, o.y - y) < chipGap)) continue;
    add(x, y, zoneOf(x, y, w, h), true, true);
    got++;
  }
  // ---- pads: most on the solid board, a quarter in the melting band where they round off
  const nCore = Math.round(nPads * 0.66);
  const padGap = portrait ? 30 : 46;
  for (let i = 0; i < nPads; i++) {
    const front = i >= nCore;
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (let c = 0; c < 50; c++) {
      const x = snapIn(28 + rnd() * (w - 56), 32, w);
      const y = snapIn(28 + rnd() * (h - 56), 32, h);
      const b = bd(x, y);
      if (front ? b < 0.4 || b > 0.9 : b < 0.93) continue;
      if (front && portrait && y < 0.28 * h) continue;
      if (!quietOk(x, y, 4)) continue;
      let score = Infinity;
      for (const o of nodes) if (o.board) score = Math.min(score, Math.hypot(o.x - x, o.y - y) * (o.ic ? 0.7 : 1));
      if (nodes.length === 0) score = 1;
      if (score < padGap) continue;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    if (best) add(best.x, best.y, zoneOf(best.x, best.y, w, h), true, false);
  }
  const nBoard = nodes.length;

  // ---- organic cells: inside the corner clusters, blue-noise spaced, never in the keep-clear zone
  field.clusters.forEach((cl, ci) => {
    const count = Math.max(4, Math.round(nOrg * cl.share));
    for (let i = 0; i < count; i++) {
      let best: { x: number; y: number } | null = null;
      let bestScore = -1;
      for (let c = 0; c < 60; c++) {
        const ang = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd());
        const x = cl.cx + Math.cos(ang) * cl.rx * rr;
        const y = cl.cy + Math.sin(ang) * cl.ry * rr;
        if (x < 28 || y < 28 || x > w - 28 || y > h - 28) continue;
        if (bd(x, y) > 0.08 || !quietOk(x, y, 2)) continue;
        let score = Infinity;
        for (const o of nodes) if (!o.board) score = Math.min(score, Math.hypot(o.x - x, o.y - y));
        if (score < 44) continue;
        if (nodes.length === nBoard && orgIdx.every((a) => a.length === 0)) score = 1;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
      if (best) {
        const z = zoneOf(cl.cx, cl.cy, w, h);
        const f = rnd() < 0.7 ? z : clamp(z + (rnd() < 0.5 ? -1 : 1), 0, 4);
        orgIdx[ci].push(add(best.x, best.y, f, false, false).id);
      }
    }
  });
  // ---- the melting band: nodes between the board and the clusters (pad -> rounded pad -> cell as the blend rises)
  const bandIdx: number[] = [];
  const nBand = portrait ? 6 : Math.round(12 * clamp(sq, 0.8, 1.3));
  for (let i = 0; i < nBand; i++) {
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (let c = 0; c < 70; c++) {
      const x = 28 + rnd() * (w - 56);
      const y = 28 + rnd() * (h - 56);
      const b = bd(x, y);
      if (b < 0.3 || b > 0.7 || !quietOk(x, y, 4)) continue;
      let score = Infinity;
      for (const o of nodes) score = Math.min(score, Math.hypot(o.x - x, o.y - y));
      if (score < 46) continue;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    if (best) bandIdx.push(add(best.x, best.y, zoneOf(best.x, best.y, w, h), false, false).id);
  }
  const n = nodes.length;

  yield;
  // ---- wires
  const chosen: Cand[] = [];
  const probe: Wire[] = []; // same wires as Wire objects (a < b), for the route-clearance checks
  const deg = new Array<number>(n).fill(0);
  const isBoardWire = (e: Wire) => nodes[e.a].board || nodes[e.b].board;
  const accept = (c: Cand) => {
    chosen.push(c);
    const wi = makeWire(probe.length, c.a, c.b, -10, false, rnd);
    wi.variant = c.v;
    probe.push(wi);
    deg[c.a]++;
    deg[c.b]++;
  };
  const chordFree = (a: FNode, b: FNode, ia: number, ib: number, strand = false): boolean => {
    for (const e of chosen) {
      if (e.a === ia || e.a === ib || e.b === ia || e.b === ib) continue;
      const p = nodes[e.a];
      const q = nodes[e.b];
      if (strand && ((!nodes[e.a].board && !nodes[e.b].board) || e.strand)) continue; // a strand may cross the cells' faint links and other strands
      if (segmentsCross(a.x, a.y, b.x, b.y, p.x, p.y, q.x, q.y)) return false;
    }
    for (let k = 0; k < n; k++) {
      if (k === ia || k === ib) continue;
      if (pointSegDist(nodes[k].x, nodes[k].y, a.x, a.y, b.x, b.y) < (strand ? 12 : 18)) return false;
    }
    return true;
  };
  const pairs = (ids: number[], minLen: number, maxLen: number): Cand[] => {
    const out: Cand[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = nodes[ids[i]];
        const b = nodes[ids[j]];
        const len = Math.hypot(a.x - b.x, a.y - b.y);
        if (len < minLen || len > maxLen) continue;
        out.push({ a: ids[i], b: ids[j], len, key: len * (0.8 + 0.4 * rnd()), v: 0 });
      }
    }
    return out.sort((p, q) => p.key - q.key);
  };

  // board: a spanning forest of short Manhattan traces, then a few extras. Every route keeps a grid cell from the others.
  const B = nodes.filter((nd) => nd.board).map((nd) => nd.id);
  // ---- strands first: long traces from the board across the band into the clusters. Everything else is wired around them.
  // phone: the two straight strands in the side margins
  const hairChords: { a: FNode; b: FNode }[] = [];
  for (const [pi, ci, col] of anchorPairs) {
    const a = nodes[pi];
    const t = nodes[ci];
    if (!segmentClear(quiet, a.x, a.y, t.x, t.y, WIRE_CLEAR)) continue;
    if (!variantClear(quiet, a.x, a.y, t.x, t.y, 0)) continue;
    accept({ a: pi, b: ci, len: Math.hypot(a.x - t.x, a.y - t.y), key: 0, v: 0, strand: true, col });
    hairChords.push({ a, b: t });
  }

  // strands: long, from the board across the melting band into the cells of a cluster; some pass above, below or
  // beside the name (only the text boxes are off limits to a wire)
  const nHair = portrait ? 3 : clamp(Math.round(7 * clamp(sq, 0.8, 1.2)), 6, 9);
  const srcs = B.filter((i) => !nodes[i].ic);
  const hairApart = (a: FNode, t: FNode): boolean => {
    for (const o of hairChords) {
      if (segmentsCross(a.x, a.y, t.x, t.y, o.a.x, o.a.y, o.b.x, o.b.y)) continue; // crossing at an angle is fine
      for (let k = 1; k < 16; k++) {
        const f = k / 16;
        const x = a.x + (t.x - a.x) * f;
        const y = a.y + (t.y - a.y) * f;
        const near = Math.min(Math.hypot(x - o.a.x, y - o.a.y), Math.hypot(x - o.b.x, y - o.b.y));
        if (near < 90) continue; // the ends may meet
        if (pointSegDist(x, y, o.a.x, o.a.y, o.b.x, o.b.y) < 44) return false;
      }
    }
    return true;
  };
  const hairUsed = new Map<number, number>();
  const tgtUsed = new Set<number>();
  const order: number[] = [];
  const queues = orgIdx.map((ids) => ids.slice().sort(() => rnd() - 0.5));
  for (let round = 0; order.length < 80 && round < 120; round++) {
    const ci = round % queues.length;
    const q = queues[ci];
    if (q.length) order.push(q.shift() as number);
  }
  let made = 0;
  for (const ti of order) {
    if (made >= nHair) break;
    if (tgtUsed.has(ti) || deg[ti] >= MAX_DEGREE) continue;
    const t = nodes[ti];
    const ranked = srcs
      .filter((i) => (hairUsed.get(i) ?? 0) < 1 && deg[i] < MAX_DEGREE)
      .map((i) => ({ i, len: Math.hypot(nodes[i].x - t.x, nodes[i].y - t.y) }))
      .filter((r) => r.len > 0.2 * maxDim && r.len < 0.85 * maxDim)
      .sort((p, q) => Math.abs(p.len - 0.5 * maxDim) - Math.abs(q.len - 0.5 * maxDim));
    for (const r of ranked) {
      const a = nodes[r.i];
      if (!segmentClear(quiet, a.x, a.y, t.x, t.y, WIRE_CLEAR)) continue;
      if (!chordFree(a, t, r.i, ti, true)) continue;
      if (!hairApart(a, t)) continue;
      let v = -1;
      for (let k = 0; k < 4; k++) {
        if (variantClear(quiet, a.x, a.y, t.x, t.y, k) && routeClear(nodes, probe, r.i, ti, k, 26, null, isBoardWire)) {
          v = k;
          break;
        }
      }
      if (v < 0) continue;
      accept({ a: r.i, b: ti, len: r.len, key: r.len, v, strand: true });
      hairChords.push({ a, b: t });
      hairUsed.set(r.i, (hairUsed.get(r.i) ?? 0) + 1);
      tgtUsed.add(ti);
      made++;
      break;
    }
  }
  const boardCands = pairs(B, 40, 0.24 * maxDim);
  const tryBoard = (c: Cand, limit: number): boolean => {
    if (deg[c.a] >= limit || deg[c.b] >= limit) return false;
    const a = nodes[c.a];
    const b = nodes[c.b];
    if (!segmentClear(quiet, a.x, a.y, b.x, b.y, WIRE_CLEAR)) return false;
    const pref = Math.floor(rnd() * 4);
    for (let k = 0; k < 4; k++) {
      const v = (pref + k) & 3;
      if (!variantClear(quiet, a.x, a.y, b.x, b.y, v)) continue;
      if (!routeClear(nodes, probe, c.a, c.b, v, 22)) continue;
      accept({ ...c, v });
      return true;
    }
    return false;
  };
  const parent = nodes.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const c of boardCands) {
    if (find(c.a) === find(c.b)) continue;
    if (tryBoard(c, 3)) parent[find(c.a)] = find(c.b);
  }
  const boardTarget = Math.round(B.length * 1.35);
  for (const c of boardCands) {
    if (chosen.length >= boardTarget) break;
    if (chosen.some((e) => e.a === c.a && e.b === c.b)) continue;
    // keep straight, short runs: prefer wires whose ends are roughly aligned
    tryBoard(c, 3);
  }
  yield;
  // join the board's separate pieces with a longer trace, so it reads as one board
  for (let pass = 0; pass < 6; pass++) {
    const comp = new Map<number, number>();
    const uf2 = B.map((_, k) => k);
    const f2 = (x: number): number => (uf2[x] === x ? x : (uf2[x] = f2(uf2[x])));
    const at = new Map(B.map((id, k) => [id, k]));
    for (const e of chosen) {
      const ka = at.get(e.a);
      const kb = at.get(e.b);
      if (ka !== undefined && kb !== undefined) uf2[f2(ka)] = f2(kb);
    }
    for (const id of B) comp.set(id, f2(at.get(id) as number));
    const link = pairs(B, 40, 0.5 * maxDim).filter((c) => comp.get(c.a) !== comp.get(c.b));
    let joined = false;
    for (const c of link) {
      if (tryBoard(c, 3)) {
        joined = true;
        break;
      }
    }
    if (!joined) break;
  }

  // organic: short links inside each cluster (a hairline-thin graph)
  const orgTarget0 = chosen.length;
  for (const ids of orgIdx) {
    const cs = pairs(ids, 36, 0.2 * maxDim);
    const uf = new Map<number, number>();
    const fnd = (x: number): number => {
      const p = uf.get(x) ?? x;
      if (p === x) return x;
      const r = fnd(p);
      uf.set(x, r);
      return r;
    };
    const tryOrg = (c: Cand, limit: number): boolean => {
      if (deg[c.a] >= limit || deg[c.b] >= limit) return false;
      const a = nodes[c.a];
      const b = nodes[c.b];
      if (!segmentClear(quiet, a.x, a.y, b.x, b.y, Math.max(WIRE_CLEAR, 0.12 * c.len))) return false;
      if (!chordFree(a, b, c.a, c.b)) return false;
      accept({ ...c, v: 0 });
      return true;
    };
    for (const c of cs) {
      if (fnd(c.a) === fnd(c.b)) continue;
      if (tryOrg(c, 3)) uf.set(fnd(c.a), fnd(c.b));
    }
    const target = Math.round(ids.length * 1.55);
    let have = chosen.filter((e) => ids.includes(e.a) && ids.includes(e.b)).length;
    for (const c of cs) {
      if (have >= target) break;
      if (chosen.some((e) => e.a === c.a && e.b === c.b)) continue;
      if (tryOrg(c, 4)) have++;
    }
  }
  void orgTarget0;

  yield;
  // the melting band: every band node joins the board on one side and the cells on the other, so a line runs
  // unbroken through the melt (right-angled at the board end, bending mid-way, curving at the cell end)
  const tryAny = (c: Cand, limit: number): boolean => {
    if (deg[c.a] >= limit || deg[c.b] >= limit) return false;
    const a = nodes[c.a];
    const b = nodes[c.b];
    if (!segmentClear(quiet, a.x, a.y, b.x, b.y, WIRE_CLEAR)) return false;
    if (a.board || b.board) {
      const pref = Math.floor(rnd() * 4);
      for (let k = 0; k < 4; k++) {
        const v = (pref + k) & 3;
        if (variantClear(quiet, a.x, a.y, b.x, b.y, v) && routeClear(nodes, probe, c.a, c.b, v, 22, null, isBoardWire)) {
          accept({ ...c, v });
          return true;
        }
      }
      return false;
    }
    if (!chordFree(a, b, c.a, c.b)) return false;
    accept({ ...c, v: 0 });
    return true;
  };
  const bandPass = () => {
   for (const id of bandIdx) {
    const me = nodes[id];
    const cand: Cand[] = [];
    for (const o of nodes) {
      if (o.id === id || o.ic) continue;
      const len = Math.hypot(o.x - me.x, o.y - me.y);
      if (len < 40 || len > 0.34 * maxDim) continue;
      cand.push({ a: Math.min(id, o.id), b: Math.max(id, o.id), len, key: len * (0.8 + 0.4 * rnd()), v: 0 });
    }
    cand.sort((p, q) => p.key - q.key);
    let toBoard = 0;
    let toRest = 0;
    for (const c of cand) {
      const other = nodes[c.a === id ? c.b : c.a];
      if (other.board ? toBoard >= 2 : toRest >= 2) continue;
      if (chosen.some((e) => e.a === c.a && e.b === c.b)) continue;
      if (tryAny(c, MAX_DEGREE)) {
        if (other.board) toBoard++;
        else toRest++;
      }
      if (toBoard >= 2 && toRest >= 2) break;
    }
   }
  };
  bandPass(); // after the strands, so the band's lines find their way around them
  // A band node exists to carry a line through the melt, so it needs a trace to the board and one to the cells. One
  // that got only one side is a dot at the end of a stub in mid-air: drop it with its trace (its other end keeps its
  // own links, or is dropped as unreached below).
  for (const id of bandIdx) {
    let toBoard = 0;
    let toRest = 0;
    for (const c of chosen) {
      if (c.a !== id && c.b !== id) continue;
      if (nodes[c.a === id ? c.b : c.a].board) toBoard++;
      else toRest++;
    }
    if (toBoard > 0 && toRest > 0) continue;
    for (let k = chosen.length - 1; k >= 0; k--) {
      const c = chosen[k];
      if (c.a !== id && c.b !== id) continue;
      chosen.splice(k, 1);
      probe.splice(k, 1);
      deg[c.a]--;
      deg[c.b]--;
    }
  }

  yield;
  // ---- a pad that ends a single short trace is a spur ending in a dot: give it a second trace, or drop it
  for (const id of B) {
    if (nodes[id].ic || deg[id] !== 1) continue;
    const near = pairs(B, 40, 0.42 * maxDim).filter((c) => c.a === id || c.b === id);
    for (const c of near) {
      if (chosen.some((e) => e.a === c.a && e.b === c.b)) continue;
      if (tryBoard(c, 4)) break;
    }
  }
  for (let pass = 0; pass < (portrait ? 0 : 1); pass++) {
    for (let k = chosen.length - 1; k >= 0; k--) {
      const c = chosen[k];
      for (const id of [c.a, c.b]) {
        const nd = nodes[id];
        if (nd.board && !nd.ic && deg[id] === 1 && c.len < 150) {
          chosen.splice(k, 1);
          probe.splice(k, 1);
          deg[c.a]--;
          deg[c.b]--;
          break;
        }
      }
    }
  }

  // ---- traces that run off the screen edge: a few pads on the left and bottom edges keep going to the edge
  const stubs: Stub[] = [];
  const maxStubs = portrait ? 4 : 5;
  for (const i of B) {
    if (stubs.length >= maxStubs) break;
    const nd = nodes[i];
    if (nd.ic || deg[i] < 1 || rnd() < 0.3) continue;
    const opts: [number, number][] = [];
    if (nd.x <= 4.5 * GRID) opts.push([0, nd.y]);
    if (nd.y >= h - 4.5 * GRID) opts.push([nd.x, h]);
    if (!opts.length) continue;
    const [ex, ey] = opts[Math.floor(rnd() * opts.length)];
    if (stubs.some((s) => Math.hypot(s.x0 - nd.x, s.y0 - nd.y) < 70)) continue;
    if (!stubClear(nodes, probe, nd, ex, ey, 17)) continue;
    stubs.push({ node: nd, x0: nd.x, y0: nd.y, x1: ex, y1: ey });
  }

  // ---- direct wires so every node has an in- and an out-wire where its degree allows
  const dirs = chosen.map(() => rnd() < 0.5);
  const inOut = () => {
    const io = nodes.map(() => ({ i: 0, o: 0 }));
    chosen.forEach((c, k) => {
      const [f, t] = dirs[k] ? [c.a, c.b] : [c.b, c.a];
      io[f].o++;
      io[t].i++;
    });
    return io;
  };
  for (let pass = 0; pass < 24; pass++) {
    const io = inOut();
    let changed = false;
    for (let v = 0; v < n; v++) {
      if (io[v].i > 0 && io[v].o > 0) continue;
      for (let k = 0; k < chosen.length; k++) {
        const c = chosen[k];
        if (c.a !== v && c.b !== v) continue;
        const u = c.a === v ? c.b : c.a;
        const fromV = (dirs[k] ? c.a : c.b) === v;
        const ui = io[u].i + (fromV ? -1 : 1);
        const uo = io[u].o + (fromV ? 1 : -1);
        const needV = io[v].o === 0 ? !fromV : fromV;
        if (!needV) continue;
        if (ui <= 0 || uo <= 0) continue;
        dirs[k] = !dirs[k];
        changed = true;
        break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }

  // the bow of a wire (side, size, shape) from its ends and kind; reads no randomness, so it can be redone for a new end
  const shape = (wi: Wire, c: { strand?: boolean; col?: number }) => {
    const p = nodes[wi.a];
    const q = nodes[wi.b];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const nx = -(q.y - p.y) / len;
    const ny = (q.x - p.x) / len;
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const nameZone = quiet.find((r) => r.ell);
    const away = nameZone?.ell ? (nameZone.ell.cx - mx) * nx + (nameZone.ell.cy - my) * ny : (w / 2 - mx) * nx + (h / 2 - my) * ny;
    if (len > 160) {
      wi.flip = away >= 0 ? -1 : 1; // bow away from the name's keep-clear zone, never toward it
      wi.curl = Math.min(wi.curl, Math.max(0.05, 46 / len));
      wi.cubic = false;
    }
    if (c.strand) {
      wi.strand = true;
      wi.curl = clamp(36 / len, 0.015, 0.05); // a long strand barely bows: it must not wander toward the text
      wi.cubic = false;
    }
    if (c.col !== undefined) {
      // a phone strand stays in its column: no bow, a few px of sway, samples held within 12 px of the column and
      // at least 14 px inside the screen edge (the column is >= WIRE_CLEAR from the text, so 12 px off it is >= 12 px from it)
      wi.col = c.col;
      wi.colHalf = Math.max(0, Math.min(12, c.col - 14, w - 14 - c.col));
      wi.curl = 0;
    }
  };
  const wires: Wire[] = chosen.map((c, k) => {
    const fwd = dirs[k];
    const [f, t] = fwd ? [c.a, c.b] : [c.b, c.a];
    const wi = makeWire(k, f, t, -10, false, rnd);
    // a reversed board route keeps its shape when horizontal-first and vertical-first swap
    wi.variant = fwd ? c.v : c.v === 0 ? 1 : c.v === 1 ? 0 : c.v;
    shape(wi, c);
    return wi;
  });
  separateWires(wires, chosen, deg, nodes, quiet, field, w, h, shape, chordFree, isBoardWire, MAX_DEGREE);
  // hubs (three or more links) carry the soft glow at rest; the other cells stay plain
  for (const nd of nodes) if (!nd.board) nd.halo = deg[nd.id] >= 3;
  // No twin strands: two wires never share both ends (a second wire would share the first one's route on the board and
  // run beside it, crossing, through the band), and routeClear keeps routes a cell apart.
  // A node no wire could reach is dropped rather than left as a stray pad.
  const used = new Set<number>();
  for (const wi of wires) {
    used.add(wi.a);
    used.add(wi.b);
  }
  const stubKept = stubs.filter((s) => used.has(s.node.id));
  if (used.size === nodes.length) return { nodes, wires, stubs: stubKept };
  const remap = new Map<number, number>();
  const kept = nodes.filter((nd) => used.has(nd.id));
  kept.forEach((nd, k) => remap.set(nd.id, k));
  kept.forEach((nd, k) => {
    nd.id = k;
  });
  for (const wi of wires) {
    wi.a = remap.get(wi.a) as number;
    wi.b = remap.get(wi.b) as number;
  }
  return { nodes: kept, wires, stubs: stubKept };
}

/**
 * The layout: the first of a few seeded tries that meets the targets (enough strands from the board into the clusters,
 * the chips and pads the screen can hold), else the best of them. Deterministic: the same layout on every load.
 */
export function generate(w: number, h: number, quiet: QuietRect[], field: BlendField): Gen {
  const steps = generateSteps(w, h, quiet, field);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * The same search in steps: each try pauses between its phases and between tries. A try is tens of milliseconds on a
 * slow phone and there can be several, so the page runs a step at a time and stays responsive. The result is the
 * layout `generate` returns.
 */
export function* generateSteps(w: number, h: number, quiet: QuietRect[], field: BlendField): Generator<undefined, Gen, void> {
  const portrait = h > w;
  const sq = Math.sqrt((w * h) / (1440 * 900));
  const wantStrands = portrait ? 2 : 5;
  const wantChips = clamp(Math.round(3 + (sq - 0.5) * 4), 3, 5);
  const wantPads = clamp(Math.round(18 + (sq - 0.5) * 20), 16, 34) * 0.9;
  let best: Gen | null = null;
  let bestScore = -1;
  for (let k = 0; k < 14; k++) {
    const g = yield* buildSteps(w, h, quiet, field, SEED + k * 7919);
    const strands = g.wires.filter((x) => x.strand).length;
    const chips = g.nodes.filter((n) => n.ic).length;
    const pads = g.nodes.filter((n) => n.board && !n.ic).length;
    const score = Math.min(strands, wantStrands) * 20 + Math.min(chips, wantChips) * 8 + Math.min(pads, wantPads);
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
    if (strands >= wantStrands && chips >= wantChips && pads >= wantPads) break;
    yield;
  }
  return best as Gen;
}
