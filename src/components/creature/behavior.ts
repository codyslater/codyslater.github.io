import { GRID } from "./geometry";
import { bodySpan, mulberry32 } from "./generation";
import { weightedPick } from "./temperaments";
import { NEUTRAL_POSE, type Pose } from "./sprite";
import type { Grid, Rng, Temperament, TicName } from "./types";

// A living creature's free time, as a small state machine. Logic runs once per
// tick (about 12 times a second, see Stage), in stage units (one unit = one
// sprite cell), against the clock the stage hands in. The creature never
// touches the DOM: it turns a world and a pointer into a position and a pose.

type Act =
  | "idle" | "walk" | "approach" | "retreat" | "hop" | "float"
  | "look" | "sit" | "doze" | "startle" | "wake" | "held" | "fall";

export type World = {
  cell: number; // css px per unit
  w: number; // stage size in units
  h: number;
  roamL: number; // the band it keeps to by itself, in units; a held or thrown one has the whole stage
  roamR: number;
  ground: number; // y of the ground line: feet rest here
  nameL: number; // the walkable ground: the name's extent, in units
  nameR: number;
  pointer: { x: number; y: number; active: boolean; speed: number }; // units; speed px/ms
  roam: boolean; // false: stays where it is (reduced motion, zoo cells)
};

const TIC_MS: Record<TicName, number> = { jump: 350, wiggle: 400, spin: 450, tilt: 400, squash: 450 };
const BLINK_MS = 110;
const BINS = 8;
const NEAR_PX = 200;
// Unattended it is never still for long: a pause, a sit or a doze ends within this.
const STILL_MAX_MS = 3600;
const SHY_PX = 150;
// Play: a tap makes it jump and scurry; a held one dangles; a dropped one falls;
// one let go of while the pointer moves is thrown.
const POKE_HOP = { h: 4.2, T: 340, crouch: 70 }; // the jump of a tap, cells and ms
const SCURRY_CELLS: [number, number] = [6, 12]; // how far it runs after the jump
const SCURRY_MIN_PXS = 55; // and at least this fast, px/s
const FALL_G = 90; // cells/s^2
const FALL_MAX = 55; // cells/s
const THROW_MIN_SPEED = 12; // cells/s: a slower release is a plain drop
const THROW_MAX_SPEED = 140; // cells/s: a harder flick is scaled down to this
const THROW_BOUNCE = 0.55; // share of the wall-normal speed kept off the sides and the top
const THROW_BACK_SPEED = 60; // cells/s: sets how long the hop back onto the name takes
const DROP_SLIDE = 8; // cells: a drop this close to the name's end slides onto it as it falls
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

export class Creature {
  x = 0; // sprite top-left, units (floats; the pose is cut on whole cells)
  y = 0;
  act: Act = "idle";
  pose: Pose = { ...NEUTRAL_POSE };
  distance = 0; // units walked, floats or hopped, for the record
  readonly span: { left: number; right: number };

  private rng: Rng;
  private tcRng: Rng;
  private t = 0; // ms since born
  private last = 0;
  private actT = 0;
  private actDur = 1000;
  private face: -1 | 0 | 1 = 0;
  private faceUntil = 0;
  private lookUp = false;
  private stepFrame: 0 | 1 | 2 = 0;
  private lastCell = 0;
  private moveMul = 1; // glitchy gait: speed re-rolled in bursts
  private moveMulAt = 0;
  private freezeUntil = 0;
  private tx = 0; // walk target (sprite x)
  private lastMove: "walk" | "hop" | "float" = "walk";
  private landUntil = 0; // after a float: a short landing squash
  private hop = { x0: 0, y0: 0, dx: 0, h: 0, T: 0, crouch: 0 };
  private flt = { phase: 0 as 0 | 1 | 2, cx: 0, cy: 0, ax: 0, ay: 0, w1: 0, w2: 0, p1: 0, p2: 0, drift: 0, x0: 0, y0: 0, ty: 0, tx: 0 };
  private blinkAt: number;
  private blinkUntil = 0;
  private ticAt: number;
  private tic: { name: TicName; t0: number } | null = null;
  private quietSince = 0;
  private reactAt = 0;
  private startleAt = 0;
  private visited = new Array<number>(BINS).fill(0);
  private personality: { speed: number; pause: number; sway: number };
  private scurry: number | null = null; // after a tap's jump: where it runs to (sprite x)
  private hurry = false; // the current walk is a scurry
  private grip = { ox: 0, oy: 0, px: 0, py: 0 }; // held: where the pointer holds it (units), and the pointer
  private swing = 0; // held: recent sideways movement, makes it dangle
  // thrown: a ballistic flight (vx, vy in cells/s) rather than a drop; back: it is on its hop back onto the name
  private fall = { x0: 0, y0: 0, tx: 0, vy: 0, vx: 0, thrown: false, back: false };

