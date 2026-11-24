import { Creature, type World } from "./behavior";
import { debugHook, type StageDebug } from "./debug";
import { drawPixels, drawRemains, fitToStage } from "./engine";
import { GRID, PAD, UNITS } from "./geometry";
import { generateCreature, mulberry32 } from "./generation";
import { bodyColor, shadeGrid } from "./palette";
import { drawSprite, poseKey, posedGrid } from "./sprite";
import { BIRTHS, DEATHS } from "./styles";
import {
  REDUCED_BIRTHS, REDUCED_DEATHS, REDUCED_SPEED, RETIRED_BIRTHS, RETIRED_DEATHS, TEMPERAMENTS, deathSpeed,
  temperamentForSeed, weightedPick,
} from "./temperaments";
import type {
  BirthName, DeathName, Grid, PixelAnim, Remain, Style, StyleEnv, Temperament, TemperamentName,
} from "./types";

// The stage: one canvas, one rAF loop, one creature at a time. The creature
// lives (behavior.ts) between a birth and an ending (styles/); the stage
// owns the clock, the ground, the pointer and the hand-over between them.
// Everything runs on its own clock, advanced by the frame time (clamped), and
// stops while the page is hidden.

type StageLayout = {
  width: number; // css px
  height: number;
  cell: number; // css px per sprite cell
  dpr: number;
  nameL: number; // the walkable ground, css px from the stage's left edge
  nameR: number;
};

type StageOptions = {
  contained?: boolean; // the zoo: a fixed 24x24-unit canvas, no roaming
  reduced?: boolean;
  onBox?: (box: { x: number; y: number; w: number; h: number }) => void; // where the creature is, css px
  onDeathComplete?: () => void;
  lifespanMs?: [number, number] | null; // how long a creature lives once born; null = until it is told to die
};

// How long a creature lives on the nav screen: a random time in this range (ms).
export const LIFESPAN_MS: [number, number] = [8000, 18000];

// Each creature gets its own size, picked from its seed: a multiple of the
// layout's base cell, rounded to whole css px so the pixel art stays crisp.
const SIZE_FACTORS: [number, number][] = [[0.7, 0.1], [0.85, 0.2], [1, 0.4], [1.2, 0.2], [1.4, 0.1]]; // [factor, share]
const MIN_CELL = 4; // css px per cell, never smaller
const MAX_BODY_SHARE = 0.4; // an enlarged creature is at most this share of the name's width

function sizeFactorFor(seed: number): number {
  const u = mulberry32(seed * 6007 + 101)();
  let acc = 0;
  for (const [f, share] of SIZE_FACTORS) {
    acc += share;
    if (u < acc) return f;
  }
  return 1;
}

export type Overrides = { temperament?: TemperamentName; birth?: BirthName; death?: DeathName };

type Mode = "empty" | "birth" | "alive" | "death";
type Effect = {
  style: Style;
  name: string;
  pixels: PixelAnim[];
  t0: number;
  speed: number;
  ox: number; // sprite top-left on the stage, units
  oy: number;
  env: StyleEnv; // the room it was given: nothing is left to be cut by an edge
};

const TICK_MS = 1000 / 12; // positions and poses move at about 12 steps a second
const MAX_DT = 50;
const RESIDUE_FADE_MS = 260;
// The stage spans the screen, so a thrown creature meets the screen's own edges. By itself it
// keeps to a band this wide around the name, and births and endings use that band's sides.
const ROAM_PX = 720;
// A throw takes the pointer's velocity over the last THROW_WINDOW_MS of the drag; the
// samples kept (position and time, a ring) go back SAMPLE_KEEP_MS.
const THROW_WINDOW_MS = 80;
const SAMPLE_KEEP_MS = 200;
const SAMPLE_CAP = 128;
const FLICK_MIN_SPAN_MS = 10; // a shorter stretch than this says nothing about speed

export class Stage {
  private ctx: CanvasRenderingContext2D | null;
  private layout: StageLayout | null = null;
  private world: World;
  private mode: Mode = "empty";
  private clock = 0;
  private lastTs = 0;
  private raf = 0;
  private destroyed = false;
  private reduced: boolean;
  private contained: boolean;

