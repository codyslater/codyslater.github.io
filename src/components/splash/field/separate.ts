// Generation-time check that no two wires run side by side. The route checks in generate.ts compare the unblended board
// routes, but what is drawn is blended toward a curve by the melt, so two wires that were a cell apart as board routes can
// end up a few px apart where they melt. This pass samples every wire as drawn (the same sampler, the settled blend field,
// at two points of the sway), and for each pair that stays closer than CLOSE px over more than RUN px of length (not counting
// the NEAR_END px around a shared endpoint) it moves the later wire: bow the other way or change its curl, then another end
// node, then drop it. A joining strand is never dropped or re-ended: the other wire gives way. Pure; runs once per layout.

import { routeClear } from "./clear";
import { segmentClear } from "./quiet";
import { sampleWire, variantClear } from "./route";
import { WIRE_CLEAR, type FNode, type QuietRect, type Wire } from "./types";
import type { BlendField } from "./blend";

const CLOSE = 14; // two wires closer than this ...
const RUN = 40; // ... over more than this length are a doubled line
const NEAR_END = 24; // within this of a shared endpoint two wires may be close
const STEP = 4; // px between the points compared
const TIMES = [0, 10]; // sim seconds the sway is sampled at

interface Poly {
  x: Float64Array;
  y: Float64Array;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  qmin: number; // least wire alpha along it (the quiet zone fades a wire near text)
}

interface Link {
  a: number;
  b: number;
  len: number;
  v: number;
  strand?: boolean;
  col?: number;
}

function pointSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const l2 = sx * sx + sy * sy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * sx + (py - y1) * sy) / l2));
  return Math.hypot(px - (x1 + t * sx), py - (y1 + t * sy));
}