  constructor(
    readonly seed: number,
    private grid: Grid,
    private temperament: Temperament,
    public reduced: boolean,
  ) {
    this.rng = mulberry32(seed * 9157);
    this.tcRng = mulberry32(seed * 6151);
    this.span = bodySpan(grid);
    const r = mulberry32(seed * 2749);
    // the same seed always walks the same way: a little quicker or slower, more or less patient
    this.personality = { speed: between(r, 0.88, 1.15), pause: between(r, 0.85, 1.2), sway: r() };
    this.blinkAt = this.nextBlink(0);
    this.ticAt = 150;
  }

  place(x: number, y: number, now: number) {
    this.x = x;
    this.y = y;
    this.last = now;
    this.quietSince = now;
    this.lastCell = Math.round(x);
    this.startIdle(0.6);
  }

  // ---- the plan ----------------------------------------------------------

  private recent: Partial<Record<string, number>> = {};

  // What it did lately counts against doing it again, so any 30 s shows several things.
  private freshen<T extends string>(weights: Record<T, number>): Record<T, number> {
    const out = { ...weights };
    for (const k of Object.keys(out) as T[]) {
      const at = this.recent[k];
      if (at !== undefined && this.t - at < 15000) out[k] *= 0.15;
    }
    return out;
  }

  private begin(act: Act, dur: number) {
    this.recent[act] = this.t;
    this.act = act;
    this.actT = 0;
    this.actDur = dur;
    this.hurry = false;
  }

  private startIdle(scale = 1) {
    const [lo, hi] = this.temperament.behavior.pause;
    const p = this.personality.pause;
    this.begin("idle", Math.min(STILL_MAX_MS, between(this.rng, lo, hi) * p * 1000 * scale));
  }

  private groundRange(w: World) {
    const lo = w.nameL - this.span.left;
    const hi = w.nameR - this.span.right - 1;
    return hi >= lo ? { lo, hi } : { lo: (lo + hi) / 2, hi: (lo + hi) / 2 };
  }

  // Where it goes by itself in the air: the band around the name.
  private airRange(w: World) {
    return { lo: w.roamL + 1 - this.span.left, hi: w.roamR - this.span.right - 2 };
  }

  // Where a hand can carry it and a throw can send it: the whole stage, edge to edge.
  private stageRange(w: World) {
    return { lo: 1 - this.span.left, hi: w.w - this.span.right - 2 };
  }

  private standY(w: World) {
    return w.ground - GRID;
  }

  private onGround(w: World) {
    return Math.abs(this.y - this.standY(w)) < 0.5;
  }

  // After a move comes a pause (idle, look, sit, doze); after a pause, a move.
  private next(w: World) {
    const b = this.temperament.behavior;
    const afterMove = this.act === "walk" || this.act === "hop" || this.act === "float"
      || this.act === "approach" || this.act === "retreat" || this.act === "startle";
    if (!w.roam) {
      this.startIdle();
      return;
    }
    // a curious creature with a pointer about goes to it, a shy one gets away from it,
    // rather than wandering off at random
    const P = w.pointer;
    if (P.active && this.onGround(w) && Math.abs(b.curiosity) > 0.3) {
      const dxU = P.x - (this.x + GRID / 2);
      const distPx = Math.hypot(dxU, P.y - (this.y + GRID / 2)) * w.cell;
      if (b.curiosity > 0.3 && distPx < NEAR_PX * 1.6 && Math.abs(dxU) > 5) {
        this.startWalk(w, P.x - GRID / 2 - Math.sign(dxU) * 3.5, "approach");
        return;
      }
      if (b.curiosity < -0.3 && distPx < SHY_PX * 1.5) {
        const g = this.groundRange(w);
        const far = dxU > 0 ? g.lo : g.hi;
        if (Math.abs(far - this.x) > 3) {
          this.startWalk(w, far, "retreat");
          return;
        }
      }
    }
    if (afterMove) {
      this.chooseRest(w, b);
    } else {
      this.chooseMove(w, b);
    }
  }

