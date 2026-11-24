// The opening score: a short, seeded, deterministic sequence that runs once per load on top of the
// simulation (the sim's own random ambient firing starts only after it ends). Few events, each
// legible, nothing that adds lasting ink beyond one budded cell and one new trace.
//
//   1 power-on     T0 .. T0+0.5      the board fades up; one pad at the board edge sends a pulse toward the name
//   2 keystrokes   each Tk           one crisp pulse per keystroke, outward from the trace nearest the name
//   3 melt wave    ~Te-1 .. Te+1.5   the base gradient is released by a travelling front (BlendField)
//   4 crossing     Te+1 .. Te+3      one signal runs a pre-chosen 3-5 wire path from board to organic
//   5 growth       Te+2.6 .. Te+5    a cell buds on the organic side; a trace routes itself on the board
//   6 return       Te+4.2 .. Te+5.7  a bead returns from the new cell and lights an IC on the board
//
// Te is the moment the name has finished typing. Touching the graph yields the score to the visitor.

import { MAX_DEGREE, SEED, pointSegDist, segmentsCross } from "./generate";
import { rectDist, segmentClear } from "./quiet";
import { mulberry32 } from "./rng";
import { BUDGET_EXTRA, clearVariant } from "./wiring";
import { NODE_QUIET, WIRE_CLEAR, makeNode, makeWire, type ChainStep, type Wire } from "./types";
import type { Sim } from "./sim";

const T_POWER = 0.5;
const T_EDGE_PULSE = 0.3;
const OFF_CROSS = 1.0;
const OFF_BUD = 2.6;
const OFF_TRACE = 3.6;
const OFF_RETURN = 4.2;
const DUR_CROSS = 2.0;
const DUR_RETURN = 1.5;
const KEY_SPEED = 240; // px/s
const HARD_STOP = 14; // s after te: the score never outlives this

interface Plan {
  edge: { wire: Wire; rev: boolean } | null;
  keys: ChainStep[];
  steps: ChainStep[]; // crossing path, board -> organic
  startNode: number;
  bud: { parent: number; x: number; y: number } | null;
  trace: { a: number; b: number; variant: number } | null;
}

interface Ev {
  at: number;
  fn: () => void;
}

export class Score {
  done: boolean;
  te = -1;
  private plan_: Plan | null = null;
  private events: Ev[] = [];
  private keyIx = 0;
  private budWire: Wire | null = null;

  constructor(readonly enabled: boolean) {
    this.done = !enabled;
  }

  get ambientAllowed(): boolean {
    return this.done;
  }

  /** Fade-up factor for the board at power-on. */
  powerOn(sim: Sim): number {
    return this.enabled ? Math.min(1, sim.time / T_POWER) : 1;
  }