  private creature: Creature | null = null;
  private grid: Grid | null = null;
  private temperament: Temperament = TEMPERAMENTS.gentle;
  private overrides: Overrides = {};
  private effect: Effect | null = null;
  private killAt: number | null = null;
  private lifeEnd: number | null = null;
  private plannedDeath: { name: DeathName; style: Style; speed: number } | null = null;
  private residue: { pts: Remain[]; t0: number } | null = null; // pts are in world cells
  private sizeFactor = 1; // this creature's size against the layout's base cell
  private ty = 0; // css px the world is shifted down so its ground row lands exactly on the name
  private lastBirth: BirthName | null = null;
  private lastDeath: DeathName | null = null;
  private lastX: number | null = null;
  private firstBirth: "edges" | null = null;
  private pendingSpawn: { seed: number; o: { overrides?: Overrides; firstBirth?: "edges" | null } } | null = null;

  private lastTick = -1e9;
  private lastKey = "";
  private lastBox = "";
  private pointer = { x: 0, y: 0, active: false, speed: 0, at: 0, type: "mouse" };
  private held = false; // picked up by a drag: its lifespan timer is paused
  private samples = new Float64Array(SAMPLE_CAP * 3); // the drag's pointer track: x, y (client px), t (ms), per sample
  private sampleHead = 0;
  private sampleN = 0;
  private box: { x: number; y: number; w: number; h: number } | null = null; // css px, from the canvas's top-left
  private dbg: StageDebug | null;

  constructor(private canvas: HTMLCanvasElement, private opts: StageOptions) {
    this.ctx = canvas.getContext("2d");
    this.reduced = !!opts.reduced;
    this.contained = !!opts.contained;
    this.dbg = debugHook();
    this.world = {
      cell: 8, w: UNITS, h: UNITS, roamL: 0, roamR: UNITS, ground: PAD + GRID, nameL: PAD, nameR: PAD + GRID,
      pointer: { x: 0, y: 0, active: false, speed: 0 }, roam: false,
    };
    if (this.contained) {
      this.setLayout({ width: UNITS * 8, height: UNITS * 8, cell: 8, dpr: 1, nameL: PAD * 8, nameR: (PAD + GRID) * 8 });
    }
    document.addEventListener("visibilitychange", this.onVisibility);
    if (!this.contained) {
      window.addEventListener("pointermove", this.onPointer, { passive: true });
      window.addEventListener("pointerdown", this.onPointer, { passive: true });
      document.documentElement.addEventListener("mouseleave", this.onLeave);
      window.addEventListener("blur", this.onLeave);
    }
    this.start();
  }