  private chooseRest(w: World, b: Temperament["behavior"]) {
    const weights = { idle: 2, look: b.look * 1.6, sit: b.sit, doze: 0 };
    // a long quiet spell makes dozing possible; only sleepy creatures take it quickly
    if ((this.t - this.quietSince) / 1000 > b.dozeAfter && this.onGround(w)) weights.doze = 4;
    const choice = weightedPick(this.rng, this.freshen(weights));
    const g = this.groundRange(w);
    if (choice === "look") {
      this.face = this.rng() < 0.5 ? -1 : 1;
      this.faceUntil = this.t + 3000;
      this.begin("look", between(this.rng, 1200, 2800));
    } else if (choice === "sit" && this.onGround(w)) {
      // at the ends of the name it sits facing out, like a perch
      if (this.x <= g.lo + 1) this.face = -1;
      else if (this.x >= g.hi - 1) this.face = 1;
      this.faceUntil = this.t + 6000;
      this.begin("sit", Math.min(STILL_MAX_MS, between(this.rng, 2200, 5500) * this.personality.pause));
    } else if (choice === "doze" && this.onGround(w)) {
      this.face = 0;
      this.begin("doze", between(this.rng, 2800, STILL_MAX_MS));
    } else {
      this.startIdle();
    }
  }

  private chooseMove(w: World, b: Temperament["behavior"]) {
    const grounded = this.onGround(w);
    const weights = {
      walk: grounded ? b.walk : 0,
      hop: grounded ? b.hop : 0,
      float: b.float,
    };
    // seldom the same move twice, if there is another
    if (Object.values(weights).filter((v) => v > 0).length > 1) weights[this.lastMove] *= 0.35;
    if (weights.walk + weights.hop + weights.float <= 0) {
      this.startWalk(w, this.pickWalkTarget(w), "walk");
      return;
    }
    const choice = weightedPick(this.rng, this.freshen(weights));
    if (choice === "hop") this.startHop(w);
    else if (choice === "float") this.startFloat(w);
    else this.startWalk(w, this.pickWalkTarget(w), "walk");
  }

  // Prefers the part of the ground it has spent the least time on, and now
  // and then goes all the way to an end.
  private pickWalkTarget(w: World): number {
    const g = this.groundRange(w);
    const b = this.temperament.behavior;
    if (g.hi - g.lo < 2) return g.lo;
    if (this.rng() < b.edgeLove * 0.7) return this.rng() < 0.5 ? g.lo : g.hi;
    let best = g.lo;
    let bestScore = Infinity;
    for (let i = 0; i < 5; i++) {
      const cand = between(this.rng, g.lo, g.hi);
      const dist = Math.abs(cand - this.x);
      const bin = Math.min(BINS - 1, Math.floor(((cand - g.lo) / Math.max(1, g.hi - g.lo)) * BINS));
      // unvisited ground first, and a good way off: a trip, not a shuffle
      const score = this.visited[bin] + (dist < 13 ? 1e4 : 0) - Math.min(dist, 30) * 110 + this.rng() * 400;
      if (score < bestScore) { bestScore = score; best = cand; }
    }
    return best;
  }

  private startWalk(w: World, target: number, kind: "walk" | "approach" | "retreat") {
    const g = this.groundRange(w);
    this.tx = Math.min(g.hi, Math.max(g.lo, target));
    this.face = this.tx >= this.x ? 1 : -1;
    this.faceUntil = this.t + 1e9;
    this.lookUp = false;
    this.lastMove = "walk";
    this.moveMul = 1;
    this.moveMulAt = this.t;
    this.begin(kind, 60000);
  }

  private startHop(w: World) {
    const b = this.temperament.behavior;
    const g = this.groundRange(w);
    const dir = this.rng() < 0.5 ? -1 : 1;
    let dx = dir * between(this.rng, 3, 9);
    if (this.x + dx < g.lo || this.x + dx > g.hi) dx = -dx;
    dx = Math.min(g.hi, Math.max(g.lo, this.x + dx)) - this.x;
    const h = b.hopHeight * between(this.rng, 0.7, 1.15);
    this.hop = { x0: this.x, y0: this.y, dx, h, T: 330 + h * 45, crouch: 110 };
    this.face = dx >= 0 ? 1 : -1;
    this.faceUntil = this.t + 1500;
    this.lastMove = "hop";
    this.begin("hop", this.hop.crouch + this.hop.T + 150);
  }

  private startFloat(w: World) {
    const a = this.airRange(w);
    const g = this.groundRange(w);
    const gy = this.standY(w);
    const f = this.flt;
    f.phase = 0;
    f.x0 = this.x;
    f.y0 = this.y;
    f.cy = Math.max(1, gy - between(this.rng, 6, Math.min(20, gy - 1)));
    f.cx = between(this.rng, a.lo + 4, Math.max(a.lo + 4, a.hi - 4));
    f.ax = between(this.rng, 3, 10);
    f.ay = between(this.rng, 0.8, 2.2);
    f.w1 = (Math.PI * 2) / between(this.rng, 6000, 10000);
    f.w2 = (Math.PI * 2) / between(this.rng, 3500, 6000);
    f.p1 = this.rng() * 6.28;
    f.p2 = this.rng() * 6.28;
    f.drift = between(this.rng, 4500, 8000);
    f.tx = Math.min(g.hi, Math.max(g.lo, f.cx));
    this.lastMove = "float";
    this.begin("float", 1200 + f.drift + 1400);
  }