  // ------------------------------------------------------------------ planning (layout time, seeded)
  plan(sim: Sim): void {
    if (!this.enabled) return;
    const rnd = mulberry32(SEED ^ 0x5c0e);
    const f = sim.field;
    const nameRect = sim.quiet.find((r) => r.kind === "name");
    const nc = nameRect ? { x: (nameRect.x0 + nameRect.x1) / 2, y: (nameRect.y0 + nameRect.y1) / 2 } : { x: sim.w / 2, y: sim.h / 2 };
    const dName = (x: number, y: number) => (nameRect ? rectDist(nameRect, x, y) : Math.hypot(x - nc.x, y - nc.y));
    const nodes = sim.nodes;
    const incident = (id: number) => sim.wires.filter((w) => w.a === id || w.b === id);
    const other = (w: Wire, id: number) => (w.a === id ? w.b : w.a);
    const u = (id: number) => f.uOf(nodes[id].x, nodes[id].y);

    // beat 1: the pad at the board edge
    let edgeId = -1;
    for (const n of nodes) {
      if (incident(n.id).length === 0) continue;
      if (edgeId < 0 || u(n.id) < u(edgeId)) edgeId = n.id;
    }
    let edge: Plan["edge"] = null;
    if (edgeId >= 0) {
      let best: Wire | null = null;
      for (const w of incident(edgeId)) {
        const o = nodes[other(w, edgeId)];
        if (!best || dName(o.x, o.y) < dName(nodes[other(best, edgeId)].x, nodes[other(best, edgeId)].y)) best = w;
      }
      if (best) edge = { wire: best, rev: best.a !== edgeId };
    }

    // beat 2: the wires nearest the name, each used once, outward
    const ranked = sim.wires
      .filter((w) => !edge || w !== edge.wire)
      .map((w) => {
        const da = dName(nodes[w.a].x, nodes[w.a].y);
        const db = dName(nodes[w.b].x, nodes[w.b].y);
        return { w, near: Math.min(da, db), rev: da <= db ? false : true };
      })
      .sort((p, q) => p.near - q.near)
      .slice(0, 20);
    const keys: ChainStep[] = ranked.map((r) => ({ wire: r.w, rev: r.rev }));

    // beat 4: the crossing path (DFS over the undirected wire graph)
    interface Cand { ids: number[]; score: number }
    const cands: Cand[] = [];
    let uLo = 0.3;
    let uHi = 0.7;
    const dfs = (ids: number[]) => {
      const last = ids[ids.length - 1];
      const edges = ids.length - 1;
      if (edges >= 2 && u(last) > uHi) {
        let minD = Infinity;
        for (let k = 1; k < ids.length; k++) {
          const a = nodes[ids[k - 1]];
          const b = nodes[ids[k]];
          const n = Math.max(2, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 12));
          for (let q = 0; q <= n; q++) minD = Math.min(minD, dName(a.x + ((b.x - a.x) * q) / n, a.y + ((b.y - a.y) * q) / n));
        }
        const score = (u(last) - u(ids[0])) * 100 + Math.min(minD, 200) * 0.1 - Math.abs(edges - 4) * 4 + rnd() * 2 + (minD > 70 ? 0 : -50);
        cands.push({ ids: ids.slice(), score });
      }
      if (edges >= 5) return;
      for (const w of incident(last)) {
        const o = other(w, last);
        if (ids.includes(o)) continue;
        ids.push(o);
        dfs(ids);
        ids.pop();
      }
    };
    for (const [lo, hi] of [[0.3, 0.7], [0.4, 0.6], [0.45, 0.55]]) {
      uLo = lo;
      uHi = hi;
      for (const s of nodes.filter((n) => u(n.id) < uLo && incident(n.id).length > 0)) dfs([s.id]);
      if (cands.length) break;
    }
    cands.sort((p, q) => q.score - p.score);
    let steps: ChainStep[] = [];
    let startNode = -1;
    let bud: Plan["bud"] = null;
    for (const c of cands.slice(0, 30)) {
      const endId = c.ids[c.ids.length - 1];
      const site = sim.deg(endId) < MAX_DEGREE ? this.findBudSite(sim, endId, rnd) : null;
      if (!site && steps.length) continue;
      steps = [];
      for (let k = 1; k < c.ids.length; k++) {
        const a = c.ids[k - 1];
        const b = c.ids[k];
        const w = sim.wires.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        if (w) steps.push({ wire: w, rev: w.a !== a });
      }
      startNode = c.ids[0];
      bud = site ? { parent: c.ids[c.ids.length - 1], x: site.x, y: site.y } : null;
      if (site) break;
    }

