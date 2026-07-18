export type Rng = () => number;

export type Trait = "legs" | "arms" | "lift" | "dig";

// Per-color multipliers rolled once per epoch (~0.7–1.4). Every soup has
// different color personalities; abiogenesis re-rolls them.
export type ColorProfile = {
  weight: number; // gravity & terminal-velocity scaling
  bounciness: number; // restitution scaling
  stickiness: number; // bond chance + capture radius scaling
  volatility: number; // sedimentation scaling
  fertility: number; // nucleation + budding scaling
  aggression: number; // combat knock-off scaling
  mutationWeights: Record<Trait, number>; // trait odds skew
};

export type FreePixel = {
  x: number; // cell units, float
  y: number;
  vx: number; // cells/sec
  vy: number;
  color: number; // 0-4 index into COLORS
  streak: number; // seconds of emission-trail remaining (0 = none)
};

// Inert dead matter: a corpse block that sinks, then either buries into the
// substrate (becomes ore) or crumbles back into a soup pixel where it rests.
// Never interacts chemically — it is out of the living cycle until then.
export type Detritus = {
  x: number;
  y: number;
  vy: number;
  color: number;
};

// Rigid lattice body. Local integer cells keyed via cellKey(r, c); world
// position of local (0,0) is the float anchor (x, y).
export type Cluster = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  cells: Map<number, number>; // cellKey -> color index (EYE for eyes)
  dominant: number; // most common body color index
  axis2: number; // 2 × mean occupied column; mirror of c is (axis2 - c)
  minR: number; // local bounds, recomputed on any cells change
  maxR: number;
  minC: number;
  maxC: number;
  age: number; // sim seconds alive
  hunger: number; // sim seconds since last capture
  traits: Set<Trait>;
  sticky: Set<number>; // mirror-growth slots (local cell keys)
  pending: { trait: Trait; slots: Set<number> } | null; // mutation growing in
  walkDir: number; // -1 | 1, legs wandering
  formed: boolean; // cached formed-predicate result
  blinkTimer: number; // seconds until next blink
  blinking: number; // seconds remaining of current blink
  mateCooldown: number; // seconds until this body can mate again
  digging: boolean; // on a dig trip (ignores the ground floor, mines ore)
  digTimer: number; // seconds left before a digging miner seeks the surface
  digVein: number; // index into World.veins of this trip's one target pocket (-1 = searching)
  digLuck: number; // 0..1 rolled at birth; hashes which ore pockets this monster can ever grab
  perchTimer: number; // s remaining of a flyer's ground visit (lift suspended while > 0)
  perchX: number; // chosen landing column while descending (-1 = none); food-weighted
  gaitBias: number; // 0 strider → 1 hopper; legged gait personality, loosely heritable
};

export type World = {
  rng: Rng;
  uid: number; // per-world identity, so the render cache never bleeds across worlds
  width: number; // cells
  height: number;
  groundLevel: number; // first underground row; [0,groundLevel) is the surface column
  pixels: FreePixel[];
  clusters: Cluster[];
  detritus: Detritus[]; // sinking corpses
  substrate: Map<number, number>; // cellKey -> ROCK (scenery) | 0-4 (mineable ore)
  substrateVersion: number; // bumped only on a full substrate regen, for render cache invalidation
  substrateDirty: number[]; // cell keys changed since last render, for incremental cache patching
  reserve: number; // deep pool of percolated/metabolized matter awaiting vein regrowth
  fossil: number; // sequestered strata (plus FOSSIL cells); out of circulation until upheaval
  veins: { cells: number[]; color: number }[]; // ore pocket footprints; each regrows its own color
  regrow: Map<number, number>; // dug cell → sim time it heals back to rock
  births: { id: number; time: number }[]; // recently divided children, for the render-side body pulse
  matter: number; // conserved total: pixels + body cells + ore/fossil + detritus + reserve + fossil pool
  oreBaseline: number; // ore cells in the freshly generated substrate; dig-mutation pressure reference
  profiles: ColorProfile[]; // length 5, index = color
  affinity: number[][]; // 5×5, [-1..1]; affinity[a][b] = force a feels toward b
  time: number; // sim seconds
  emptySince: number | null; // sim time life went extinct, for abiogenesis
  lifelessSince: number | null; // sim time the last cluster vanished; watchdog for soft-lock
  nextClusterId: number;
  epoch: number;
};