  private startle(w: World, now: number) {
    const shy = this.temperament.behavior.curiosity < 0;
    const P = w.pointer;
    const away = this.x + GRID / 2 > P.x ? 1 : -1;
    this.hop = { x0: this.x, y0: this.y, dx: shy ? away * 2 : 0, h: 2.6, T: 300, crouch: 60 };
    this.face = shy ? (away as 1 | -1) : (P.x > this.x + GRID / 2 ? 1 : -1);
    this.faceUntil = this.t + 2500;
    this.startleAt = now + 4000;
    this.quietSince = this.t;
    this.scurry = null;
    this.begin("startle", 60 + 300 + 120);
  }

  // ---- pointer -----------------------------------------------------------

  private react(w: World) {
    if (this.act === "held" || this.act === "fall") return;
    const P = w.pointer;
    if (!w.roam || !P.active) {
      if (this.act === "look" && this.lookUp) this.lookUp = false;
      return;
    }
    const cx = this.x + GRID / 2;
    const cy = this.y + GRID / 2;
    const dxU = P.x - cx;
    const dyU = P.y - cy;
    const distPx = Math.hypot(dxU, dyU) * w.cell;
    if (distPx > NEAR_PX * 1.6) return;
    const b = this.temperament.behavior;
    const busy = this.act === "hop" || this.act === "float" || this.act === "startle" || this.act === "wake";
    const above = dyU < -3 && Math.abs(dxU) < 14;

    if (distPx < NEAR_PX && this.act === "doze") {
      this.quietSince = this.t;
      this.begin("wake", 650);
      return;
    }
    if (busy) {
      if (this.act === "float") this.face = dxU >= 0 ? 1 : -1;
      return;
    }
    if (distPx < NEAR_PX) this.quietSince = this.t;

    // a quick pointer arriving close startles a skittish creature
    if (distPx < NEAR_PX && P.speed > 1.1 && this.t > this.startleAt && this.onGround(w)
        && this.rng() < b.skittish) {
      this.startle(w, this.t);
      return;
    }
    if (distPx >= (b.curiosity > 0.3 ? NEAR_PX * 1.5 : NEAR_PX) || this.t < this.reactAt) {
      // far: just a glance, if it is standing around
      return;
    }
    this.reactAt = this.t + 650;

    let mode: "approach" | "retreat" | "look";
    if (b.curiosity > 0.3) mode = "approach";
    else if (b.curiosity < -0.3) mode = distPx < SHY_PX ? "retreat" : "look";
    else if (b.stutter > 0.5) mode = this.rng() < 0.4 ? "approach" : this.rng() < 0.5 ? "retreat" : "look";
    else mode = "look";

    const g = this.groundRange(w);
    if (mode === "approach" && Math.abs(dxU) > 5) {
      const stop = P.x - GRID / 2 - Math.sign(dxU) * 3.5;
      this.startWalk(w, stop, "approach");
      return;
    }
    if (mode === "retreat") {
      const far = dxU > 0 ? g.lo : g.hi;
      if (Math.abs(far - this.x) > 3) {
        this.startWalk(w, far, "retreat");
        return;
      }
      // cornered: it watches warily, facing the pointer
    }
    this.face = dxU >= 0 ? 1 : -1;
    this.faceUntil = this.t + 2500;
    this.lookUp = above;
    if (this.act !== "look" && this.act !== "sit") this.begin("look", between(this.rng, 1500, 3000));
    else this.actDur = Math.max(this.actDur, this.actT + 1200);
  }

  // ---- play: a tap, a pick-up, a drop --------------------------------------

