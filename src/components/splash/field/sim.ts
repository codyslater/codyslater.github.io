// The splash simulation: nodes, wires, signals, the activity field, the blend field and the rules.
// Advances by elapsed time only (dt clamped to 50 ms). Pure: no DOM.

import { ActivityField } from "./activity";
import { BlendField } from "./blend";
import { generate, generateSteps, MAX_DEGREE, type Gen, type Stub } from "./generate";
import { layoutStep } from "./layout";
import { pushOut, rectDist } from "./quiet";
import { sampleWire, pickVariant } from "./route";
import { Score } from "./score";
import { BUDGET_EXTRA, USER_EXTRA, bumpStrength, decayStrengths, recordFire, resolvePending } from "./wiring";
import {
  FADE_OUT,
  GRID,
  MAX_SIGNALS,
  NODE_QUIET,
  makeNode,
  makeWire,
  type FNode,
  type QuietRect,
  type Signal,
  type Wire,
} from "./types";

const MAX_DT = 0.05;
const AMBIENT_MIN = 1.4;
const AMBIENT_MAX = 2.8;
const SNAP_HYSTERESIS = 0.75 * GRID;
// What each source leaves in the activity field (amount, kernel radius in px).
const FIRE_DEPOSIT = 1.0;
const FIRE_RADIUS = 64;
const ARRIVAL_DEPOSIT = 0.35;
const ARRIVAL_RADIUS = 56;
const POINTER_DEPOSIT = 0.2;
const POINTER_RADIUS = 52;
const POINTER_STEP = 12; // px between deposits along the pointer's path
// A signal leaves the board along a long strand at FIRST_STRAND seconds, then every STRAND_GAP to STRAND_GAP + 1 seconds.
const FIRST_STRAND = 3;
const STRAND_GAP = 2;

export class Sim {
  nodes: FNode[] = [];
  wires: Wire[] = [];
  signals: Signal[] = [];
  quiet: QuietRect[];
  /** Next time a signal is sent along a long strand from the board into a cluster. */
  nextStrand = FIRST_STRAND;
  /** Board traces that run off the screen edge. */
  stubs: Stub[] = [];
  time = 0;
  reveal = 0;
  activity: ActivityField;
  field: BlendField;
  readonly score: Score;
  /** Runtime randomness: only the sim's own firing and cascades use it. */
  rnd: () => number = Math.random;
  vx = new Float32Array(0);
  vy = new Float32Array(0);
  pairs = new Map<number, { c: number; t: number }>();
  pending: { a: number; b: number; victim: Wire } | null = null;
  lastGrow = -100;
  nextWireId = 0;
  /** Rule 2: co-firings (within 400 ms) of an unconnected pair needed before a wire grows. */
  pairThreshold = 2;
  /** Rule 2: minimum seconds between growths. */
  growCooldown = 5;
  baseWires = 0;
  baseNodes = 1;
  nextAmbient = 4;
  /** True while a scripted signal the eye should follow is travelling: the draw dims the others. */
  heroActive = false;

  constructor(public w: number, public h: number, quiet: QuietRect[], opts: { score: boolean } = { score: true }, layout?: Gen) {
    this.quiet = quiet;
    this.activity = new ActivityField(w, h);
    this.field = new BlendField(w, h);
    this.score = new Score(opts.score);
    this.build(layout);
  }

  /**
   * The same Sim as `new Sim(...)`, made a step at a time: each step is one part of the layout search, so the caller
   * can let the page paint and take input between them. Run it to the end; the value it returns is the Sim.
   */
  static *createSteps(w: number, h: number, quiet: QuietRect[], opts: { score: boolean } = { score: true }): Generator<undefined, Sim, void> {
    const layout = yield* generateSteps(w, h, quiet, new BlendField(w, h));
    return new Sim(w, h, quiet, opts, layout);
  }

  private build(layout?: Gen): void {
    const g = layout ?? generate(this.w, this.h, this.quiet, this.field);
    this.nodes = g.nodes;
    this.wires = g.wires;
    this.stubs = g.stubs;
    this.signals = [];
    this.nextWireId = g.wires.length;
    this.baseWires = g.wires.length;
    this.baseNodes = g.nodes.length;
    this.vx = new Float32Array(g.nodes.length + 64);
    this.vy = new Float32Array(g.nodes.length + 64);
    this.pairs.clear();
    this.pending = null;
    this.score.plan(this);
  }

