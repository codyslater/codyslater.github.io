// Shared shapes and constants for the splash field. Pure, no DOM.

import { CLUSTERS } from "@/lib/graph";

export const GRID = 16;
export const QUIET_NEAR = 6; // nothing is drawn this close to the keep-clear ellipse or the prompt
export const QUIET_RAMP = 20; // alpha ramps 0 -> 1 over this much further
export const NODE_QUIET = 44; // node centers are pushed out to here: a node (reach 14 px) is fully opaque there
export const WIRE_TEXT_NEAR = 12; // a wire never comes closer than this to the name, tagline or prompt text boxes
export const WIRE_TEXT_RAMP = 10; // and fades in over this much beyond
export const WIRE_CLEAR = WIRE_TEXT_NEAR + WIRE_TEXT_RAMP + 2; // wires plan to keep this far from a text box: full alpha, never fading in mid-air
export const MAX_SAMPLES = 40;
export const MAX_SIGNALS = 24;
export const FADE_OUT = 1.5; // seconds a removed wire takes to fade

const FIELD_COLORS: string[] = CLUSTERS.map((c) => c.color);
export const FIELD_RGB: [number, number, number][] = FIELD_COLORS.map((c) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
]);

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface QuietRect extends Rect {
  kind: "name" | "prompt";
  /** The name's keep-clear region is an ellipse (the rect is its bounding box). */
  ell?: { cx: number; cy: number; a: number; b: number; box: Rect };
  near: number;
  ramp: number;
}

export interface FNode {
  id: number;
  alive: boolean;
  user: boolean;
  dragging: boolean;
  x: number; // simulation position (continuous)
  y: number;
  hx: number; // home (rule 4 pulls back toward it)
  hy: number;
  gx: number; // snapped grid cell
  gy: number;
  sx: number; // eased snapped position
  sy: number;
  dx: number; // drawn position (updated by geometry)
  dy: number;
  t: number; // local blend at the drawn position
  field: number; // 0..4, index into FIELD_COLORS
  ic: boolean; // board look: a filled chip with pin rows instead of a square pad
  halo: boolean; // organic look: carries a faint halo at rest (about 1 in 4)
  board: boolean; // born on the board: never drifts
  pin: boolean; // holds its place (an anchor of a phone strand): never drifts, though it may sway a few px
  pad: number; // pad size px
  r: number; // cell radius px
  phX: number;
  phY: number;
  phB: number;
  swaySpeed: number;
  pulse: number; // 1 -> 0 after a fire
  lastFire: number; // sim seconds
  lastHover: number;
  lastEmit: number; // last time a signal was passed on from here
  born: number; // sim seconds
  swept: boolean;
  centerDist: number;
  glow: number; // brief pad glow (score beat 6)
  bud: number; // 0..1 while a new cell separates from its parent (score beat 5)
  budDur: number;
  bx0: number;
  by0: number;
  cascade: number; // chance a signal arriving here is passed on
  speed: number; // px/s signals leaving this node travel at
}

export interface Wire {
  id: number;
  a: number; // from node index
  b: number; // to node index
  strength: number; // 0..1
  born: number;
  dying: number; // sim seconds when the fade began, or -1
  grow: number; // 0..1: the route draws itself segment by segment (score beat 5)
  growDur: number;
  user: boolean;
  variant: number; // preferred board route 0..3
  flip: number; // +1 / -1 side the tendril bows to
  curl: number; // bow as a fraction of chord (~0.14)
  cubic: boolean;
  stub: boolean;
  strand: boolean; // a long strand from the board into a cluster (the signal's main road)
  col: number; // a phone strand runs in a side-margin column at this x ...
  colHalf: number; // ... and never leaves col +- colHalf (0: no column), sway included
  ph: number;
  // geometry, refreshed every frame by updateGeometry
  n: number;
  x: Float32Array;
  y: Float32Array;
  t: Float32Array;
  qa: Float32Array;
  u: Float32Array;
  cum: Float32Array;
  vias: Int8Array; // sample index of the first vertex of a chamfer pair, or -1
  nVias: number;
  len: number;
  tAvg: number;
  // route cache
  routeKey: number;
  stubX: number;
  stubY: number;
  stubCx: number;
  stubCy: number;
  stubT: number;
  stubQ: number;
}

export interface ChainStep {
  wire: Wire;
  rev: boolean;
}

export interface Signal {
  wire: Wire;
  progress: number; // 0..1 along the travel direction
  speed: number; // px/s
  field: number;
  user: boolean;
  rev: boolean; // travels b -> a
  scripted: boolean; // opening score: no cascade, no activity, no rule bookkeeping
  hero: boolean; // the one the eye should follow (others dim)
  chain: ChainStep[] | null;
  ci: number;
  onEnd: (() => void) | null;
}

export function makeWire(id: number, a: number, b: number, born: number, user: boolean, rnd: () => number): Wire {
  return {
    id,
    a,
    b,
    strength: 0.5,
    born,
    dying: -1,
    grow: 1,
    growDur: 1.4,
    user,
    variant: Math.floor(rnd() * 4),
    flip: rnd() < 0.5 ? -1 : 1,
    curl: 0.11 + rnd() * 0.06,
    cubic: rnd() < 0.4,
    stub: false,
    strand: false,
    col: 0,
    colHalf: 0,
    ph: rnd() * Math.PI * 2,
    n: 0,
    x: new Float32Array(MAX_SAMPLES),
    y: new Float32Array(MAX_SAMPLES),
    t: new Float32Array(MAX_SAMPLES),
    qa: new Float32Array(MAX_SAMPLES),
    u: new Float32Array(MAX_SAMPLES),
    cum: new Float32Array(MAX_SAMPLES),
    vias: new Int8Array(4).fill(-1),
    nVias: 0,
    len: 0,
    tAvg: 0,
    routeKey: -1,
    stubX: 0,
    stubY: 0,
    stubCx: 0,
    stubCy: 0,
    stubT: 0,
    stubQ: 0,
  };
}

export function makeNode(id: number, x: number, y: number, field: number, born: number, user: boolean, rnd: () => number, w: number, h: number): FNode {
  const gx = Math.round(x / GRID);
  const gy = Math.round(y / GRID);
  const cl = CLUSTERS[field];
  return {
    id,
    alive: true,
    user,
    dragging: false,
    x,
    y,
    hx: x,
    hy: y,
    gx,
    gy,
    sx: gx * GRID,
    sy: gy * GRID,
    dx: x,
    dy: y,
    t: 0,
    field,
    ic: false,
    halo: rnd() < 0.25,
    board: false,
    pin: false,
    pad: 10, // a 10 px square
    r: 4.5 + rnd() * 3,
    phX: rnd() * Math.PI * 2,
    phY: rnd() * Math.PI * 2,
    phB: rnd() * Math.PI * 2,
    swaySpeed: 0.25 + rnd() * 0.3,
    pulse: 0,
    lastFire: -10,
    lastHover: -10,
    lastEmit: -10,
    born,
    swept: false,
    centerDist: Math.hypot(x - w / 2, y - h / 2),
    glow: 0,
    bud: 1,
    budDur: 1.6,
    bx0: x,
    by0: y,
    cascade: 0.55 + cl.cascadeProb * 0.5,
    speed: 95 + cl.signalSpeed * 28,
  };
}