  // A tap: a quick jump, then (unless motion is reduced) a short scurry away
  // from the tapped spot. `fromX` is the tap, in units. False if it is held or falling.
  poke(w: World, fromX: number): boolean {
    if (this.act === "held" || this.act === "fall") return false;
    this.tic = null;
    this.scurry = null;
    this.lookUp = false;
    this.startleAt = this.t + 4000;
    this.reactAt = this.t + 2500; // the pointer does not call it straight back
    this.quietSince = this.t;
    if (this.reduced) {
      // gentle: a blink and a one-cell hop, no scurry
      this.blinkUntil = this.t + BLINK_MS * 2.5;
      this.hop = { x0: this.x, y0: this.standY(w), dx: 0, h: 1, T: 240, crouch: 0 };
      this.faceUntil = this.t + 600;
      this.begin("startle", 240 + 140);
      return true;
    }
    if (!this.onGround(w)) {
      this.startFall(w); // startled out of the air
      return true;
    }
    const g = this.groundRange(w);
    const cx = this.x + GRID / 2;
    let dir: -1 | 1 = Math.abs(fromX - cx) < 0.5 ? (this.rng() < 0.5 ? -1 : 1) : fromX > cx ? -1 : 1;
    const dist = between(this.rng, SCURRY_CELLS[0], SCURRY_CELLS[1]);
    let to = clamp(this.x + dir * dist, g.lo, g.hi);
    if (Math.abs(to - this.x) < 3) {
      dir = dir === 1 ? -1 : 1; // no room that way
      to = clamp(this.x + dir * dist, g.lo, g.hi);
    }
    this.scurry = Math.abs(to - this.x) >= 2 ? to : null;
    this.hop = { x0: this.x, y0: this.y, dx: 0, h: POKE_HOP.h, T: POKE_HOP.T, crouch: POKE_HOP.crouch };
    this.face = dir;
    this.faceUntil = this.t + 1500;
    this.begin("startle", POKE_HOP.crouch + POKE_HOP.T + 140);
    return true;
  }

  // Picked up at (px, py), units. It hangs from the grip from then on.
  grab(w: World, px: number, py: number) {
    if (this.act === "held") return;
    this.tic = null;
    this.scurry = null;
    this.landUntil = 0;
    this.freezeUntil = 0;
    this.face = 0;
    this.lookUp = false;
    this.swing = 0;
    this.grip = { ox: clamp(px - this.x, 0, GRID), oy: clamp(py - this.y, 0, GRID), px, py };
    this.quietSince = this.t;
    this.begin("held", 1e9);
    this.holdAt(w);
  }

  moveHeld(w: World, px: number, py: number) {
    if (this.act !== "held") return;
    this.grip.px = px;
    this.grip.py = py;
    const x0 = this.x;
    this.holdAt(w);
    this.swing = this.swing * 0.5 + (this.x - x0) * 0.5;
  }

  // Held creatures stay inside the stage and above the ground line.
  private holdAt(w: World) {
    const a = this.stageRange(w);
    const g = this.grip;
    this.x = clamp(g.px - g.ox, a.lo, a.hi);
    this.y = clamp(g.py - g.oy, 0, this.standY(w));
  }

  // Let go: down to the ground line (the top of the name), landing where it fell,
  // clamped to the walkable span. If the pointer was moving (vx, vy: cells/s) it is
  // thrown instead, and true is returned. Reduced motion: it is simply there.
  release(w: World, vx = 0, vy = 0): boolean {
    if (this.act !== "held") return false;
    if (this.reduced) {
      const g = this.groundRange(w);
      this.x = clamp(this.x, g.lo, g.hi);
      this.y = this.standY(w);
      this.quietSince = this.t;
      this.startIdle(0.6);
      return false;
    }
    const speed = Math.hypot(vx, vy);
    if (!(speed >= THROW_MIN_SPEED)) {
      const g = this.groundRange(w);
      if (this.x < g.lo - DROP_SLIDE || this.x > g.hi + DROP_SLIDE) {
        // Let go far to the side of the name: straight down to the ground line, then the hop back.
        this.fall = { x0: this.x, y0: this.y, tx: this.x, vy: 0, vx: 0, thrown: true, back: false };
        this.begin("fall", 60000);
      } else this.startFall(w);
      return false;
    }
    const k = speed > THROW_MAX_SPEED ? THROW_MAX_SPEED / speed : 1;
    this.fall = { x0: this.x, y0: this.y, tx: this.x, vy: vy * k, vx: vx * k, thrown: true, back: false };
    this.begin("fall", 60000);
    return true;
  }

  private startFall(w: World) {
    const g = this.groundRange(w);
    this.fall = { x0: this.x, y0: this.y, tx: clamp(this.x, g.lo, g.hi), vy: 0, vx: 0, thrown: false, back: false };
    this.begin("fall", 60000);
  }

  // In a thrown flight: its velocity, cells/s. The stage ticks every frame while this is true.
  get flying(): boolean {
    return this.act === "fall" && this.fall.thrown;
  }

  get flightVx(): number {
    return this.fall.vx;
  }

  get flightVy(): number {
    return this.fall.vy;
  }

  // Down on the ground line at x (clamped to the walkable span by the caller): the usual landing squash.
  private land(w: World, x: number) {
    this.y = this.standY(w);
    this.x = x;
    this.landUntil = this.t + 160;
    this.quietSince = this.t;
    this.startIdle(0.6);
  }