  /** New viewport: regenerate, keeping user-added nodes (scaled, re-attached to their nearest nodes). */
  relayout(w: number, h: number, quiet: QuietRect[]): void {
    const keep = this.nodes.filter((n) => n.alive && n.user);
    const sx = w / this.w;
    const sy = h / this.h;
    this.w = w;
    this.h = h;
    this.quiet = quiet;
    this.activity = new ActivityField(w, h);
    this.field = new BlendField(w, h);
    this.field.settle();
    this.score.cancelAll(this);
    this.build();
    for (const k of keep) {
      const n = this.addNode(k.x * sx, k.y * sy, false);
      void n;
    }
  }

  setQuiet(quiet: QuietRect[]): void {
    this.quiet = quiet;
  }

  get budget(): number {
    return this.baseWires + BUDGET_EXTRA;
  }

  // ---------------------------------------------------------------- queries
  deg(i: number): number {
    let d = 0;
    for (const w of this.wires) if (w.a === i || w.b === i) d++;
    return d;
  }

  hasWire(a: number, b: number): boolean {
    for (const w of this.wires) if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) return true;
    return false;
  }

  nodeAt(x: number, y: number, radius: number): number {
    let best = -1;
    let bd = radius;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const d = Math.hypot(n.dx - x, n.dy - y);
      if (d < bd) {
        bd = d;
        best = n.id;
      }
    }
    return best;
  }

  /** Index into `wires` of the wire whose drawn route passes within maxDist of (x, y), or -1. */
  wireAt(x: number, y: number, maxDist: number): number {
    let best = -1;
    let bd = maxDist;
    for (let wi = 0; wi < this.wires.length; wi++) {
      const w = this.wires[wi];
      if (w.dying >= 0 || w.n < 2) continue;
      for (let k = 0; k < w.n - 1; k++) {
        const x0 = w.x[k];
        const y0 = w.y[k];
        const sx = w.x[k + 1] - x0;
        const sy = w.y[k + 1] - y0;
        const l2 = sx * sx + sy * sy;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * sx + (y - y0) * sy) / l2));
        const d = Math.hypot(x - (x0 + t * sx), y - (y0 + t * sy));
        if (d < bd) {
          bd = d;
          best = wi;
        }
      }
    }
    return best;
  }

  wireLen(w: Wire): number {
    if (w.len > 20) return w.len;
    const a = this.nodes[w.a];
    const b = this.nodes[w.b];
    return Math.max(30, Math.hypot(a.x - b.x, a.y - b.y) * 1.15);
  }

  // ---------------------------------------------------------------- firing
  fire(i: number, user: boolean): void {
    const n = this.nodes[i];
    if (!n || !n.alive) return;
    n.pulse = 1;
    n.lastEmit = this.time;
    this.activity.deposit(n.x, n.y, FIRE_DEPOSIT, FIRE_RADIUS);
    recordFire(this, i);
    for (const w of this.wires) {
      if (w.a !== i || w.dying >= 0) continue;
      if (this.signals.length >= MAX_SIGNALS) break;
      this.pushSignal(w, false, user);
    }
  }

  pushSignal(w: Wire, rev: boolean, user: boolean, speed?: number): Signal {
    const src = this.nodes[rev ? w.b : w.a];
    // Travel time grows slowly with length (about 1.2 s for a short wire, 1.5 s for a long one), so signals
    // that leave one node together arrive within a few hundred ms of each other: that is what rule 2 sees.
    const len = this.wireLen(w);
    const s: Signal = {
      wire: w,
      progress: 0,
      speed: speed ?? len / (1.0 + len / 600),
      field: src.field,
      user,
      rev,
      scripted: false,
      hero: false,
      chain: null,
      ci: 0,
      onEnd: null,
    };
    this.signals.push(s);
    return s;
  }

  /** Radial reveal tied to typing progress: nodes flash as the sweep passes (no signals: the score owns those). */
  sweep(reveal: number, maxDist: number): void {
    this.reveal = Math.max(this.reveal, reveal);
    const r = this.reveal * maxDist;
    for (const n of this.nodes) {
      if (!n.alive || n.swept || n.centerDist > r) continue;
      n.swept = true;
      n.pulse = Math.max(n.pulse, 0.7);
    }
  }

  // ---------------------------------------------------------------- editing
  /** Connect a -> b by the user's hand (or on contact). Respects the degree cap and the user-wire cap. */
  connect(a: number, b: number): Wire | null {
    if (a === b) return null;
    const na = this.nodes[a];
    const nb = this.nodes[b];
    if (!na?.alive || !nb?.alive || this.hasWire(a, b)) return null;
    if (this.deg(a) >= MAX_DEGREE || this.deg(b) >= MAX_DEGREE) return null;
    let userCount = 0;
    for (const w of this.wires) if (w.user) userCount++;
    if (userCount >= USER_EXTRA) return null;
    const w = makeWire(this.nextWireId++, a, b, this.time, true, this.rnd);
    const v = pickVariant(this.quiet, na.x, na.y, nb.x, nb.y, w.variant);
    if (v >= 0) w.variant = v;
    this.wires.push(w);
    return w;
  }

  addNode(x: number, y: number, fireIt = true): number {
    const o = { x, y };
    o.x = Math.max(18, Math.min(this.w - 18, x));
    o.y = Math.max(18, Math.min(this.h - 18, y));
    const p = { x: 0, y: 0 };
    pushOut(this.quiet, o.x, o.y, NODE_QUIET, p);
    const id = this.nodes.length;
    const n = makeNode(id, p.x, p.y, Math.floor(this.rnd() * 5), this.time, true, this.rnd, this.w, this.h);
    n.swept = true;
    this.pushNode(n);
    // one outgoing, one incoming, to the two nearest live nodes
    const near = this.nodes
      .filter((m) => m.alive && m.id !== id)
      .map((m) => ({ id: m.id, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .sort((a, b) => a.d - b.d);
    if (near[0]) this.connect(id, near[0].id);
    if (near[1]) this.connect(near[1].id, id);
    if (fireIt) this.fire(id, true);
    return id;
  }

  /**
   * The main road of the opening: every 2-3 s a signal leaves the board along one of the long strands and crosses
   * the melting band into a cluster (crisp steps on the board, a soft glow in the cells).
   */
  private strandSignals(): void {
    if (this.time < this.nextStrand) return;
    this.nextStrand = this.time + STRAND_GAP + this.rnd();
    const strands = this.wires.filter((w) => w.strand && w.dying < 0 && this.nodes[w.a].alive && this.nodes[w.b].alive);
    if (!strands.length || this.signals.length >= MAX_SIGNALS) return;
    // prefer one that is not already carrying a signal
    const free = strands.filter((w) => !this.signals.some((s) => s.wire === w));
    const pool = free.length ? free : strands;
    const w = pool[Math.floor(this.rnd() * pool.length)];
    const rev = this.nodes[w.a].board ? false : true; // leave the board end
    const src = this.nodes[rev ? w.b : w.a];
    src.pulse = 1;
    this.pushSignal(w, rev, false);
  }

  pushNode(n: FNode): void {
    this.nodes.push(n);
    if (this.vx.length < this.nodes.length) {
      this.vx = new Float32Array(this.nodes.length + 64);
      this.vy = new Float32Array(this.nodes.length + 64);
    }
  }

  removeNode(i: number): void {
    const n = this.nodes[i];
    if (!n || !n.alive) return;
    n.alive = false;
    for (const w of this.wires) if ((w.a === i || w.b === i) && w.dying < 0) w.dying = this.time;
    this.signals = this.signals.filter((s) => s.wire.a !== i && s.wire.b !== i);
  }

  cutWire(wi: number): void {
    const w = this.wires[wi];
    if (w && w.dying < 0) {
      w.dying = this.time;
      this.signals = this.signals.filter((s) => s.wire !== w);
    }
  }

  startDrag(i: number): void {
    this.nodes[i].dragging = true;
  }

  dragTo(i: number, x: number, y: number): void {
    const n = this.nodes[i];
    n.x = Math.max(18, Math.min(this.w - 18, x));
    n.y = Math.max(18, Math.min(this.h - 18, y));
    const p = { x: 0, y: 0 };
    pushOut(this.quiet, n.x, n.y, NODE_QUIET, p);
    n.x = p.x;
    n.y = p.y;
    // touching another node wires them
    for (const m of this.nodes) {
      if (!m.alive || m.id === i) continue;
      if (Math.hypot(m.dx - x, m.dy - y) < 25) {
        if (this.connect(i, m.id)) this.fire(i, true);
        break;
      }
    }
  }

  endDrag(i: number, x: number, y: number, moved: boolean, dropRadius: number): void {
    const n = this.nodes[i];
    n.dragging = false;
    n.hx = n.x;
    n.hy = n.y;
    if (!moved) {
      this.fire(i, true);
      return;
    }
    let target = -1;
    let best = dropRadius;
    for (const m of this.nodes) {
      if (!m.alive || m.id === i) continue;
      const d = Math.hypot(m.dx - x, m.dy - y);
      if (d < best) {
        best = d;
        target = m.id;
      }
    }
    if (target >= 0 && this.connect(i, target)) this.fire(i, true);
  }

  /** The pointer's path leaves a small deposit in the activity field (rule 1). */
  pointerMoved(x0: number, y0: number, x1: number, y1: number): void {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / POINTER_STEP));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      this.activity.deposit(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, POINTER_DEPOSIT, POINTER_RADIUS);
    }
  }

  // ---------------------------------------------------------------- stepping
  step(dtIn: number): void {
    const dt = Math.min(MAX_DT, Math.max(0, dtIn));
    if (dt === 0) return;
    this.time += dt;
    this.score.step(this);
    this.activity.step(dt);

    // nodes: snap hysteresis, eased snapped position, pulse and glow decay, budding
    const ke = 1 - Math.exp(-dt / 0.1);
    for (const n of this.nodes) {
      if (!n.alive) continue;
      if (n.bud < 1) {
        n.bud = Math.min(1, n.bud + dt / n.budDur);
        const e = n.bud * n.bud * (3 - 2 * n.bud);
        n.x = n.bx0 + (n.hx - n.bx0) * e;
        n.y = n.by0 + (n.hy - n.by0) * e;
      }
      if (Math.hypot(n.x - n.gx * GRID, n.y - n.gy * GRID) > SNAP_HYSTERESIS) this.resnap(n);
      n.sx += (n.gx * GRID - n.sx) * ke;
      n.sy += (n.gy * GRID - n.sy) * ke;
      if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - dt / 0.7);
      if (n.glow > 0) n.glow = Math.max(0, n.glow - dt / 1.4);
    }

    layoutStep(this, dt);

    // wires: draw-in, strength decay, fade-out removal
    decayStrengths(this, dt);
    let removed = false;
    for (const w of this.wires) {
      if (w.grow < 1) w.grow = Math.min(1, w.grow + dt / w.growDur);
      if (w.dying >= 0 && this.time - w.dying >= FADE_OUT) removed = true;
    }
    if (removed) {
      const gone = new Set<Wire>();
      this.wires = this.wires.filter((w) => {
        const dead = w.dying >= 0 && this.time - w.dying >= FADE_OUT;
        if (dead) gone.add(w);
        return !dead;
      });
      this.signals = this.signals.filter((s) => !gone.has(s.wire));
    }
    resolvePending(this);

    this.stepSignals(dt);
    this.strandSignals();

    if (this.score.ambientAllowed && this.time >= this.nextAmbient) {
      const cands = this.nodes.filter((n) => n.alive && this.wires.some((w) => w.a === n.id && w.dying < 0));
      // one signal starts on the board and one among the cells, so both halves stay at work
      const onBoard = cands.filter((n) => n.board);
      const cells = cands.filter((n) => !n.board);
      if (onBoard.length) this.fire(onBoard[Math.floor(this.rnd() * onBoard.length)].id, false);
      if (cells.length) this.fire(cells[Math.floor(this.rnd() * cells.length)].id, false);
      this.nextAmbient = this.time + AMBIENT_MIN + this.rnd() * (AMBIENT_MAX - AMBIENT_MIN);
    }

    this.heroActive = this.signals.some((s) => s.hero);
  }

  /** Move a pad to the nearest grid cell whose centre keeps clear of the quiet zone (a pad is drawn on its cell). */
  private resnap(n: FNode): void {
    const fx = Math.floor(n.x / GRID);
    const fy = Math.floor(n.y / GRID);
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < 4; k++) {
      const cx = fx + (k & 1);
      const cy = fy + (k >> 1);
      if (this.quiet.some((r) => rectDist(r, cx * GRID, cy * GRID) < NODE_QUIET - 1)) continue;
      const d = Math.hypot(n.x - cx * GRID, n.y - cy * GRID);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      n.gx = fx + (best & 1);
      n.gy = fy + (best >> 1);
    }
  }

  private stepSignals(dt: number): void {
    const spawned: Signal[] = [];
    const keep: Signal[] = [];
    for (const s of this.signals) {
      const w = s.wire;
      s.progress += (dt * s.speed) / this.wireLen(w);
      if (s.progress < 1) {
        keep.push(s);
        continue;
      }
      const to = this.nodes[s.rev ? w.a : w.b];
      const from = this.nodes[s.rev ? w.b : w.a];
      if (!to.alive) continue;
      to.pulse = 1;
      if (s.scripted) {
        if (s.chain && s.ci + 1 < s.chain.length) {
          const step = s.chain[s.ci + 1];
          spawned.push({ ...s, wire: step.wire, rev: step.rev, progress: 0, ci: s.ci + 1 });
        } else {
          s.onEnd?.();
        }
        continue;
      }
      this.activity.deposit(to.x, to.y, ARRIVAL_DEPOSIT, ARRIVAL_RADIUS);
      bumpStrength(w);
      recordFire(this, to.id);
      // Each other outgoing wire carries the signal on with probability ~0.45 (subcritical: chains die out;
      // siblings that both carry it arrive together, which is what rule 2 watches for).
      if (this.time - to.lastEmit > 0.3) {
        let any = false;
        for (const o of this.wires) {
          if (o.a !== to.id || o.dying >= 0 || o === w || o.b === from.id) continue;
          if (this.rnd() >= to.cascade * 0.7) continue;
          if (this.signals.length + spawned.length >= MAX_SIGNALS) break;
          spawned.push({
            wire: o,
            progress: 0,
            speed: this.wireLen(o) / (1.0 + this.wireLen(o) / 600),
            field: to.field,
            user: s.user,
            rev: false,
            scripted: false,
            hero: false,
            chain: null,
            ci: 0,
            onEnd: null,
          });
          any = true;
        }
        if (any) to.lastEmit = this.time;
      }
    }
    this.signals = keep.concat(spawned);
  }

  // ---------------------------------------------------------------- geometry
  updateField(): void {
    this.field.update(this.time, this.reveal, this.activity);
  }

  /** Drawn node positions, local blend, and every wire's sampled route for the current frame. */
  updateGeometry(still = false): void {
    const f = this.field;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const t = f.at(n.x, n.y);
      n.t = t;
      const swayX = still ? 0 : 3 * Math.sin(this.time * n.swaySpeed + n.phX) * t;
      const swayY = still ? 0 : 3 * Math.sin(this.time * n.swaySpeed * 0.8 + n.phY) * t;
      n.dx = n.sx + (n.x + swayX - n.sx) * t;
      n.dy = n.sy + (n.y + swayY - n.sy) * t;
    }
    const ctx = { field: f, quiet: this.quiet, time: this.time, still };
    for (const w of this.wires) {
      const a = this.nodes[w.a];
      const b = this.nodes[w.b];
      if (!a.alive || !b.alive) {
        w.n = 0;
        continue;
      }
      const key = a.gx * 1000003 + a.gy * 7919 + b.gx * 131 + b.gy;
      if (key !== w.routeKey) {
        w.routeKey = key;
        const v = pickVariant(this.quiet, a.sx, a.sy, b.sx, b.sy, w.variant);
        if (v >= 0) w.variant = v;
      }
      sampleWire(w, a.dx, a.dy, b.dx, b.dy, ctx);
    }
  }

  /**
   * How near two nodes must be for rule 2 to count them: ~22% of the shorter viewport side, but never less
   * than 1.4 mean node spacings (on a phone 22% is smaller than the spacing, so no pair would ever qualify).
   */
  coFireRange(): number {
    const spacing = Math.sqrt((this.w * this.h) / Math.max(1, this.baseNodes));
    return Math.max(0.22 * Math.min(this.w, this.h), 1.4 * spacing);
  }
}