  // ---- lifecycle ---------------------------------------------------------

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pointermove", this.onPointer);
    window.removeEventListener("pointerdown", this.onPointer);
    document.documentElement.removeEventListener("mouseleave", this.onLeave);
    window.removeEventListener("blur", this.onLeave);
  }

  setReduced(reduced: boolean) {
    this.reduced = reduced;
    this.world.roam = !reduced && !this.contained;
    if (this.creature) this.creature.reduced = reduced;
  }

  setLayout(layout: StageLayout) {
    const c = this.canvas;
    const w = Math.round(layout.width * layout.dpr);
    const h = Math.round(layout.height * layout.dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.layout = layout;
    this.applyWorld();
    this.lastKey = "";
    this.paint();
    if (this.pendingSpawn) {
      const { seed, o } = this.pendingSpawn;
      this.pendingSpawn = null;
      this.spawn(seed, o);
    }
  }

  // css px per sprite cell for the current creature: the layout's base cell times
  // its own factor, whole pixels. The zoo keeps its one fixed size.
  private cellPx(): number {
    const l = this.layout!;
    const f = this.contained ? 1 : this.sizeFactor;
    if (f === 1) return l.cell;
    let k = Math.round(l.cell * f);
    if (f > 1) k = Math.min(k, Math.max(l.cell, Math.floor((MAX_BODY_SHARE * (l.nameR - l.nameL)) / GRID)));
    return Math.max(MIN_CELL, k);
  }

  // The one place the world is derived from the base layout and this creature's
  // cell. The ground row is shifted by `ty` css px so that it sits exactly on the
  // top of the name whatever the cell size; remains in the air are moved with it.
  private applyWorld() {
    const layout = this.layout;
    if (!layout) return;
    const oldK = this.world.cell;
    const oldTy = this.ty;
    const cell = this.cellPx();
    if (this.contained) {
      this.ty = 0;
      Object.assign(this.world, { cell, w: UNITS, h: UNITS, roamL: 0, roamR: UNITS, ground: PAD + GRID, nameL: PAD, nameR: PAD + GRID });
    } else {
      const h = Math.floor(layout.height / cell);
      this.ty = layout.height - h * cell;
      const w = Math.floor(layout.width / cell);
      const roamW = Math.min(w, Math.floor(ROAM_PX / cell));
      const roamL = Math.floor((w - roamW) / 2);
      Object.assign(this.world, {
        cell,
        w,
        h,
        roamL,
        roamR: roamL + roamW,
        ground: h,
        nameL: layout.nameL / cell,
        nameR: layout.nameR / cell,
        roam: !this.reduced,
      });
    }
    this.ctx?.setTransform(layout.dpr, 0, 0, layout.dpr, 0, this.ty * layout.dpr);
    if (this.lastX !== null && oldK !== cell) this.lastX = (this.lastX * oldK) / cell; // where the last one ended, in the new cells
    if (this.residue && (oldK !== cell || oldTy !== this.ty)) {
      this.residue.pts = this.residue.pts.map((p) => ({
        r: (p.r * oldK + oldTy - this.ty) / cell, c: (p.c * oldK) / cell, color: p.color,
      }));
    }
  }

  // ---- birth and ending --------------------------------------------------

  spawn(seed: number, o: { overrides?: Overrides; firstBirth?: "edges" | null } = {}) {
    if (!this.layout) {
      this.pendingSpawn = { seed, o }; // born as soon as the stage has a size
      return;
    }
    this.overrides = o.overrides ?? {};
    this.sizeFactor = this.contained ? 1 : sizeFactorFor(seed);
    this.applyWorld();
    this.lifeEnd = null;
    this.killAt = null;
    this.plannedDeath = null;
    this.effect = null;
    this.held = false;
    this.firstBirth = o.firstBirth ?? null;
    this.temperament = this.overrides.temperament
      ? TEMPERAMENTS[this.overrides.temperament]
      : temperamentForSeed(seed);
    const grid = shadeGrid(generateCreature(seed));
    this.grid = grid;
    const creature = new Creature(seed, grid, this.temperament, this.reduced);
    this.creature = creature;
    const w = this.world;
    const y = w.ground - GRID;
    const rng = mulberry32(seed * 3571);
    // near where the last one ended, not always at the middle
    const span = creature.span;
    const lo = w.nameL - span.left;
    const hi = Math.max(lo, w.nameR - span.right - 1);
    const from = this.lastX ?? lo + rng() * (hi - lo);
    // reduced motion: it does not roam, so it stands centered above the name
    const x = this.contained ? PAD
      : this.reduced ? Math.round((lo + hi) / 2)
      : Math.round(Math.min(hi, Math.max(lo, from + (rng() - 0.5) * 6)));

    const style = this.pickBirth(rng);
    const name = style.name as BirthName;
    const env = this.envFor(x, y);
    env.remains = this.remainsFor(x, y, grid, style.name === "coalesce");
    const speed = this.reduced ? REDUCED_SPEED[name] ?? 1 : Math.min(1.25, Math.max(0.8, this.temperament.speed));
    const pixels = style.init(grid, rng, this.temperament.intensity, env);
    this.effect = { style, name, pixels, t0: this.clock, speed, ox: x, oy: y, env };
    this.lastBirth = name;
    this.residueFadeIfUnused(name === "coalesce");
    this.mode = "birth";
    creature.place(x, y, this.clock);
    this.lastKey = "";
    this.emit("birth-start", { style: name, seed, expectMs: style.duration * speed, temperament: this.temperament.name });
    this.setBox(x, y);
    this.kick();
  }

  // Ask for an ending: it starts on the next frame. `overrides` can pin the ending's style.
  kill(o: { overrides?: Overrides } = {}) {
    if (o.overrides) this.overrides = { ...this.overrides, ...o.overrides };
    if (this.mode === "empty" || !this.creature) {
      this.opts.onDeathComplete?.();
      return;
    }
    if (this.mode === "death" || this.killAt !== null) return;
    const rng = mulberry32(this.creature.seed * 7919);
    const { name, style, speed } = this.pickDeath(rng);
    this.plannedDeath = { name, style, speed };
    this.killAt = this.clock;
    this.kick();
  }

  private pickBirth(rng: () => number): Style {
    const t = this.temperament;
    if (this.overrides.birth) return BIRTHS[this.overrides.birth];
    const weights = { ...t.birthWeights };
    for (const k of RETIRED_BIRTHS) weights[k] = 0;
    const haveRemains = !!this.residue && this.residue.pts.length > 0;
    if (this.reduced) {
      for (const k of Object.keys(weights) as BirthName[]) if (!REDUCED_BIRTHS.includes(k)) weights[k] = 0;
      if (REDUCED_BIRTHS.every((k) => weights[k] <= 0)) for (const k of REDUCED_BIRTHS) weights[k] = 1;
      weights.coalesce = 0;
    } else if (this.firstBirth === "edges") {
      return BIRTHS.coalesce;
    } else if (haveRemains) {
      // matter is conserved: a creature that left remains is mostly followed by one made of them
      weights.coalesce = Math.max(weights.coalesce, 1) * 5;
    }
    return BIRTHS[weightedPick(rng, weights, this.lastBirth)];
  }

  private pickDeath(rng: () => number): { name: DeathName; style: Style; speed: number } {
    const t = this.temperament;
    const forced = this.overrides.death;
    let name: DeathName;
    if (forced) {
      name = forced;
    } else {
      const weights = { ...t.deathWeights };
      for (const k of RETIRED_DEATHS) weights[k] = 0;
      if (this.reduced) {
        for (const k of Object.keys(weights) as DeathName[]) if (!REDUCED_DEATHS.includes(k)) weights[k] = 0;
        if (REDUCED_DEATHS.every((k) => weights[k] <= 0)) for (const k of REDUCED_DEATHS) weights[k] = 1;
      }
      name = weightedPick(rng, weights, this.lastDeath);
    }
    const speed = this.reduced ? REDUCED_SPEED[name] ?? 1 : deathSpeed(t.speed);
    return { name, style: DEATHS[name], speed };
  }

  private startDeath() {
    const c = this.creature;
    const g = this.grid;
    const plan = this.plannedDeath;
    if (!c || !g || !plan) return;
    this.held = false;
    const ox = Math.round(c.x);
    const oy = Math.round(c.y);
    const posed = posedGrid(g, { ...c.pose, eyes: "open", sit: false });
    const rng = mulberry32(c.seed * 7919 + 1);
    const env = this.envFor(ox, oy);
    const pixels = plan.style.init(posed, rng, this.temperament.intensity, env);
    this.effect = { style: plan.style, name: plan.name, pixels, t0: this.clock, speed: plan.speed, ox, oy, env };
    this.lastDeath = plan.name;
    this.lastX = ox;
    this.mode = "death";
    this.killAt = null;
    this.lastKey = "";
    this.emit("death-start", { style: plan.name, expectMs: plan.style.duration * plan.speed });
  }

  private endEffect() {
    const e = this.effect;
    if (!e) return;
    if (this.mode === "birth") {
      this.mode = "alive";
      this.effect = null;
      const ls = this.opts.lifespanMs;
      this.lifeEnd = ls ? this.clock + ls[0] + mulberry32((this.creature?.seed ?? 1) * 104729)() * (ls[1] - ls[0]) : null;
      this.emit("birth-end", { style: e.name });
      this.lastKey = "";
      return;
    }
    // an ending is over: whatever it left lying there waits for the next birth
    const pts = (e.style.remains?.(e.pixels) ?? []).map((p) => ({
      r: e.oy + p.r - PAD, c: e.ox + p.c - PAD, color: p.color,
    }));
    this.residue = pts.length > 0 ? { pts, t0: this.clock } : null;
    this.effect = null;
    this.creature = null;
    this.mode = "empty";
    this.emit("death-end", { style: e.name, residue: pts.length });
    this.opts.onDeathComplete?.();
  }

  // What a style is told about the place: ground, top and sides, in its own rows and columns.
  private envFor(ox: number, oy: number): StyleEnv {
    const w = this.world;
    return {
      groundR: PAD + (w.ground - oy),
      topR: PAD - oy,
      leftC: PAD + (w.roamL - ox),
      rightC: PAD + (w.roamR - ox),
      reduced: this.reduced,
      remains: [],
    };
  }

  // The last creature's leftovers, or the screen edges for a first arrival,
  // in the new sprite's own rows and columns.
  private remainsFor(ox: number, oy: number, grid: Grid, wanted: boolean): Remain[] {
    if (!wanted) return [];
    if (this.residue && this.residue.pts.length > 0 && !this.firstBirth) {
      const pts = this.residue.pts.map((p) => ({ r: p.r - oy + PAD, c: p.c - ox + PAD, color: p.color }));
      this.residue = null;
      return pts;
    }
    if (this.firstBirth === "edges") {
      // pixels entering from the left, right and top edges of the stage
      const w = this.world;
      const color = bodyColor(grid);
      const rng = mulberry32(oy * 131 + ox);
      const out: Remain[] = [];
      for (let i = 0; i < 70; i++) {
        const side = Math.floor(rng() * 3);
        const r = side === 2 ? -1 : rng() * (w.ground - 2);
        const c = side === 0 ? w.roamL - 1 : side === 1 ? w.roamR : w.roamL + rng() * (w.roamR - w.roamL);
        out.push({ r: r - oy + PAD, c: c - ox + PAD, color });
      }
      return out;
    }
    // an ending leaves nothing behind: the new body gathers from a loose ring of
    // specks about where it will stand
    const color = bodyColor(grid);
    const rng = mulberry32(oy * 977 + ox * 31);
    const out: Remain[] = [];
    const ground = this.world.ground;
    for (let i = 0; i < 64; i++) {
      const a = rng() * Math.PI * 2;
      const rad = 9 + rng() * 7;
      const r = Math.min(ground - 1, oy + 6 + Math.sin(a) * rad * 0.8);
      const c = ox + 6 + Math.cos(a) * rad * 1.3;
      out.push({ r: r - oy + PAD, c: c - ox + PAD, color });
    }
    return out;
  }

  private residueFadeIfUnused(used: boolean) {
    // remains that no birth picks up simply fade; a coalesce took them already
    if (used || !this.residue) return;
    this.residue.t0 = this.clock;
  }

  // ---- pointer -----------------------------------------------------------

  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const now = performance.now();
    const p = this.pointer;
    const dt = Math.max(1, now - p.at);
    const v = p.active ? Math.hypot(x - p.x, y - p.y) / dt : 0;
    p.speed = p.speed * 0.5 + v * 0.5;
    p.x = x;
    p.y = y;
    p.at = now;
    p.active = true;
    p.type = e.pointerType;
  };

  private onLeave = () => {
    this.pointer.active = false;
  };

  private syncPointer() {
    const p = this.pointer;
    // a finger leaves no hover behind
    if (p.active && p.type === "touch" && performance.now() - p.at > 1500) p.active = false;
    if (p.speed > 0 && performance.now() - p.at > 120) p.speed = 0;
    const cell = this.world.cell;
    const wp = this.world.pointer;
    wp.x = p.x / cell;
    wp.y = (p.y - this.ty) / cell;
    wp.active = p.active;
    wp.speed = p.speed;
  }

  // ---- play: tap, pick up, drop (called by CreatureStage's button) --------------
  // All take client (viewport) coordinates. None of it exists in the zoo.

  // Whether a press on the creature can do anything: it is alive and no ending is
  // coming. A death in progress or already planned is not interruptible.
  canPlay(): boolean {
    return !this.contained && this.mode === "alive" && !!this.creature && this.killAt === null;
  }

  private toUnits(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const k = this.world.cell;
    return { x: (clientX - r.left) / k, y: (clientY - r.top - this.ty) / k };
  }

  // A tap: startled at once. False if it could not be.
  startle(clientX: number, clientY: number): boolean {
    const c = this.creature;
    if (!this.canPlay() || this.held || !c) return false;
    const p = this.toUnits(clientX, clientY);
    if (!c.poke(this.world, p.x)) return false;
    if (this.dbg) this.dbg.play.startles++;
    this.refresh();
    return true;
  }

  // Pick it up at a point; its lifespan timer stops until it is dropped.
  grab(clientX: number, clientY: number): boolean {
    const c = this.creature;
    if (!this.canPlay() || this.held || !c) return false;
    const p = this.toUnits(clientX, clientY);
    c.grab(this.world, p.x, p.y);
    this.held = true;
    this.sampleN = 0;
    this.track(clientX, clientY, performance.now());
    if (this.dbg) this.dbg.play.drags++;
    this.refresh();
    return true;
  }

  dragTo(clientX: number, clientY: number) {
    const c = this.creature;
    if (!this.held || !c) return;
    this.track(clientX, clientY, performance.now());
    const p = this.toUnits(clientX, clientY);
    c.moveHeld(this.world, p.x, p.y);
    this.paint(); // follows the pointer between ticks
    this.syncDebug();
  }

  // Let go: a pointer still moving throws it, otherwise it drops. A cancelled gesture only drops.
  drop(canThrow = true) {
    const c = this.creature;
    if (!this.held) return;
    this.held = false;
    if (c) {
      const v = canThrow ? this.flick(performance.now()) : { x: 0, y: 0 };
      if (c.release(this.world, v.x, v.y) && this.dbg) this.dbg.play.throws++;
    }
    this.sampleN = 0;
    this.refresh();
  }

  // Keep the drag's pointer track, the last SAMPLE_KEEP_MS of it, in a fixed ring.
  private track(x: number, y: number, t: number) {
    const s = this.samples;
    let i: number;
    if (this.sampleN < SAMPLE_CAP) {
      i = (this.sampleHead + this.sampleN++) % SAMPLE_CAP;
    } else {
      i = this.sampleHead;
      this.sampleHead = (this.sampleHead + 1) % SAMPLE_CAP;
    }
    s[i * 3] = x;
    s[i * 3 + 1] = y;
    s[i * 3 + 2] = t;
    while (this.sampleN > 1 && t - s[this.sampleHead * 3 + 2] > SAMPLE_KEEP_MS) {
      this.sampleHead = (this.sampleHead + 1) % SAMPLE_CAP;
      this.sampleN--;
    }
  }

  // The pointer's velocity at `now`, in cells/s: from where it was THROW_WINDOW_MS ago (the
  // newest sample at least that old, or the oldest kept) to the newest sample, over the
  // time since then. A pointer that stopped before the release counts for less, and one
  // that stood still for the whole window counts for nothing. Moves that arrive far apart
  // (a slow device) still give a speed. Zero if the track says nothing.
  private flick(now: number): { x: number; y: number } {
    const s = this.samples;
    if (this.sampleN < 2) return { x: 0, y: 0 };
    let first = this.sampleHead;
    for (let n = 1; n < this.sampleN; n++) {
      const i = (this.sampleHead + n) % SAMPLE_CAP;
      if (s[i * 3 + 2] > now - THROW_WINDOW_MS) break;
      first = i;
    }
    const last = (this.sampleHead + this.sampleN - 1) % SAMPLE_CAP;
    const span = now - s[first * 3 + 2];
    if (span < FLICK_MIN_SPAN_MS) return { x: 0, y: 0 };
    const k = 1000 / span / this.world.cell;
    return { x: (s[last * 3] - s[first * 3]) * k, y: (s[last * 3 + 1] - s[first * 3 + 1]) * k };
  }

  // Take a step of its life now rather than at the next tick, so a press shows at once.
  private refresh() {
    if (this.creature && this.mode === "alive") {
      this.lastTick = this.clock;
      this.creature.update(this.clock, this.world);
      this.lastKey = "";
      this.paint();
      this.kick();
    }
    this.syncDebug();
  }

  // ---- the loop ----------------------------------------------------------

  private onVisibility = () => {
    if (document.hidden) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.start();
    }
  };

  private start() {
    if (this.destroyed || this.raf || document.hidden) return;
    this.lastTs = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private kick() {
    this.start();
  }

  private frame = (ts: number) => {
    this.raf = 0;
    if (this.destroyed || document.hidden) return;
    const t0 = this.dbg ? performance.now() : 0;
    const dt = this.lastTs ? Math.min(MAX_DT, ts - this.lastTs) : 0;
    this.lastTs = ts;
    this.clock += dt;
    this.step(dt);
    if (this.dbg) this.recordFrame(performance.now() - t0);
    if (!this.destroyed) this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt = 0) {
    const ctx = this.ctx;
    const layout = this.layout;
    if (!ctx || !layout) return;
    const k = this.world.cell;

    if (this.mode === "birth" || this.mode === "death") {
      const e = this.effect;
      if (!e) return;
      const elapsed = (this.clock - e.t0) / e.speed;
      const running = e.style.step(e.pixels, elapsed);
      fitToStage(e.pixels, e.env);
      this.clear();
      this.drawResidue(ctx);
      drawPixels(ctx, e.pixels, e.ox, e.oy, k, this.world.ground * k);
      if (!running || elapsed >= e.style.duration * 1.05) this.endEffect();
      this.syncDebug();
      return;
    }

    if (this.mode === "alive" && this.creature && this.grid) {
      const flying = this.creature.flying;
      if ((this.held || flying) && this.lifeEnd !== null) this.lifeEnd += dt; // never dies in a hand, or in a throw
      if (this.lifeEnd !== null && this.clock >= this.lifeEnd && this.killAt === null) {
        this.lifeEnd = null;
        this.kill();
      }
      if (this.killAt !== null && this.clock >= this.killAt) {
        this.startDeath();
        return;
      }
      if (flying || this.clock - this.lastTick >= TICK_MS) { // a flight steps every frame, not at the 12 Hz tick
        this.lastTick = this.clock;
        this.syncPointer();
        this.creature.update(this.clock, this.world);
        this.paint();
      }
    }

    if (this.mode === "empty" && this.residue) {
      const a = 1 - (this.clock - this.residue.t0) / RESIDUE_FADE_MS;
      if (a <= 0) {
        this.residue = null;
        this.clear();
      } else {
        this.clear();
        drawRemains(ctx, this.residue.pts, a * 0.8, k);
      }
    }
    this.syncDebug();
  }

  // Draw the living creature if it would look different from what is there.
  private paint() {
    const ctx = this.ctx;
    const c = this.creature;
    const g = this.grid;
    const layout = this.layout;
    if (!ctx || !layout) return;
    if (this.mode !== "alive" || !c || !g) {
      if (this.mode === "empty") this.clear();
      return;
    }
    const k = this.world.cell;
    const x = Math.round(c.x);
    const y = Math.round(c.y) - c.ticLift();
    const key = poseKey(c.pose, x, y, k) + (this.residue ? "r" : "");
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.clear();
    this.drawResidue(ctx);
    drawSprite(ctx, g, c.pose, x * k, y * k, k);
    this.setBox(x, y);
  }

  private drawResidue(ctx: CanvasRenderingContext2D) {
    const r = this.residue;
    if (!r) return;
    const a = 1 - (this.clock - r.t0) / RESIDUE_FADE_MS;
    if (a <= 0) {
      this.residue = null;
      return;
    }
    drawRemains(ctx, r.pts, a * 0.8, this.world.cell);
  }

  private clear() {
    const l = this.layout;
    if (l) this.ctx?.clearRect(0, -this.ty, l.width, l.height); // the world is drawn shifted down by ty
  }

  private setBox(x: number, y: number) {
    const k = this.world.cell;
    this.box = { x: x * k, y: y * k + this.ty, w: GRID * k, h: GRID * k };
    const key = `${x}|${y}|${k}|${this.ty}`;
    if (key === this.lastBox) return;
    this.lastBox = key;
    this.opts.onBox?.({ ...this.box });
  }

  // ---- debug hook (see debug.ts) -----------------------------------------

  private emit(type: string, data: Record<string, unknown>) {
    this.dbg?.log.push({ type, t: performance.now(), ...data });
  }

  private syncDebug() {
    const d = this.dbg;
    if (!d) return;
    const c = this.creature;
    d.state = {
      mode: this.mode,
      act: this.mode === "alive" ? c?.act : this.effect?.name ?? null,
      x: c?.x, y: c?.y, seed: c?.seed, spanL: c?.span.left, spanR: c?.span.right,
      temperament: this.temperament.name,
      distance: c?.distance ?? 0,
      reduced: this.reduced,
      cell: this.world.cell,
      worldW: this.world.w, worldH: this.world.h,
      nameL: this.world.nameL, nameR: this.world.nameR,
      killAt: this.killAt,
    };
    const p = d.play; // the counters are kept by the callers; the rest is read off here
    p.state = this.mode === "alive" ? c?.act ?? null : this.effect?.name ?? null;
    p.held = this.held;
    const k = this.world.cell;
    p.v = this.mode === "alive" && c?.flying ? { x: c.flightVx * k, y: c.flightVy * k } : null;
    p.box = this.box ? { ...this.box } : null;
    if (this.box) {
      const r = this.canvas.getBoundingClientRect();
      p.client = { x: r.left + this.box.x, y: r.top + this.box.y, w: this.box.w, h: this.box.h };
    } else {
      p.client = null;
    }
  }

  private recordFrame(ms: number) {
    const f = this.dbg!.frames;
    f.n++;
    f.sumMs += ms;
    if (ms > f.maxMs) f.maxMs = ms;
    if (f.samples.length < 20000) f.samples.push(ms);
  }
}
