// Rules 2 and 3. Fire together, wire together: co-firing nearby nodes grow a wire. A fixed wire
// budget: growing at budget prunes the weakest wire that leaves both its endpoints with an in- and
// an out-wire. Strength rises when a signal crosses and decays with a 90 s half-life. Pure.

import { MAX_DEGREE, pointSegDist, segmentsCross } from "./generate";
import { routeClear } from "./clear";
import { variantClear } from "./route";
import { segmentClear } from "./quiet";
import { WIRE_CLEAR, makeWire, type Wire } from "./types";
import type { Sim } from "./sim";

/** A clear board route for a -> b (preferred variant first), or -1. A route that touches the board must also keep clear of its traces. */
export function clearVariant(sim: Sim, ai: number, bi: number, preferred: number): number {
  const a = sim.nodes[ai];
  const b = sim.nodes[bi];
  const onBoard = a.board || b.board;
  for (let k = 0; k < 4; k++) {
    const v = (preferred + k) & 3;
    if (!variantClear(sim.quiet, a.x, a.y, b.x, b.y, v)) continue;
    if (onBoard && !routeClear(sim.nodes, sim.wires, ai, bi, v, 18, null, (e) => sim.nodes[e.a].board || sim.nodes[e.b].board)) continue;
    return v;
  }
  return -1;
}

const STRENGTH_HALF_LIFE = 90;
const PAIR_WINDOW = 0.4; // s
const PAIR_HALF_LIFE = 90; // s
export const BUDGET_EXTRA = 4;
export const USER_EXTRA = 8;

export function decayStrengths(sim: Sim, dt: number): void {
  const k = Math.pow(0.5, dt / STRENGTH_HALF_LIFE);
  for (const w of sim.wires) w.strength *= k;
}

export function bumpStrength(w: Wire): void {
  w.strength += 0.3 * (1 - w.strength);
}

/** A node fired at sim time: count co-firing with near nodes; grow a wire when it repeats. */
export function recordFire(sim: Sim, i: number): void {
  const now = sim.time;
  const a = sim.nodes[i];
  const near = sim.coFireRange();
  for (let j = 0; j < sim.nodes.length; j++) {
    if (j === i) continue;
    const b = sim.nodes[j];
    if (!b.alive || b.dragging || now - b.lastFire > PAIR_WINDOW) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) > near) continue;
    if (sim.hasWire(i, j)) continue;
    const key = Math.min(i, j) * 4096 + Math.max(i, j);
    const e = sim.pairs.get(key);
    const c = (e ? e.c * Math.pow(0.5, (now - e.t) / PAIR_HALF_LIFE) : 0) + 1;
    if (c >= sim.pairThreshold) {
      sim.pairs.delete(key);
      grow(sim, j, i); // the one that fired first -> the one that fired second
    } else {
      sim.pairs.set(key, { c, t: now });
    }
  }
  a.lastFire = now;
}

function feasible(sim: Sim, ai: number, bi: number, skipDegree = false): boolean {
  const a = sim.nodes[ai];
  const b = sim.nodes[bi];
  if (!a.alive || !b.alive || a.dragging || b.dragging) return false;
  if (!skipDegree && (sim.deg(ai) >= MAX_DEGREE || sim.deg(bi) >= MAX_DEGREE)) return false;
  if (sim.hasWire(ai, bi)) return false;
  const len = Math.hypot(a.x - b.x, a.y - b.y);
  if (len < 40 || len > 0.4 * Math.max(sim.w, sim.h)) return false;
  if (!segmentClear(sim.quiet, a.x, a.y, b.x, b.y, Math.max(WIRE_CLEAR, 0.12 * len))) return false;
  if (clearVariant(sim, ai, bi, 0) < 0) return false;
  for (const w of sim.wires) {
    if (w.a === ai || w.a === bi || w.b === ai || w.b === bi) continue;
    const p = sim.nodes[w.a];
    const q = sim.nodes[w.b];
    if (segmentsCross(a.x, a.y, b.x, b.y, p.x, p.y, q.x, q.y)) return false;
  }
  for (const k of sim.nodes) {
    if (!k.alive || k.id === ai || k.id === bi) continue;
    if (pointSegDist(k.x, k.y, a.x, a.y, b.x, b.y) < 18) return false;
  }
  return true;
}

function autoCount(sim: Sim): number {
  let c = 0;
  for (const w of sim.wires) if (!w.user) c++;
  return c;
}

function grow(sim: Sim, ai: number, bi: number): void {
  if (sim.pending || sim.time - sim.lastGrow < sim.growCooldown) return;
  const full = [ai, bi].filter((i) => sim.deg(i) >= MAX_DEGREE);
  // With ~1.6 wires per node most nodes sit at the degree cap, so a capped endpoint gives up its weakest
  // prunable wire to make room (a rewiring; at most one capped endpoint, the other must have room).
  if (full.length > 1 || !feasible(sim, ai, bi, true)) return;
  if (full.length === 1) {
    const victim = weakestPrunable(sim, full[0]);
    if (!victim) return;
    prune(sim, victim, ai, bi);
    return;
  }
  if (autoCount(sim) < sim.budget) {
    create(sim, ai, bi);
    return;
  }
  const victim = weakestPrunable(sim, -1);
  if (victim) prune(sim, victim, ai, bi);
}

function prune(sim: Sim, victim: Wire, ai: number, bi: number): void {
  victim.dying = sim.time;
  sim.pending = { a: ai, b: bi, victim };
}

function create(sim: Sim, ai: number, bi: number): void {
  const w = makeWire(sim.nextWireId++, ai, bi, sim.time, false, sim.rnd);
  w.strength = 0.45;
  w.variant = clearVariant(sim, ai, bi, w.variant);
  if (w.variant < 0) w.variant = 0;
  sim.wires.push(w);
  sim.lastGrow = sim.time;
}

/** Called each step: finish a growth once its pruned wire has finished fading. */
export function resolvePending(sim: Sim): void {
  const p = sim.pending;
  if (!p) return;
  if (sim.wires.includes(p.victim)) return; // still fading out
  if (autoCount(sim) >= sim.budget) return;
  sim.pending = null;
  if (feasible(sim, p.a, p.b)) create(sim, p.a, p.b);
}

function weakestPrunable(sim: Sim, endpoint: number): Wire | null {
  let best: Wire | null = null;
  for (const w of sim.wires) {
    if (w.dying >= 0 || w.user || w.strand) continue; // a strand is never the weakest: it is the board's road into the cells
    if (endpoint >= 0 && w.a !== endpoint && w.b !== endpoint) continue;
    if (!leavesBothConnected(sim, w)) continue;
    if (!best || w.strength < best.strength) best = w;
  }
  return best;
}

function leavesBothConnected(sim: Sim, victim: Wire): boolean {
  for (const end of [victim.a, victim.b]) {
    let inn = 0;
    let out = 0;
    for (const w of sim.wires) {
      if (w === victim || w.dying >= 0) continue;
      if (w.a === end) out++;
      if (w.b === end) inn++;
    }
    if (inn < 1 || out < 1) return false;
  }
  return true;
}