    // beat 5b: a trace between two board pads that had no wire
    let trace: Plan["trace"] = null;
    let bestScore = -1;
    const pads = nodes.filter((n) => n.board && u(n.id) < 0.55);
    for (let i = 0; i < pads.length; i++) {
      for (let j = i + 1; j < pads.length; j++) {
        const a = pads[i];
        const b = pads[j];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        const d = Math.hypot(dx, dy);
        if (d < 56 || d > 340 || dx < 20 || dy < 20) continue;
        if (sim.hasWire(a.id, b.id)) continue;
        if (sim.deg(a.id) >= MAX_DEGREE || sim.deg(b.id) >= MAX_DEGREE) continue;
        if (!segmentClear(sim.quiet, a.x, a.y, b.x, b.y, WIRE_CLEAR)) continue;
        let ok = true;
        for (const w of sim.wires) {
          if (w.a === a.id || w.a === b.id || w.b === a.id || w.b === b.id) continue;
          if (segmentsCross(a.x, a.y, b.x, b.y, nodes[w.a].x, nodes[w.a].y, nodes[w.b].x, nodes[w.b].y)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        for (const k of nodes) {
          if (k.id === a.id || k.id === b.id) continue;
          if (pointSegDist(k.x, k.y, a.x, a.y, b.x, b.y) < 16) ok = false;
        }
        if (!ok) continue;
        const v = clearVariant(sim, a.id, b.id, 2);
        if (v < 0) continue;
        const sc = Math.min(dx, dy) + rnd() * 20;
        if (sc > bestScore) {
          bestScore = sc;
          trace = { a: a.id, b: b.id, variant: v === 0 || v === 1 ? 2 + (v & 1) : v };
        }
      }
    }
    this.plan_ = { edge, keys, steps, startNode, bud, trace };
    this.events = [];
    this.keyIx = 0;
    if (edge) this.events.push({ at: T_EDGE_PULSE, fn: () => this.edgePulse(sim) });
  }

  private findBudSite(sim: Sim, parentId: number, rnd: () => number): { x: number; y: number } | null {
    const p = sim.nodes[parentId];
    const f = sim.field;
    const a0 = rnd() * Math.PI * 2;
    for (const dist of [56, 68]) {
      for (let k = 0; k < 12; k++) {
        const ang = a0 + (k * Math.PI * 2) / 12;
        const x = p.x + Math.cos(ang) * dist;
        const y = p.y + Math.sin(ang) * dist;
        if (x < 40 || y < 40 || x > sim.w - 40 || y > sim.h - 40) continue;
        if (f.uOf(x, y) < 0.62) continue;
        if (sim.quiet.some((r) => rectDist(r, x, y) < NODE_QUIET + 4)) continue;
        if (sim.nodes.some((n) => n.alive && n.id !== parentId && Math.hypot(n.x - x, n.y - y) < 46)) continue;
        let ok = true;
        for (const w of sim.wires) {
          const a = sim.nodes[w.a];
          const b = sim.nodes[w.b];
          if (pointSegDist(x, y, a.x, a.y, b.x, b.y) < 24) ok = false;
          if (w.a !== parentId && w.b !== parentId && segmentsCross(p.x, p.y, x, y, a.x, a.y, b.x, b.y)) ok = false;
        }
        if (ok) return { x, y };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ events
  /** One keystroke of the name (letters, the typo and its backspace). */
  keystroke(sim: Sim): void {
    if (!this.enabled || this.done || !this.plan_ || sim.time > 12) return;
    const keys = this.plan_.keys;
    if (!keys.length) return;
    const st = keys[this.keyIx % keys.length];
    this.keyIx++;
    this.launch(sim, [st], 0, KEY_SPEED, false, null);
  }

  typingDone(sim: Sim): void {
    if (!this.enabled || this.done || this.te >= 0 || !this.plan_) return;
    this.te = sim.time;
    const te = this.te;
    const p = this.plan_;
    const ev = (off: number, fn: () => void) => this.events.push({ at: te + off, fn });
    if (p.steps.length) ev(OFF_CROSS, () => this.crossing(sim));
    if (p.bud) ev(OFF_BUD, () => this.budCell(sim));
    if (p.trace) ev(OFF_TRACE, () => this.traceWire(sim));
    ev(OFF_RETURN, () => this.returnTrip(sim));
    ev(HARD_STOP, () => this.finish(sim));
  }

  step(sim: Sim): void {
    if (this.done) return;
    if (!this.events.length) return;
    this.events.sort((a, b) => a.at - b.at);
    while (this.events.length && this.events[0].at <= sim.time) {
      const e = this.events.shift();
      e?.fn();
    }
  }

  /** The visitor touched the graph: finish what is moving quickly, cancel the rest. */
  yield(sim: Sim): void {
    if (this.done) return;
    this.events = [];
    for (const s of sim.signals) if (s.scripted) s.speed *= 3;
    for (const w of sim.wires) if (w.grow < 1) w.growDur = 0.2;
    for (const n of sim.nodes) if (n.bud < 1) n.budDur = 0.35;
    this.end(sim);
  }

  /** End now, completing every scripted change instantly. */
  finish(sim: Sim): void {
    if (this.done) return;
    this.events = [];
    sim.signals = sim.signals.filter((s) => !s.scripted);
    for (const w of sim.wires) w.grow = 1;
    for (const n of sim.nodes) {
      if (n.bud < 1) {
        n.bud = 1;
        n.x = n.hx;
        n.y = n.hy;
      }
    }
    this.end(sim);
  }

  cancelAll(sim: Sim): void {
    this.finish(sim);
  }

  private end(sim: Sim): void {
    this.done = true;
    sim.nextAmbient = sim.time + 1.5;
  }

  // ------------------------------------------------------------------ beats
  private launch(sim: Sim, steps: ChainStep[], dur: number, speedPx: number, hero: boolean, onEnd: (() => void) | null): void {
    if (!steps.length) return;
    let speed = speedPx;
    if (dur > 0) {
      let total = 0;
      for (const s of steps) total += sim.wireLen(s.wire);
      speed = total / dur;
    }
    const first = steps[0];
    const sig = sim.pushSignal(first.wire, first.rev, false, speed);
    sig.scripted = true;
    sig.hero = hero;
    sig.chain = steps.length > 1 ? steps : null;
    sig.ci = 0;
    sig.onEnd = onEnd;
  }

  private edgePulse(sim: Sim): void {
    const e = this.plan_?.edge;
    if (!e) return;
    const n = sim.nodes[e.rev ? e.wire.b : e.wire.a];
    n.pulse = 1;
    this.launch(sim, [{ wire: e.wire, rev: e.rev }], 0, 150, false, null);
  }

  private crossing(sim: Sim): void {
    const p = this.plan_;
    if (!p) return;
    const first = p.steps[0];
    sim.nodes[first.rev ? first.wire.b : first.wire.a].pulse = 1;
    this.launch(sim, p.steps, DUR_CROSS, 0, true, null);
  }

  private autoCount(sim: Sim): number {
    let c = 0;
    for (const w of sim.wires) if (!w.user) c++;
    return c;
  }

  private budCell(sim: Sim): void {
    const p = this.plan_;
    if (!p?.bud) return;
    const parent = sim.nodes[p.bud.parent];
    if (!parent.alive || sim.deg(parent.id) >= MAX_DEGREE || this.autoCount(sim) >= sim.baseWires + BUDGET_EXTRA) return;
    const rnd = sim.rnd;
    const child = makeNode(sim.nodes.length, parent.x, parent.y, parent.field, sim.time, false, rnd, sim.w, sim.h);
    child.ic = false;
    child.swept = true;
    child.hx = p.bud.x;
    child.hy = p.bud.y;
    child.bx0 = parent.x;
    child.by0 = parent.y;
    child.bud = 0;
    child.budDur = 1.6;
    sim.pushNode(child);
    const w = makeWire(sim.nextWireId++, parent.id, child.id, sim.time, false, rnd);
    w.strength = 0.5;
    w.cubic = false;
    w.stub = false;
    w.curl = 0.14;
    sim.wires.push(w);
    this.budWire = w;
    parent.pulse = 1;
  }

  private traceWire(sim: Sim): void {
    const t = this.plan_?.trace;
    if (!t) return;
    const a = sim.nodes[t.a];
    const b = sim.nodes[t.b];
    if (!a.alive || !b.alive || sim.hasWire(t.a, t.b)) return;
    if (sim.deg(t.a) >= MAX_DEGREE || sim.deg(t.b) >= MAX_DEGREE || this.autoCount(sim) >= sim.baseWires + BUDGET_EXTRA) return;
    const w = makeWire(sim.nextWireId++, t.a, t.b, sim.time, false, sim.rnd);
    w.variant = t.variant;
    w.strength = 0.5;
    w.grow = 0;
    w.growDur = 1.4;
    sim.wires.push(w);
    a.pulse = 1;
  }

  private returnTrip(sim: Sim): void {
    const p = this.plan_;
    if (!p) return;
    const steps: ChainStep[] = [];
    if (this.budWire) steps.push({ wire: this.budWire, rev: true });
    for (let k = p.steps.length - 1; k >= 0; k--) steps.push({ wire: p.steps[k].wire, rev: !p.steps[k].rev });
    if (!steps.length) {
      this.end(sim);
      return;
    }
    const start = p.startNode >= 0 ? sim.nodes[p.startNode] : null;
    this.launch(sim, steps, DUR_RETURN, 0, true, () => {
      if (start) {
        start.glow = 1;
        start.pulse = 1;
      }
      this.end(sim);
    });
  }
}