export function separateWires(
  wires: Wire[],
  chosen: Link[],
  deg: number[],
  nodes: FNode[],
  quiet: QuietRect[],
  field: BlendField,
  w: number,
  h: number,
  shape: (wi: Wire, c: { strand?: boolean; col?: number }) => void,
  chordFree: (a: FNode, b: FNode, ia: number, ib: number, strand?: boolean) => boolean,
  isBoardWire: (e: Wire) => boolean,
  maxDeg: number,
): void {
  const maxDim = Math.max(w, h);
  const cache = new Map<Wire, Poly[]>();

  const sample = (wi: Wire): Poly[] => {
    const hit = cache.get(wi);
    if (hit) return hit;
    const a = nodes[wi.a];
    const b = nodes[wi.b];
    const out = TIMES.map((time) => {
      sampleWire(wi, a.x, a.y, b.x, b.y, { field: { at: (x: number, y: number) => field.basePart(x, y, time) }, quiet, time, still: false });
      const n = wi.n;
      const p: Poly = { x: new Float64Array(n), y: new Float64Array(n), x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, qmin: 1 };
      for (let k = 0; k < n; k++) {
        p.x[k] = wi.x[k];
        p.y[k] = wi.y[k];
        p.x0 = Math.min(p.x0, wi.x[k]);
        p.x1 = Math.max(p.x1, wi.x[k]);
        p.y0 = Math.min(p.y0, wi.y[k]);
        p.y1 = Math.max(p.y1, wi.y[k]);
        p.qmin = Math.min(p.qmin, wi.qa[k]);
      }
      return p;
    });
    wi.n = 0; // the live geometry is refreshed every frame
    cache.set(wi, out);
    return out;
  };

  /** Longest stretch of B that stays within CLOSE of A, outside the shared-end zones. */
  const closeRun = (A: Poly, B: Poly, ends: number[][]): number => {
    if (B.x0 > A.x1 + CLOSE || B.x1 < A.x0 - CLOSE || B.y0 > A.y1 + CLOSE || B.y1 < A.y0 - CLOSE) return 0;
    let run = 0;
    let best = 0;
    for (let i = 0; i + 1 < B.x.length; i++) {
      const dx = B.x[i + 1] - B.x[i];
      const dy = B.y[i + 1] - B.y[i];
      const L = Math.hypot(dx, dy);
      const n = Math.max(1, Math.ceil(L / STEP));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const px = B.x[i] + (dx * k) / n;
        const py = B.y[i] + (dy * k) / n;
        let close = !ends.some((e) => Math.hypot(px - e[0], py - e[1]) < NEAR_END);
        if (close) {
          let d = Infinity;
          for (let j = 0; j + 1 < A.x.length && d >= CLOSE; j++) d = Math.min(d, pointSeg(px, py, A.x[j], A.y[j], A.x[j + 1], A.y[j + 1]));
          close = d < CLOSE;
        }
        if (close) {
          run += L / n;
          if (run > best) best = run;
        } else run = 0;
      }
    }
    return best;
  };

  const pairClash = (m: Wire, o: Wire): boolean => {
    const ends: number[][] = [];
    for (const id of [m.a, m.b]) if (id === o.a || id === o.b) ends.push([nodes[id].x, nodes[id].y]);
    const sm = sample(m);
    const so = sample(o);
    for (let t = 0; t < TIMES.length; t++) if (closeRun(so[t], sm[t], ends) > RUN || closeRun(sm[t], so[t], ends) > RUN) return true;
    return false;
  };
  /** Another wire (any) that m runs alongside, or null. */
  const clash = (m: Wire): Wire | null => {
    for (const o of wires) if (o !== m && pairClash(m, o)) return o;
    return null;
  };
  const inside = (P: Poly[]): boolean => P.every((p) => p.x0 >= 10 && p.y0 >= 10 && p.x1 <= w - 10 && p.y1 <= h - 10);

  // 1. bow the other way, or change the curl
  const tryBow = (m: Wire): boolean => {
    if (m.colHalf > 0) return false;
    const { flip, curl } = m;
    const q0 = sample(m)[0].qmin;
    const opts: [number, number][] = [[-flip, curl], [flip, curl * 1.8], [-flip, curl * 1.8], [flip, curl * 0.35], [-flip, curl * 0.35]];
    for (const [f, c] of opts) {
      m.flip = f;
      m.curl = Math.min(c, m.strand ? 0.09 : 0.3);
      cache.delete(m);
      const P = sample(m);
      if (P[0].qmin >= q0 - 0.02 && inside(P) && !clash(m)) return true;
    }
    m.flip = flip;
    m.curl = curl;
    cache.delete(m);
    return false;
  };

  // 2. a different end node (the same kind, close to the old one), on the end it shares with the other wire first
  const tryEnd = (idx: number, o: Wire): boolean => {
    const m = wires[idx];
    if (m.strand) return false;
    const ends = [m.a, m.b].sort((p, q) => Number(q === o.a || q === o.b) - Number(p === o.a || p === o.b));
    for (const e of ends) {
      const keep = e === m.a ? m.b : m.a;
      const ne = nodes[e];
      const cands = nodes
        .filter((n) => n.alive && n.id !== e && n.id !== keep && n.board === ne.board && n.ic === ne.ic && deg[n.id] < maxDeg)
        .map((n) => ({ n, d: Math.hypot(n.x - ne.x, n.y - ne.y) }))
        .filter((r) => r.d <= 120)
        .sort((p, q) => p.d - q.d)
        .slice(0, 6);
      for (const { n } of cands) {
        const a2 = m.a === e ? n.id : m.a;
        const b2 = m.b === e ? n.id : m.b;
        if (wires.some((x) => x !== m && ((x.a === a2 && x.b === b2) || (x.a === b2 && x.b === a2)))) continue;
        const A = nodes[a2];
        const B = nodes[b2];
        const len = Math.hypot(A.x - B.x, A.y - B.y);
        if (len < 40 || len > 0.34 * maxDim || !segmentClear(quiet, A.x, A.y, B.x, B.y, WIRE_CLEAR)) continue;
        let v = -1;
        if (A.board || B.board) {
          for (let k = 0; k < 4 && v < 0; k++) {
            const vv = (m.variant + k) & 3;
            if (variantClear(quiet, A.x, A.y, B.x, B.y, vv) && routeClear(nodes, wires, a2, b2, vv, 22, m, isBoardWire)) v = vv;
          }
        } else if (chordFree(A, B, a2, b2)) v = 0;
        if (v < 0) continue;
        const saved = { a: m.a, b: m.b, variant: m.variant, flip: m.flip, curl: m.curl, cubic: m.cubic };
        m.a = a2;
        m.b = b2;
        m.variant = v;
        shape(m, {});
        cache.delete(m);
        if (!clash(m)) {
          deg[e]--;
          deg[n.id]++;
          chosen[idx] = { ...chosen[idx], a: a2, b: b2, len, v };
          return true;
        }
        Object.assign(m, saved);
        cache.delete(m);
      }
    }
    return false;
  };

  // walk the wires in order; a wire is "later" than every wire before it
  let budget = 4 * wires.length + 40;
  let k = 0;
  while (k < wires.length && budget-- > 0) {
    const late = wires[k];
    let other: Wire | null = null;
    for (let j = 0; j < k && !other; j++) if (pairClash(late, wires[j])) other = wires[j];
    if (!other) {
      k++;
      continue;
    }
    const mover = other.strand && !late.strand ? other : late; // a joining strand holds its place: the other wire moves
    const idx = wires.indexOf(mover);
    const partner = mover === late ? other : late;
    if (tryBow(mover) || tryEnd(idx, partner)) continue; // re-check the same wire
    if (mover.strand) {
      k++; // nothing moves a strand but its bow; leave the pair
      continue;
    }
    wires.splice(idx, 1);
    chosen.splice(idx, 1);
    deg[mover.a]--;
    deg[mover.b]--;
    cache.delete(mover);
    if (idx < k) k--;
  }
}