  // One step of a thrown flight: a parabola under FALL_G, bouncing off the sides and the
  // top of the habitat. The ground line is the floor across its whole width. It lands on
  // the walkable span; if it comes down beside the name, one hop takes it back onto it.
  private stepThrown(w: World, dt: number) {
    const f = this.fall;
    const s = dt / 1000;
    const a = this.stageRange(w);
    this.x += f.vx * s;
    this.y += f.vy * s + 0.5 * FALL_G * s * s;
    f.vy += FALL_G * s;
    if (this.x < a.lo) {
      this.x = a.lo + (a.lo - this.x);
      f.vx = Math.abs(f.vx) * THROW_BOUNCE;
    } else if (this.x > a.hi) {
      this.x = a.hi - (this.x - a.hi);
      f.vx = -Math.abs(f.vx) * THROW_BOUNCE;
    }
    this.x = clamp(this.x, a.lo, a.hi);
    if (this.y < 0) {
      this.y = -this.y;
      f.vy = Math.abs(f.vy) * THROW_BOUNCE;
    }
    if (Math.abs(f.vx) > 4) {
      this.face = f.vx > 0 ? 1 : -1;
      this.faceUntil = this.t + 800;
    }
    if (f.vy > 0 && this.y >= this.standY(w)) {
      const g = this.groundRange(w);
      const tx = clamp(this.x, g.lo, g.hi);
      const gap = tx - this.x;
      if (f.back || Math.abs(gap) < 0.5) {
        this.land(w, tx);
        return;
      }
      // Came down beside the name: one hop off the ground line carries it onto the nearest end.
      const T = clamp(Math.abs(gap) / THROW_BACK_SPEED, 0.28, 0.7);
      this.y = this.standY(w);
      f.vx = gap / T;
      f.vy = (-FALL_G * T) / 2;
      f.back = true;
    }
  }

  // ---- the tick ----------------------------------------------------------

  update(now: number, w: World) {
    const dt = Math.min(200, Math.max(0, now - this.last));
    this.last = now;
    this.t += dt;
    this.actT += dt;
    const gy = this.standY(w);

    this.react(w);

    const b = this.temperament.behavior;
    const wasX = this.x;
    switch (this.act) {
      case "idle":
      case "look":
      case "sit":
      case "doze":
        this.y = gy;
        if (this.actT >= this.actDur) this.next(w);
        break;
      case "wake":
        if (this.actT >= this.actDur) this.startIdle(0.5);
        break;
      case "walk":
      case "approach":
      case "retreat": {
        this.y = gy;
        if (this.act === "approach") {
          // keep following a moving pointer
          const P = w.pointer;
          if (P.active) this.tx = Math.min(this.groundRange(w).hi, Math.max(this.groundRange(w).lo, P.x - GRID / 2 - Math.sign(P.x - (this.x + GRID / 2)) * 3.5));
        }
        let sp = (b.speed * this.personality.speed * (this.act === "retreat" ? 1.4 : 1)) / w.cell;
        if (this.hurry) sp = Math.max(sp * 1.6, SCURRY_MIN_PXS / w.cell);
        if (b.stutter > 0 && !this.hurry) {
          // glitchy gait: speed re-rolled in bursts, now and then a stop
          if (this.t >= this.moveMulAt) {
            this.moveMul = between(this.tcRng, 0.35, 1.7);
            this.moveMulAt = this.t + between(this.tcRng, 250, 700);
            if (this.tcRng() < 0.22 * b.stutter) this.freezeUntil = this.t + between(this.tcRng, 150, 450);
          }
          sp *= this.moveMul;
          if (this.t < this.freezeUntil) sp = 0;
        }
        const step = sp * (dt / 1000);
        const d = this.tx - this.x;
        if (Math.abs(d) <= step) {
          this.x = this.tx;
          this.arrive(w);
        } else {
          this.x += Math.sign(d) * step;
          this.face = d > 0 ? 1 : -1;
        }
        break;
      }
      case "hop":
      case "startle": {
        const h = this.hop;
        const t = this.actT - h.crouch;
        if (t < 0) { this.y = h.y0; break; }
        const u = Math.min(1, t / h.T);
        this.x = h.x0 + h.dx * u;
        this.y = h.y0 - h.h * 4 * u * (1 - u);
        if (this.actT >= this.actDur) {
          this.y = h.y0;
          this.x = h.x0 + h.dx;
          this.quietSince = this.act === "startle" ? this.t : this.quietSince;
          if (this.act === "startle" && this.scurry !== null) {
            // a tap's jump is followed by a quick run a short way off
            const to = this.scurry;
            this.scurry = null;
            this.startWalk(w, to, "retreat");
            this.hurry = true;
          } else {
            this.startIdle(this.act === "startle" ? 0.4 : 1);
          }
        }
        break;
      }
      case "float":
        this.stepFloat(w);
        break;
      case "held": {
        // the grip settles toward the top of the body; the pointer decides where
        const g = this.grip;
        g.ox += (GRID / 2 - g.ox) * 0.4;
        g.oy += (1 - g.oy) * 0.4;
        this.holdAt(w);
        this.swing *= 0.7;
        break;
      }
      case "fall": {
        const f = this.fall;
        if (f.thrown) {
          this.stepThrown(w, dt);
          break;
        }
        f.vy = Math.min(FALL_MAX, f.vy + (FALL_G * dt) / 1000);
        this.y += (f.vy * dt) / 1000;
        const drop = gy - f.y0;
        const u = drop > 0.01 ? clamp((this.y - f.y0) / drop, 0, 1) : 1;
        this.x = f.x0 + (f.tx - f.x0) * u; // slides over the name as it comes down
        if (this.y >= gy) this.land(w, f.tx);
        break;
      }
    }
    // a resized stage can leave it past the end of the ground
    if (this.onGround(w) && w.roam && this.act !== "float" && this.act !== "held" && this.act !== "fall") {
      const g = this.groundRange(w);
      this.x = Math.min(g.hi, Math.max(g.lo, this.x));
    }
    this.distance += Math.abs(this.x - wasX);

    // time on each part of the ground, for choosing somewhere new
    if (this.onGround(w) && this.act !== "held" && this.act !== "fall") {
      const g = this.groundRange(w);
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor(((this.x - g.lo) / Math.max(1, g.hi - g.lo)) * BINS)));
      this.visited[bin] += dt;
    }

    // facing settles back to the front after a while
    if (this.face !== 0 && this.t > this.faceUntil && this.act !== "walk" && this.act !== "approach" && this.act !== "retreat") {
      this.face = 0;
      this.lookUp = false;
    }

    this.buildPose();
  }

  private arrive(w: World) {
    const g = this.groundRange(w);
    const atEnd = this.x <= g.lo + 0.5 || this.x >= g.hi - 0.5;
    if (this.act === "approach") {
      this.begin("look", between(this.rng, 2000, 3600));
      this.lookUp = true;
      this.faceUntil = this.t + 4000;
      return;
    }
    if (this.act === "retreat") {
      this.begin("look", between(this.rng, 1500, 3000));
      this.faceUntil = this.t + 3000;
      return;
    }
    if (atEnd && this.rng() < 0.7) {
      // reached the end of the name: it stops and takes it in
      this.face = this.x <= g.lo + 0.5 ? -1 : 1;
      this.faceUntil = this.t + 4500;
      this.begin(this.rng() < 0.55 ? "sit" : "look", Math.min(STILL_MAX_MS, between(this.rng, 2200, 4200)));
      return;
    }
    this.chooseRest(w, this.temperament.behavior);
  }

  private stepFloat(w: World) {
    const f = this.flt;
    const a = this.airRange(w);
    const t = this.actT;
    const ease = (u: number) => u * u * (3 - 2 * u);
    if (t < 1200) {
      // rise from the ground to where it will drift
      const u = ease(Math.min(1, t / 1200));
      this.x = f.x0 + (f.cx - f.x0) * u;
      this.y = f.y0 + (f.cy - f.y0) * u;
    } else if (t < 1200 + f.drift) {
      const s = t - 1200;
      // fade the sway in, so the hand-off from the rise has no jump
      const k = Math.min(1, s / 800);
      this.x = f.cx + f.ax * k * Math.sin(f.p1 + f.w1 * s);
      this.y = f.cy + f.ay * k * Math.sin(f.p2 + f.w2 * s);
      this.face = Math.cos(f.p1 + f.w1 * s) >= 0 ? 1 : -1;
      this.faceUntil = this.t + 800;
      if (t >= 1200 + f.drift - 16) { f.x0 = this.x; f.y0 = this.y; }
    } else {
      const u = ease(Math.min(1, (t - 1200 - f.drift) / 1400));
      this.x = f.x0 + (f.tx - f.x0) * u;
      this.y = f.y0 + (this.standY(w) - f.y0) * u;
      if (u >= 1) {
        this.y = this.standY(w);
        this.landUntil = this.t + 160;
        this.startIdle(0.7);
      }
    }
    this.x = Math.min(a.hi, Math.max(a.lo, this.x));
  }

  // ---- overlays and pose ---------------------------------------------------

  private nextBlink(from: number) {
    // a blink every 3 to 6 s
    return from + 3000 + this.tcRng() * 3000;
  }

  private buildPose() {
    const p: Pose = { ...NEUTRAL_POSE };
    const b = this.temperament;
    const act = this.act;
    p.face = this.face;
    p.lookUp = this.lookUp;

    // blinking, kept under reduced motion
    if (this.t >= this.blinkAt) {
      this.blinkUntil = this.t + BLINK_MS;
      this.blinkAt = this.nextBlink(this.t + BLINK_MS);
    }
    if (this.t < this.blinkUntil || act === "doze") p.eyes = "shut";

    const cell = Math.round(this.x);
    if (act === "walk" || act === "approach" || act === "retreat") {
      // two-frame step: a foot lifts, then the other; one step per cell
      if (cell !== this.lastCell) this.stepFrame = this.stepFrame === 1 ? 2 : 1;
      if (this.stepFrame === 0) this.stepFrame = 1;
      p.lift = this.t < this.freezeUntil ? 0 : this.stepFrame;
    } else {
      this.stepFrame = 0;
    }
    this.lastCell = cell;

    const sit = act === "sit" || act === "doze";
    p.sit = sit;

    // breathing while it stands around: the head and shoulders sink one cell
    // and come back, on a slow loop (not under reduced motion)
    if (!this.reduced && (act === "idle" || act === "look" || act === "sit" || act === "doze")) {
      const period = 2800 * b.speed * (act === "doze" ? 1.6 : 1);
      p.bob = (this.t % period) / period > 0.55 ? 1 : 0;
    }

    if (act === "hop" || act === "startle") {
      const h = this.hop;
      const t = this.actT - h.crouch;
      if (t < 0) {
        p.sy = 0.8; p.sx = 1.15; // crouch
      } else if (t < h.T) {
        p.sy = 1.14; p.sx = 0.92; // in the air
        if (h.dx !== 0) p.lean = Math.sign(h.dx) * 0.6;
      } else if (t < h.T + 140) {
        p.sy = 0.78; p.sx = 1.18; // landing
      }
    } else if (act === "float") {
      p.sy = 1.04; p.sx = 0.97;
      p.lean = this.face * 0.5;
    } else if (act === "wake") {
      // a stretch: up, then back down
      const u = this.actT / this.actDur;
      p.sy = u < 0.5 ? 1 + 0.18 * (u * 2) : 1.18 - 0.18 * ((u - 0.5) * 2);
      p.sx = 1.1 - (p.sy - 1) * 0.8;
    } else if (act === "held") {
      // hung by the top: stretched, the legs dangling and kicking, swaying with the drag
      p.sy = 1.14; p.sx = 0.92;
      p.lean = clamp(this.swing * 0.35 + (this.reduced ? 0 : 0.35 * Math.sin(this.t / 320)), -1, 1);
      if (!this.reduced) p.lift = ((Math.floor(this.t / 240) % 2) + 1) as 1 | 2;
    } else if (act === "fall") {
      p.sy = 1.12; p.sx = 0.94;
      if (this.fall.thrown) p.lean = clamp(this.fall.vx / 80, -1, 1) * 0.6;
    }
    if (this.t < this.landUntil) { p.sy = 0.8; p.sx = 1.14; }

    // tics, only while it is standing around
    if (!this.reduced && (act === "idle" || act === "look" || act === "sit")) {
      if (!this.tic && this.t >= this.ticAt) {
        const name = weightedPick(this.tcRng, b.ticWeights);
        this.tic = { name, t0: this.t };
        const spread = b.name === "glitchy" ? 0.15 + this.tcRng() * 2.2 : 0.6 + this.tcRng() * 0.8;
        this.ticAt = this.t + Math.max(TIC_MS[name] + 600, (3000 / b.ticFrequency) * spread);
      }
    }
    if (this.tic) {
      const u = (this.t - this.tic.t0) / TIC_MS[this.tic.name];
      if (u >= 1 || !(act === "idle" || act === "look" || act === "sit")) {
        this.tic = null;
      } else {
        switch (this.tic.name) {
          case "jump": p.sy = 1.1; p.sx = 0.95; break; // the y offset is applied by the stage via ticLift
          case "wiggle": p.jx = [0, -1, 1, -1, 1, 0][Math.min(5, Math.floor(u * 6))]; break;
          case "spin": p.flip = u; break;
          case "tilt": p.lean = [0.8, 1, 0.2, -0.8, -1, 0][Math.min(5, Math.floor(u * 6))]; break;
          case "squash": p.sy = [0.82, 0.78, 1.12, 1.05, 1][Math.min(4, Math.floor(u * 5))]; p.sx = 2 - p.sy; break;
        }
      }
    }

    if (act === "doze") p.zz = ((this.t % 3600) / 3600) || 0.001;
    this.pose = p;
  }

  // The tic's hop, in whole cells: 0 unless a jump is on.
  ticLift(): number {
    if (this.tic?.name !== "jump") return 0;
    const u = (this.t - this.tic.t0) / TIC_MS.jump;
    return u > 0.15 && u < 0.75 ? 1 : 0;
  }

  get label(): Act {
    return this.act;
  }
}
