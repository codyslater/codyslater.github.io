import * as R from "./rules";
import type { SpatialHash } from "./spatialHash";
import type { Cluster, Trait, World } from "./types";

const scratch: number[] = [];

// A species moves one way: walk/hop, fly, or burrow — never several. Arms
// stay a combinable utility, so a body carries at most two traits.
const LOCOMOTION: readonly Trait[] = ["legs", "lift", "dig"];

function hasLocomotion(cl: Cluster): boolean {
  for (const t of LOCOMOTION) if (cl.traits.has(t)) return true;
  return cl.pending !== null && LOCOMOTION.includes(cl.pending.trait);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// A growth slot may only fill while it touches the body — limbs and mirror
// repairs build root-outward. Shared by capture targeting, the mirror pull,
// and the pending-limb expiry test.
function slotAnchored(cl: Cluster, k: number): boolean {
  const r = R.keyR(k), c = R.keyC(k);
  return (
    cl.cells.has(R.cellKey(r - 1, c)) || cl.cells.has(R.cellKey(r + 1, c)) ||
    cl.cells.has(R.cellKey(r, c - 1)) || cl.cells.has(R.cellKey(r, c + 1))
  );
}

// --- lattice helpers -------------------------------------------------------

export function recomputeMeta(cl: Cluster) {
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  let sumC = 0;
  const counts = [0, 0, 0, 0, 0];
  for (const [k, color] of cl.cells) {
    const r = R.keyR(k);
    const c = R.keyC(k);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    sumC += c;
    if (color !== R.EYE) counts[color]++;
  }
  cl.minR = minR; cl.maxR = maxR; cl.minC = minC; cl.maxC = maxC;
  cl.axis2 = Math.round((2 * sumC) / cl.cells.size);
  let best = cl.dominant, bestN = -1;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > bestN) { bestN = counts[i]; best = i; }
  }
  cl.dominant = best;
  // Rebuild sticky slots from actual asymmetry under the CURRENT axis —
  // prunes slots staled by axis drift and gives merge-grown bodies repair
  // targets they otherwise never get.
  cl.sticky.clear();
  for (const [k] of cl.cells) {
    const mk = R.cellKey(R.keyR(k), cl.axis2 - R.keyC(k));
    if (!cl.cells.has(mk)) cl.sticky.add(mk);
  }
}

export function addCell(cl: Cluster, r: number, c: number, color: number) {
  cl.cells.set(R.cellKey(r, c), color);
  recomputeMeta(cl); // sticky bookkeeping rebuilt there
}

export function removeCell(cl: Cluster, k: number) {
  cl.cells.delete(k);
  if (cl.cells.size > 0) recomputeMeta(cl);
}

// Fraction of cells whose mirror across the vertical axis is occupied.
export function symmetryScore(cl: Cluster): number {
  if (cl.cells.size === 0) return 0;
  let ok = 0;
  for (const [k] of cl.cells) {
    const r = R.keyR(k), c = R.keyC(k);
    if (cl.cells.has(R.cellKey(r, cl.axis2 - c))) ok++;
  }
  return ok / cl.cells.size;
}

// Fraction of non-eye cells matching the dominant color.
export function monoFraction(cl: Cluster): number {
  let body = 0, dom = 0;
  for (const [, color] of cl.cells) {
    if (color === R.EYE) continue;
    body++;
    if (color === cl.dominant) dom++;
  }
  return body === 0 ? 0 : dom / body;
}

// Minority cells surrounded by the dominant color convert — bodies trend
// monochrome, like the species.
function assimilate(w: World, cl: Cluster, dt: number) {
  let changed = false;
  for (const [k, color] of cl.cells) {
    if (color === cl.dominant || color === R.EYE) continue;
    const r = R.keyR(k), c = R.keyC(k);
    let domN = 0;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      if (cl.cells.get(R.cellKey(r + dr, c + dc)) === cl.dominant) domN++;
    }
    if (domN >= 3 && w.rng() < R.ASSIMILATE_RATE * dt) {
      cl.cells.set(k, cl.dominant);
      changed = true;
    }
  }
  if (changed) recomputeMeta(cl);
}

// Sticky mirror slots actively attract the nearest matching free pixel —
// asymmetry fills itself in; bilateral symmetry emerges.
function mirrorPull(w: World, hash: SpatialHash, cl: Cluster, dt: number) {
  for (const k of cl.sticky) {
    if (cl.cells.has(k)) { cl.sticky.delete(k); continue; }
    if (!slotAnchored(cl, k)) continue; // capture can't fill it: don't lure food to a dead point
    if (w.rng() >= R.STICKY_PULL_RATE * dt) continue;
    const sx = cl.x + R.keyC(k);
    const sy = cl.y + R.keyR(k);
    hash.neighbors(sx, sy, scratch);
    let best = -1, bestD = R.STICKY_PULL_RADIUS * R.STICKY_PULL_RADIUS;
    for (const i of scratch) {
      if (i >= w.pixels.length) continue;
      const p = w.pixels[i];
      if (p.color !== cl.dominant) continue;
      const dx = sx - p.x, dy = sy - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best === -1) continue;
    const p = w.pixels[best];
    const d = Math.sqrt(bestD) || 1;
    p.vx += ((sx - p.x) / d) * R.STICKY_PULL_ACCEL * dt;
    p.vy += ((sy - p.y) / d) * R.STICKY_PULL_ACCEL * dt;
  }
}

// Enclosed cells in the upper third whiten into a mirrored 2×1 eye pair.
function formEyes(w: World, cl: Cluster, dt: number) {
  if (cl.cells.size < R.EYE_MIN_SIZE) return;
  for (const [, color] of cl.cells) if (color === R.EYE) return; // has eyes
  if (w.rng() >= R.EYE_CHECK_RATE * dt) return;

  const upperLimit = cl.minR + Math.ceil((cl.maxR - cl.minR + 1) / 3);
  const enclosed = (r: number, c: number) =>
    cl.cells.has(R.cellKey(r, c)) &&
    cl.cells.get(R.cellKey(r, c)) !== R.EYE &&
    cl.cells.has(R.cellKey(r - 1, c)) && cl.cells.has(R.cellKey(r + 1, c)) &&
    cl.cells.has(R.cellKey(r, c - 1)) && cl.cells.has(R.cellKey(r, c + 1));

  for (const [k] of cl.cells) {
    const r = R.keyR(k), c = R.keyC(k);
    if (r > upperLimit) continue;
    const mc = cl.axis2 - c;
    if (mc === c) continue; // needs a distinct mirror column
    if (enclosed(r, c) && enclosed(r + 1, c) && enclosed(r, mc) && enclosed(r + 1, mc)) {
      cl.cells.set(R.cellKey(r, c), R.EYE);
      cl.cells.set(R.cellKey(r + 1, c), R.EYE);
      cl.cells.set(R.cellKey(r, mc), R.EYE);
      cl.cells.set(R.cellKey(r + 1, mc), R.EYE);
      recomputeMeta(cl);
      return;
    }
  }
}

// A removal can cut the lattice at a bridge cell: the largest connected
// component stays the body; every orphaned fragment tears off and scatters
// back into the soup (matter conserved). Without this, severed chunks float
// alongside the body in rigid formation, visibly disconnected.
export function shedFragments(w: World, cl: Cluster) {
  if (cl.cells.size === 0) return;
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const [start] of cl.cells) {
    if (seen.has(start)) continue;
    const comp: number[] = [start];
    seen.add(start);
    for (let i = 0; i < comp.length; i++) {
      const r = R.keyR(comp[i]), c = R.keyC(comp[i]);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nk = R.cellKey(r + dr, c + dc);
        if (cl.cells.has(nk) && !seen.has(nk)) { seen.add(nk); comp.push(nk); }
      }
    }
    comps.push(comp);
  }
  if (comps.length <= 1) return;
  comps.sort((a, b) => b.length - a.length);
  const dom = cl.dominant;
  for (let ci = 1; ci < comps.length; ci++) {
    for (const k of comps[ci]) {
      const color = cl.cells.get(k)!;
      cl.cells.delete(k);
      w.pixels.push({
        x: cl.x + R.keyC(k),
        y: cl.y + R.keyR(k),
        vx: (w.rng() - 0.5) * R.SHED_POP,
        vy: -w.rng() * R.SHED_POP,
        color: color === R.EYE ? dom : color,
        streak: 0,
      });
    }
  }
  recomputeMeta(cl);
}

export function popPixel(w: World, cl: Cluster, k: number, burst: number, sweep = true) {
  const color = cl.cells.get(k);
  if (color === undefined) return;
  const dom = cl.dominant; // capture before removeCell can shift it
  removeCell(cl, k);
  w.pixels.push({
    x: cl.x + R.keyC(k),
    y: cl.y + R.keyR(k),
    vx: (w.rng() - 0.5) * 2 * burst,
    vy: -w.rng() * burst,
    color: color === R.EYE ? dom : color, // eyes return as body matter
    streak: 0,
  });
  // the pop may have severed a bridge cell; batch callers that pop in a
  // loop pass sweep=false and run shedFragments once afterwards
  if (sweep) shedFragments(w, cl);
}

// The payoff predicate. Nothing announces it — the creature just comes
// alive (blink, breathe, wander, hover).
export function isFormed(cl: Cluster, held = false): boolean {
  // Hysteresis: once formed, thresholds relax so noisy growth at the
  // boundary doesn't stutter the creature's idle life on and off.
  const relax = held ? R.FORMED_HYSTERESIS : 1;
  let eyes = false;
  for (const [, color] of cl.cells) {
    if (color === R.EYE) { eyes = true; break; }
  }
  return (
    eyes &&
    cl.cells.size >= R.FORMED_MIN_SIZE * relax &&
    monoFraction(cl) >= R.FORMED_MONO * relax &&
    symmetryScore(cl) >= R.FORMED_SYMMETRY * relax
  );
}

// Torpor: a starved formed body at its floor conserves itself — no burning,
// no budding, half-pace wandering — until it feeds again (hunger resets).
function isTorpid(cl: Cluster): boolean {
  return (
    cl.formed &&
    cl.hunger > R.HUNGER_SHED_AFTER &&
    cl.cells.size <= R.FORMED_MIN_SIZE + R.BUD_SIZE
  );
}

function idleLife(w: World, cl: Cluster, dt: number) {
  cl.formed = isFormed(cl, cl.formed);
  if (!cl.formed) { cl.blinking = 0; return; }
  if (cl.blinking > 0) {
    cl.blinking -= dt;
  } else {
    cl.blinkTimer -= dt;
    if (cl.blinkTimer <= 0) {
      cl.blinking = R.BLINK_LEN;
      cl.blinkTimer = R.BLINK_MIN_GAP + w.rng() * (R.BLINK_MAX_GAP - R.BLINK_MIN_GAP);
    }
  }
}

// Fresh cluster with every per-creature default rolled; spawn sites override
// only what their context defines (color, inheritance, cooldowns, motion).
function newCluster(w: World, x: number, y: number, vx: number, vy: number): Cluster {
  return {
    id: w.nextClusterId++,
    x, y, vx, vy,
    cells: new Map(), dominant: 0, axis2: 0,
    minR: 0, maxR: 0, minC: 0, maxC: 0,
    age: 0, hunger: 0,
    traits: new Set(), sticky: new Set(), pending: null,
    walkDir: w.rng() < 0.5 ? -1 : 1,
    formed: false, blinkTimer: 0, blinking: 0,
    mateCooldown: 0, digging: false, digTimer: 0, digVein: -1,
    digLuck: w.rng(), perchTimer: 0, perchX: -1,
    gaitBias: w.rng(),
  };
}

// Register a division for the render-side birth pulse (the newborn's body
// briefly flashes a shade lighter).
function recordBirth(w: World, child: Cluster) {
  w.births.push({ id: child.id, time: w.time });
}

// A formed creature flings off a small chunk of itself: a child cluster.
function bud(w: World, cl: Cluster, dt: number) {
  // Only surplus mass is spent on reproduction — budding at the formed
  // minimum would immediately unform the parent.
  if (!cl.formed || cl.cells.size < R.FORMED_MIN_SIZE + R.BUD_SIZE) return;
  if (isTorpid(cl)) return;
  const prof = w.profiles[cl.dominant];
  if (w.rng() >= R.BUD_RATE * prof.fertility * dt) return;

  // take BUD_SIZE edge cells off the parent
  let taken = 0;
  while (taken < R.BUD_SIZE) {
    const edges = edgeKeys(cl);
    if (edges.length === 0) break;
    removeCell(cl, edges[Math.floor(w.rng() * edges.length)]);
    taken++;
  }
  shedFragments(w, cl); // strip-mining edges may have severed a bridge
  if (taken === 0) return;

  // child: compact block of the parent's color, flung sideways
  const dir = w.rng() < 0.5 ? -1 : 1;
  const child = newCluster(
    w,
    cl.x + (dir < 0 ? cl.minC - 4 : cl.maxC + 2),
    cl.y + cl.minR,
    dir * (20 + w.rng() * 15),
    -(10 + w.rng() * 10),
  );
  child.dominant = cl.dominant;
  child.walkDir = dir;
  child.gaitBias = clamp01(cl.gaitBias + (w.rng() - 0.5) * R.GAIT_BIAS_NOISE);
  for (let i = 0; i < taken; i++) {
    child.cells.set(R.cellKey(Math.floor(i / 2), i % 2), cl.dominant);
  }
  recomputeMeta(child);
  w.clusters.push(child);
  recordBirth(w, child);
}

// Mitosis: a well-fed formed body past ~2× the formed floor splits in two.
// The child takes half the cells as a compact same-color block, inherits
// every trait, and walks off — one visibly becomes two of the same kind.
function fission(w: World, cl: Cluster, dt: number) {
  if (!cl.formed || cl.digging) return;
  if (cl.cells.size < R.FORMED_MIN_SIZE * R.FISSION_SIZE_MULT) return;
  if (w.rng() >= R.FISSION_RATE * dt) return;
  const half = Math.floor(cl.cells.size / 2);
  let taken = 0;
  while (taken < half) {
    const edges = edgeKeys(cl);
    if (edges.length === 0) break;
    removeCell(cl, edges[Math.floor(w.rng() * edges.length)]);
    taken++;
  }
  shedFragments(w, cl); // the halving may have severed a bridge
  if (taken < R.DISSOLVE_BELOW) return;
  const dir = w.rng() < 0.5 ? -1 : 1;
  const cols = Math.max(2, Math.round(Math.sqrt(taken) * 1.2));
  const child = newCluster(
    w,
    cl.x + (dir < 0 ? cl.minC - cols - 2 : cl.maxC + 3),
    cl.y + cl.minR,
    dir * (14 + w.rng() * 10),
    -(6 + w.rng() * 8),
  );
  child.dominant = cl.dominant;
  child.traits = new Set(cl.traits); // mitosis: the child is its parent's kind
  child.walkDir = dir;
  child.mateCooldown = R.MATE_COOLDOWN;
  child.gaitBias = clamp01(cl.gaitBias + (w.rng() - 0.5) * R.GAIT_BIAS_NOISE);
  for (let i = 0; i < taken; i++) {
    child.cells.set(R.cellKey(Math.floor(i / cols), i % cols), cl.dominant);
  }
  recomputeMeta(child);
  w.clusters.push(child);
  recordBirth(w, child);
  cl.hunger = 0; // splitting is the payoff of being well-fed
  cl.mateCooldown = R.MATE_COOLDOWN;
}

function edgeKeys(cl: Cluster): number[] {
  const out: number[] = [];
  for (const [k, color] of cl.cells) {
    if (color === R.EYE) continue;
    const r = R.keyR(k), c = R.keyC(k);
    if (
      !cl.cells.has(R.cellKey(r - 1, c)) || !cl.cells.has(R.cellKey(r + 1, c)) ||
      !cl.cells.has(R.cellKey(r, c - 1)) || !cl.cells.has(R.cellKey(r, c + 1))
    ) out.push(k);
  }
  return out;
}

// --- physics ----------------------------------------------------------------

// Land where the food is: a uniform reservoir draw over the flyer's own
// food color makes dense patches proportionally likelier targets. A world
// with none of its color anywhere: land anywhere at all.
function pickLandingX(w: World, cl: Cluster): number {
  let pick = -1;
  let seen = 0;
  for (const p of w.pixels) {
    if (p.color !== cl.dominant) continue;
    seen++;
    if (w.rng() < 1 / seen) pick = p.x;
  }
  return pick >= 0 ? pick : w.rng() * w.width;
}

function stepClusterPhysics(w: World, cl: Cluster, dt: number) {
  const mass = cl.cells.size;
  const prof = w.profiles[cl.dominant];

  if (cl.digging) {
    // digBehavior already set the drive and applied rock viscosity this
    // step — gravity and normal drag are suspended while submerged
  } else if (cl.traits.has("lift") && cl.formed && cl.perchTimer <= 0) {
    // hover: buoyancy ~cancels weight; random flaps knock it around the
    // sky so it roams and bumps into things instead of pinning at the top.
    // Only FORMED bodies fly — an unformed lift-bearer's flaps aren't enough
    // to carry it, which keeps adolescents in the soup where the food is
    // instead of starving to death in an empty sky.
    cl.vy += R.GRAVITY * R.LIFT_GRAVITY_MULT * prof.weight * dt;
    cl.vy += Math.sin(w.time * 0.9 + cl.id) * 8 * dt;
    if (w.rng() < R.FLAP_RATE * dt) {
      cl.vx += (w.rng() * 2 - 1) * R.FLAP_IMPULSE;
      cl.vy += (w.rng() * 2 - 1) * R.FLAP_IMPULSE;
    }
    if (cl.vy < -R.LIFT_MAX_RISE) cl.vy = -R.LIFT_MAX_RISE;
    // occasional ground visits: flyers drop in to graze the soup and mingle
    // with the walkers — far more readily when hungry (the food is down
    // there). The landing spot is chosen food-first, anywhere on the map.
    const perch = R.PERCH_RATE * (cl.hunger > R.HUNGER_SHED_AFTER ? R.PERCH_HUNGRY_MULT : 1);
    if (w.rng() < perch * dt) {
      cl.perchTimer = R.PERCH_MIN + w.rng() * (R.PERCH_MAX - R.PERCH_MIN);
      cl.perchX = pickLandingX(w, cl);
    }
  } else {
    // heavier is pulled down harder (drag-to-weight framing); a perched
    // flyer falls under full gravity like everything else until it lifts off
    cl.vy += R.GRAVITY * prof.weight * (1 + mass * R.CLUSTER_GRAVITY_PER_MASS) * dt;
    // a landing flyer glides toward its chosen spot until it touches down
    if (cl.perchTimer > 0 && cl.perchX >= 0) {
      if (cl.y + cl.maxR >= w.groundLevel - 2) {
        cl.perchX = -1; // touched down
      } else {
        const dx = cl.perchX - (cl.x + (cl.minC + cl.maxC) / 2);
        cl.vx += Math.max(-1, Math.min(1, dx / 6)) * R.PERCH_GLIDE_ACCEL * dt;
      }
    }
  }

  if (!cl.digging) {
    const drag = Math.exp(-R.CLUSTER_DRAG * dt);
    cl.vx *= drag;
    cl.vy *= drag;
  }

  cl.x += cl.vx * dt;
  cl.y += cl.vy * dt;

  // Surface bodies rest on the ground line; a miner mid-dig owns the whole
  // underground column down to the screen floor.
  const floorR = cl.digging ? w.height - 1 : w.groundLevel - 1;
  // walls/floor act on the cluster's world-space bounding box
  const rest = cl.traits.has("lift") && cl.formed && cl.perchTimer <= 0
    ? R.RESTITUTION_LIFT * prof.bounciness // balloons keep their bounce
    : (R.RESTITUTION_CLUSTER * prof.bounciness) / (1 + mass * 0.08); // perched/grounded flyers settle
  // reflect only motion INTO the wall — a body can re-penetrate while
  // moving away (e.g. its bottom edge grows mid-leap) and must keep going.
  // A body too big to fit the axis is pinned to one edge instead of
  // oscillating between the two clamps.
  if (cl.maxC - cl.minC >= w.width - 1) {
    cl.x = -cl.minC;
    cl.vx = 0;
  } else if (cl.x + cl.minC < 0) {
    cl.x = -cl.minC;
    if (cl.vx < 0) cl.vx = -cl.vx * rest;
  } else if (cl.x + cl.maxC > w.width - 1) {
    cl.x = w.width - 1 - cl.maxC;
    if (cl.vx > 0) cl.vx = -cl.vx * rest;
  }
  if (cl.maxR - cl.minR >= floorR) {
    cl.y = -cl.minR;
    cl.vy = 0;
  } else if (cl.y + cl.minR < 0) {
    cl.y = -cl.minR;
    if (cl.vy < 0) cl.vy = -cl.vy * rest;
  } else if (cl.y + cl.maxR > floorR) {
    cl.y = floorR - cl.maxR;
    if (cl.vy > 0) {
      cl.vy = -cl.vy * rest;
      cl.vx *= R.FLOOR_DAMP_X;
    }
  }
}

// --- birth of structure -----------------------------------------------------

// Two slow, touching, positive-affinity free pixels crystallize into a
// 2-cell cluster.
function nucleate(w: World, hash: SpatialHash, dt: number) {
  const { pixels, rng, affinity, profiles } = w;
  for (let i = pixels.length - 1; i >= 0; i--) {
    const p = pixels[i];
    hash.neighbors(p.x, p.y, scratch);
    for (const j of scratch) {
      if (j >= pixels.length || j <= i) continue; // pair once, indices valid
      const q = pixels[j];
      const dx = q.x - p.x, dy = q.y - p.y;
      if (dx * dx + dy * dy > 1.44) continue; // touching = within 1.2 cells
      const dvx = q.vx - p.vx, dvy = q.vy - p.vy;
      if (dvx * dvx + dvy * dvy > R.BOND_MAX_SPEED * R.BOND_MAX_SPEED) continue;
      if (affinity[p.color][q.color] <= 0 && p.color !== q.color) continue;
      const stick = (profiles[p.color].stickiness + profiles[q.color].fertility) / 2;
      if (rng() >= R.NUCLEATE_RATE * stick * dt) continue;

      const cl = newCluster(w, p.x, p.y, (p.vx + q.vx) / 2, (p.vy + q.vy) / 2);
      cl.dominant = p.color;
      cl.cells.set(R.cellKey(0, 0), p.color);
      const side = Math.abs(dx) >= Math.abs(dy) ? [0, dx > 0 ? 1 : -1] : [dy > 0 ? 1 : -1, 0];
      cl.cells.set(R.cellKey(side[0], side[1]), q.color);
      recomputeMeta(cl);
      w.clusters.push(cl);

      // remove both pixels (higher index first)
      pixels[j] = pixels[pixels.length - 1]; pixels.pop();
      pixels[i] = pixels[pixels.length - 1]; pixels.pop();
      break;
    }
  }
}

// A slow free pixel touching a compatible cluster snaps into the nearest
// empty lattice cell adjacent to the body. Sticky (mirror) slots reach 3×.
function capture(w: World, dt: number) {
  const { pixels, clusters, rng, affinity, profiles } = w;
  for (let i = pixels.length - 1; i >= 0; i--) {
    const p = pixels[i];
    for (const cl of clusters) {
      const prof = profiles[cl.dominant];
      const armMult = cl.traits.has("arms") ? R.ARMS_CAPTURE_MULT : 1;
      const reach = R.CAPTURE_RADIUS * prof.stickiness * armMult;
      const stickyReach = reach * 3;
      // cheap bbox reject
      if (
        p.x < cl.x + cl.minC - stickyReach || p.x > cl.x + cl.maxC + stickyReach ||
        p.y < cl.y + cl.minR - stickyReach || p.y > cl.y + cl.maxR + stickyReach
      ) continue;
      const compatible = cl.formed
        ? p.color === cl.dominant // settled adults graze only their own color
        : p.color === cl.dominant || affinity[p.color][cl.dominant] > 0;
      if (!compatible && !cl.pending) continue;
      const dvx = p.vx - cl.vx, dvy = p.vy - cl.vy;
      if (dvx * dvx + dvy * dvy > R.BOND_MAX_SPEED * R.BOND_MAX_SPEED) continue;
      const childMult = cl.age < R.CHILDHOOD ? R.CHILD_SNAP_MULT : 1;
      if (rng() >= R.SNAP_RATE * childMult * dt) continue;

      // nearest open slot: pending mutation slots and sticky slots first
      // (long reach), then any empty 4-neighbor of a body cell (short reach)
      let bestK = -1, bestD = Infinity, bestPending = false;
      const consider = (k: number, maxD: number, pending: boolean) => {
        const dx = cl.x + R.keyC(k) - p.x;
        const dy = cl.y + R.keyR(k) - p.y;
        const d = dx * dx + dy * dy;
        if (d <= maxD * maxD && d < bestD) { bestD = d; bestK = k; bestPending = pending; }
      };
      // A pending slot the body has already grown into (via merge/mining/
      // predation growth) must not be a capture target — overwriting an
      // occupied cell would consume a free pixel with no net cell (a matter
      // leak). Retire such slots so the limb can still complete instead of
      // stalling all future mutations on a permanently-blocked pending set.
      if (cl.pending) {
        for (const k of [...cl.pending.slots]) {
          if (cl.cells.has(k)) {
            cl.pending.slots.delete(k);
            if (cl.pending.slots.size === 0) {
              cl.traits.add(cl.pending.trait);
              cl.pending = null;
              break;
            }
            continue;
          }
          if (slotAnchored(cl, k)) consider(k, stickyReach, true);
        }
      }
      if (compatible) {
        for (const k of cl.sticky) {
          if (!cl.cells.has(k) && slotAnchored(cl, k)) consider(k, stickyReach, false);
        }
      }
      if (bestK === -1 && compatible) {
        for (const [k] of cl.cells) {
          const r = R.keyR(k), c = R.keyC(k);
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nk = R.cellKey(r + dr, c + dc);
            if (!cl.cells.has(nk)) consider(nk, reach, false);
          }
        }
      }
      if (bestK === -1) continue;

      // mutation limbs grow in the body color regardless of the food's color
      addCell(cl, R.keyR(bestK), R.keyC(bestK), bestPending ? cl.dominant : p.color);
      if (bestPending && cl.pending) {
        cl.pending.slots.delete(bestK);
        if (cl.pending.slots.size === 0) {
          cl.traits.add(cl.pending.trait);
          cl.pending = null;
        }
      }
      cl.hunger = 0;
      pixels[i] = pixels[pixels.length - 1];
      pixels.pop();
      break;
    }
  }
}

// Compute the mirrored stub cells for a trait. Slots are pending-growth
// targets: they fill pixel-by-pixel from captured soup (recolored to the
// body color), and the trait activates only when the limb is complete.
// Every limb roots at a cell the body actually occupies — bounding-box
// corners can be empty and would grow visibly detached limbs.
export function startMutation(w: World, cl: Cluster, trait: Trait) {
  if (cl.pending || cl.traits.has(trait)) return;
  // one way of moving per species — enforced here so every caller (mutation,
  // inheritance, the debug button) obeys it
  if (LOCOMOTION.includes(trait) && hasLocomotion(cl)) return;
  const slots = new Set<number>();
  const midR = Math.round((cl.minR + cl.maxR) / 2);

  // occupied columns of a row; a 4-connected body has at least one cell in
  // every row between minR and maxR
  const rowCols = (row: number): number[] => {
    const out: number[] = [];
    for (const [k] of cl.cells) if (R.keyR(k) === row) out.push(R.keyC(k));
    return out;
  };
  const nearest = (cols: number[], target: number): number | null => {
    let best: number | null = null;
    for (const c of cols) {
      if (best === null || Math.abs(c - target) < Math.abs(c - best)) best = c;
    }
    return best;
  };

  if (trait === "legs") {
    const span = Math.max(1, Math.round((cl.maxC - cl.minC) / 3));
    const bottom = rowCols(cl.maxR);
    const cL = nearest(bottom, Math.floor(cl.axis2 / 2) - span);
    const cR = cL === null ? null : nearest(bottom.filter((c) => c !== cL), cl.axis2 - cL);
    for (const c of [cL, cR]) {
      if (c === null) continue;
      slots.add(R.cellKey(cl.maxR + 1, c));
      slots.add(R.cellKey(cl.maxR + 2, c));
    }
  } else if (trait === "arms") {
    const cols = rowCols(midR);
    if (cols.length > 0) {
      const lo = Math.min(...cols), hi = Math.max(...cols);
      slots.add(R.cellKey(midR, lo - 1));
      slots.add(R.cellKey(midR, lo - 2));
      slots.add(R.cellKey(midR, hi + 1));
      slots.add(R.cellKey(midR, hi + 2));
    }
  } else if (trait === "dig") {
    // a drill spike straight down from the body's bottommost center cell
    const c = nearest(rowCols(cl.maxR), Math.round(cl.axis2 / 2));
    if (c !== null) {
      slots.add(R.cellKey(cl.maxR + 1, c));
      slots.add(R.cellKey(cl.maxR + 2, c));
      slots.add(R.cellKey(cl.maxR + 3, c));
    }
  } else {
    // lift: corner flaps above cells the top row actually has
    const top = rowCols(cl.minR);
    if (top.length > 0) {
      const lo = Math.min(...top), hi = Math.max(...top);
      slots.add(R.cellKey(cl.minR - 1, lo));
      slots.add(R.cellKey(cl.minR - 1, Math.min(lo + 1, hi)));
      slots.add(R.cellKey(cl.minR - 1, hi));
      slots.add(R.cellKey(cl.minR - 1, Math.max(hi - 1, lo)));
    }
  }
  for (const k of slots) if (cl.cells.has(k)) slots.delete(k);
  if (slots.size === 0) return;
  cl.pending = { trait, slots };
}

// Rare seeded roll on mature clusters; trait odds skewed by the epoch's
// color profile.
function mutate(w: World, cl: Cluster, dt: number) {
  if (cl.pending) {
    // a limb whose root cells were all torn away can never fill — abandon
    // it, or the body is sterile of new traits for the rest of its life
    let rooted = false;
    for (const k of cl.pending.slots) {
      if (slotAnchored(cl, k)) { rooted = true; break; }
    }
    if (!rooted) cl.pending = null;
    return;
  }
  if (cl.cells.size < R.MATURITY_SIZE) return;
  const prof = w.profiles[cl.dominant];
  if (w.rng() >= R.MUTATION_RATE * prof.fertility * dt) return;
  let options: Trait[] = (["legs", "arms", "lift", "dig"] as Trait[]).filter(
    (t) => !cl.traits.has(t),
  );
  // one way of moving per species: a body with a locomotion trait can only
  // still evolve utilities
  if (hasLocomotion(cl)) options = options.filter((t) => !LOCOMOTION.includes(t));
  if (options.length === 0) return;
  // Ore pressure: the richer the buried reserve has grown beyond the original
  // veins (corpse burial hoards matter underground), the likelier the next
  // mutation is a miner — life evolves toward the untapped resource. The
  // substrate scan is cheap here because the mutation roll already passed.
  let digWeight = prof.mutationWeights.dig;
  if (options.includes("dig")) {
    let ore = 0;
    for (const v of w.substrate.values()) {
      if (v !== R.ROCK && v !== R.FOSSIL) ore++; // fossils are no one's prize
    }
    digWeight *= Math.min(R.DIG_ORE_PRESSURE_MAX, Math.max(0.25, ore / w.oreBaseline));
  }
  const weightOf = (t: Trait) => (t === "dig" ? digWeight : prof.mutationWeights[t]);
  let total = 0;
  for (const t of options) total += weightOf(t);
  let roll = w.rng() * total;
  for (const t of options) {
    roll -= weightOf(t);
    if (roll <= 0) return startMutation(w, cl, t);
  }
  startMutation(w, cl, options[options.length - 1]);
}

// Ground behavior. Legless bodies twitch and scoot now and then; legs walk
// in gait bouts (stride, dawdle, rest), skip-hop, and rarely take a real
// leap. Hop airtime is also where knock impulses survive floor damping.
function wander(w: World, cl: Cluster, dt: number) {
  if (cl.digging) return;
  const onFloor = cl.y + cl.maxR >= w.groundLevel - 1.5;
  if (!onFloor) return;
  const torpid = isTorpid(cl); // starved-at-floor bodies move at half pace
  if (!cl.traits.has("legs")) {
    if (w.rng() < R.TWITCH_RATE * dt) {
      const kick = R.TWITCH_KICK * (torpid ? 0.5 : 1);
      cl.vx += (w.rng() * 2 - 1) * kick;
      cl.vy -= w.rng() * kick;
    }
    return;
  }
  // wanderlust: periodic solo treks — the heading locks and the stride
  // lengthens, carrying a walker clear across the map before it settles
  const trek = !torpid && Math.sin(w.time * R.TREK_FREQ + cl.id * 3.1) > R.TREK_GATE;
  if (!trek && w.rng() < R.LEGS_TURN_RATE * dt) cl.walkDir = -cl.walkDir;
  // per-creature phase makes each walker's rhythm its own; gaitBias is the
  // legged personality — striders (0) glide and rarely skip, hoppers (1)
  // barely stride and move in bounds, with every blend between
  const gait = Math.max(0, Math.sin(w.time * R.GAIT_FREQ + cl.id * 1.7));
  cl.vx = cl.walkDir * R.LEGS_SPEED * (1.3 - cl.gaitBias) *
    (trek ? R.TREK_SPEED : 1) * (torpid ? 0.5 : 1) * (0.3 + 1.7 * gait);
  if (!torpid && w.rng() < R.HOP_RATE * (0.25 + 2.5 * cl.gaitBias) * dt) {
    const leap = w.rng() < R.HOP_BIG_CHANCE;
    // effective gravity grows with weight and mass; a leap compensates so
    // every body clears real height, while small skips stay mass-damped
    const gFactor = Math.sqrt(
      w.profiles[cl.dominant].weight * (1 + cl.cells.size * R.CLUSTER_GRAVITY_PER_MASS),
    );
    cl.vy = leap
      ? -R.HOP_BIG_IMPULSE * gFactor
      : (-R.HOP_IMPULSE * (0.6 + w.rng() * 0.8)) / (1 + cl.cells.size * R.HOP_MASS_DAMP);
    // every hop travels; a leap really flies — far enough to arc over a
    // neighbor (mid-leap bodies pass through whoever is beneath them)
    cl.vx += cl.walkDir * R.HOP_FORWARD * (leap ? 2 : 0.8) * (0.5 + w.rng());
  }
}

// Push a mined ore block up its tunnel: it surfaces as a free soup pixel just
// above the ground, bursting upward. Keeps free matter out of the underground.
function ejectToSurface(w: World, col: number, color: number) {
  w.pixels.push({
    x: col + 0.5,
    y: Math.max(0, w.groundLevel - 1),
    vx: (w.rng() * 2 - 1) * 10,
    vy: -(20 + w.rng() * 20),
    color,
    streak: 0,
  });
}

// Mining: while submerged, carve rock inside the body footprint for passage
// (scenery, no matter) — but harvest ore ONLY from this trip's target pocket.
// Foreign ore in the path is squeezed past, never taken: one pocket per dig.
// Harvested ore is incorporated as body (size), burned for a speed kick
// (motion), or liberated straight to the surface soup.
function mine(w: World, cl: Cluster, dt: number) {
  const target = cl.digVein >= 0 && cl.digVein < w.veins.length
    ? new Set(w.veins[cl.digVein].cells)
    : null;
  const r0 = Math.floor(cl.y + cl.minR - R.MINE_REACH);
  const r1 = Math.ceil(cl.y + cl.maxR + R.MINE_REACH);
  const c0 = Math.floor(cl.x + cl.minC - R.MINE_REACH);
  const c1 = Math.ceil(cl.x + cl.maxC + R.MINE_REACH);
  for (let r = Math.max(w.groundLevel, r0); r <= r1 && r < w.height; r++) {
    for (let c = Math.max(0, c0); c <= c1 && c < w.width; c++) {
      const k = R.cellKey(r, c);
      const v = w.substrate.get(k);
      if (v === undefined) continue; // already open tunnel
      if (v === R.FOSSIL) continue; // sequestered strata: no one can take it
      if (v !== R.ROCK && (!target || !target.has(k))) continue; // not our pocket
      if (w.rng() >= R.MINE_RATE * dt) continue;
      w.substrate.delete(k);
      w.regrow.set(k, w.time + R.ROCK_REGROW_DELAY); // tunnels heal shut
      w.substrateDirty.push(k); // one changed cell — patch the render cache, don't rebuild it
      if (v === R.ROCK) continue; // scenery — no matter released
      const roll = w.rng();
      if (roll < R.MINE_EAT_CHANCE && growCell(cl, cl.dominant)) {
        cl.hunger = 0; // ore → body cell (size)
      } else if (roll < R.MINE_EAT_CHANCE + R.MINE_MOTION_CHANCE) {
        // ore burned for motion: speed kick, block ejected as exhaust
        cl.vy -= R.MINE_MOTION_KICK * 0.3;
        cl.vx += (w.rng() * 2 - 1) * R.MINE_MOTION_KICK;
        ejectToSurface(w, c, v);
        cl.hunger = 0;
      } else {
        ejectToSurface(w, c, v); // liberated ore → surface soup
      }
    }
  }
}

// Birth luck decides which pockets a monster can ever grab: a deterministic
// hash of its rolled digLuck against the vein index. No state, no fairness —
// some monsters are born prospect-rich, some poor.
function canReach(cl: Cluster, veinIdx: number): boolean {
  const h = Math.sin(cl.digLuck * 127.1 + veinIdx * 311.7) * 43758.5453;
  return h - Math.floor(h) < R.DIG_ACCESS_FRACTION;
}

// Dig trait: a hungry, formed miner dives blind — it doesn't know where its
// grabbable pockets are. It loops through the rock searching; only when it
// happens to pass near a pocket its birth luck allows does it lock on, work
// that one pocket, and surface. Unlucky trips come home empty.
function digBehavior(w: World, cl: Cluster, dt: number) {
  if (!cl.traits.has("dig")) return;
  const g = w.groundLevel;
  if (!cl.digging) {
    const grounded = cl.y + cl.maxR >= g - 1.5;
    if (cl.formed && grounded && cl.hunger > R.DIG_DIVE_HUNGER && w.rng() < R.DIG_DIVE_RATE * dt) {
      cl.digVein = -1; // no target yet: the search is the trip
      cl.digging = true;
      cl.digTimer = R.DIG_TRIP_TIME;
      cl.vy = 20; // initial plunge
    }
    return;
  }

  cl.digTimer -= dt;
  const cx = cl.x + (cl.minC + cl.maxC) / 2;
  const cy = cl.y + (cl.minR + cl.maxR) / 2;
  if (cl.digVein >= w.veins.length) cl.digVein = -1; // upheaval/resize dropped it

  // searching: notice a grabbable pocket with ore when passing close enough
  if (cl.digVein < 0 && cl.digTimer > 0) {
    outer: for (let i = 0; i < w.veins.length; i++) {
      if (!canReach(cl, i)) continue;
      for (const k of w.veins[i].cells) {
        const v = w.substrate.get(k);
        if (v === undefined || v === R.ROCK) continue;
        const dx = R.keyC(k) - cx, dy = R.keyR(k) - cy;
        if (dx * dx + dy * dy <= R.DIG_SENSE * R.DIG_SENSE) {
          cl.digVein = i;
          break outer;
        }
      }
    }
  }

  // locate what remains of a locked pocket
  let tx = 0, ty = 0, n = 0;
  if (cl.digVein >= 0) {
    for (const k of w.veins[cl.digVein].cells) {
      const v = w.substrate.get(k);
      if (v !== undefined && v !== R.ROCK) { tx += R.keyC(k); ty += R.keyR(k); n++; }
    }
    if (n === 0 && cl.digTimer > 0) cl.digTimer = 0; // worked it dry: head home
  }

  if (cl.digTimer <= 0) {
    cl.vy -= R.DIG_UP_ACCEL * dt; // head home
  } else if (n > 0) {
    // found one: weave toward it — a swaying bore, never a plumb line
    const dx = tx / n - cx, dy = ty / n - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const weave = Math.sin(w.time * R.DIG_WEAVE_FREQ + cl.id * 2.3);
    cl.vx += ((dx / d) * R.DIG_SEEK_ACCEL + (-dy / d) * weave * R.DIG_WEAVE_ACCEL) * dt;
    cl.vy += ((dy / d) * R.DIG_SEEK_ACCEL + (dx / d) * weave * R.DIG_WEAVE_ACCEL) * dt;
    cl.vx += (w.rng() * 2 - 1) * R.DIG_WANDER * dt;
  } else {
    // still searching: drift mostly SIDEWAYS through the rock — long, low
    // prospecting runs that resurface somewhere else entirely
    const t = w.time;
    cl.vx += (Math.sin(t * R.DIG_WEAVE_FREQ + cl.id * 2.3) * R.DIG_WEAVE_ACCEL * R.DIG_SEARCH_LATERAL +
      (w.rng() * 2 - 1) * R.DIG_WANDER) * dt;
    cl.vy += (Math.cos(t * R.DIG_WEAVE_FREQ * 0.7 + cl.id * 1.1) * R.DIG_WEAVE_ACCEL * 0.45 +
      R.DIG_SEEK_ACCEL * R.DIG_SEARCH_SINK) * dt;
  }
  const drag = Math.exp(-R.DIG_DRAG * dt); // rock viscosity
  cl.vx *= drag;
  cl.vy *= drag;
  if (cl.vy > R.DIG_MAX_SPEED) cl.vy = R.DIG_MAX_SPEED;
  else if (cl.vy < -R.DIG_MAX_SPEED) cl.vy = -R.DIG_MAX_SPEED;
  if (cl.vx > R.DIG_MAX_SPEED) cl.vx = R.DIG_MAX_SPEED;
  else if (cl.vx < -R.DIG_MAX_SPEED) cl.vx = -R.DIG_MAX_SPEED;

  mine(w, cl, dt);

  // End the trip only once the timer has run out AND the body has climbed back
  // above ground — never on frame one, when the miner still rests on the
  // surface. The hard safety scales with how far up it must climb (deep worlds
  // need more time) so a stuck miner is released rather than teleported home.
  const climbTime = (w.height - g) / R.DIG_MAX_SPEED + 4;
  if (cl.digTimer <= 0 && cl.y + cl.maxR <= g - 1) {
    cl.digging = false;
    cl.digVein = -1;
  } else if (cl.digTimer < -climbTime) {
    cl.digging = false;
    cl.digVein = -1;
  }
}

// Motion metabolism: a mobile creature with surplus mass can burn a body cell
// for a burst of speed, ejecting the spent block as exhaust — matter conserved,
// blocks "incorporated as motion" rather than size.
function burnForMotion(w: World, cl: Cluster, dt: number) {
  if (cl.digging || isTorpid(cl)) return;
  // flyers are exempt: soaring spends nothing, which is how a thin aerial
  // diet can still bank the surplus that mating and fission demand
  const mobile = cl.traits.has("legs") || cl.traits.has("dig");
  if (!mobile) return;
  // a deeper surplus is banked before any of it burns — big bodies get to
  // stay big instead of being torched back toward the formed floor
  if (cl.cells.size < R.FORMED_MIN_SIZE + 2 * R.BUD_SIZE) return;
  if (w.rng() >= R.BURN_RATE * dt) return;
  const edges = edgeKeys(cl);
  if (edges.length === 0) return;
  const dir = cl.walkDir || (w.rng() < 0.5 ? -1 : 1);
  popPixel(w, cl, edges[Math.floor(w.rng() * edges.length)], R.SHED_POP);
  cl.vx += dir * R.BURN_KICK;
}

// Natural death: the body settles into inert corpse blocks (detritus) that
// sink and rejoin the matter cycle through burial or decomposition. Eyes are
// whitened body cells and return as the dominant color.
function corpse(w: World, cl: Cluster) {
  for (const [k, color] of cl.cells) {
    w.detritus.push({
      x: cl.x + R.keyC(k),
      y: cl.y + R.keyR(k),
      vy: 0,
      color: color === R.EYE ? cl.dominant : color,
    });
  }
  cl.cells.clear();
}

// Violent death: every bond breaks at once and the body scatters back into the
// soup. Eyes return as the dominant color (whitened body cells).
export function killCluster(w: World, cl: Cluster, burst: number) {
  const cx = cl.x + (cl.minC + cl.maxC) / 2;
  const cy = cl.y + (cl.minR + cl.maxR) / 2;
  const dom = cl.dominant;
  for (const [k, color] of cl.cells) {
    const x = cl.x + R.keyC(k);
    const y = cl.y + R.keyR(k);
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    w.pixels.push({
      x, y,
      vx: (dx / d) * burst * (0.5 + w.rng()),
      vy: (dy / d) * burst * (0.5 + w.rng()) - 10,
      color: color === R.EYE ? dom : color,
      streak: 0,
    });
  }
  cl.cells.clear();
}

// Starvation: no capture for a while → shed edge pixels. A formed body sheds
// only down to its formed floor, then holds in torpor — starvation alone can
// no longer dissolve it. Unformed lumps stay ephemeral and dissolve entirely.
function metabolism(w: World, cl: Cluster, dt: number): boolean {
  let body = 0;
  for (const [, color] of cl.cells) if (color !== R.EYE) body++;
  const child = cl.age < R.CHILDHOOD; // the young don't starve-shed or pay upkeep
  // metabolic upkeep: living costs matter — a body slowly spends cells into
  // the deep reserve (which regrows the ore veins). Torpor is 4× cheaper.
  // This is the ecosystem's carrying capacity: a settled monoculture can no
  // longer recycle its own shed pixels and idle forever.
  if (!child) {
    const rate = cl.cells.size * R.UPKEEP_PER_CELL *
      (isTorpid(cl) ? R.UPKEEP_TORPOR : 1) *
      (cl.traits.has("lift") ? R.UPKEEP_LIFT_MULT : 1); // soaring is cheap living
    if (w.rng() < rate * dt) {
      const edges = edgeKeys(cl);
      if (edges.length > 0) {
        removeCell(cl, edges[Math.floor(w.rng() * edges.length)]);
        w.reserve++; // matter conserved: body → deep reserve
        shedFragments(w, cl);
        body--;
      }
    }
  }
  const atFloor = cl.formed && body <= R.FORMED_MIN_SIZE;
  if (cl.hunger > R.HUNGER_SHED_AFTER && !atFloor && !child && w.rng() < R.SHED_RATE * dt) {
    const edges = edgeKeys(cl);
    if (edges.length > 0) {
      popPixel(w, cl, edges[Math.floor(w.rng() * edges.length)], R.SHED_POP);
      body--;
    }
  }
  if (body < R.DISSOLVE_BELOW) {
    corpse(w, cl); // starved out — a natural death, becomes detritus
    return false;
  }
  return true;
}

// Age hazard: the death roll, divided by earned longevity — big formed
// bodies age far slower. Change over a lifetime comes from the ordinary
// channels (mutation, mating, fission); old age only ever ends a body.
// Returns false when the cluster died.
function hazard(w: World, cl: Cluster, dt: number): boolean {
  if (cl.age <= R.AGE_HAZARD_START) return true;
  const longevity =
    (1 + cl.cells.size / R.LONGEVITY_SIZE_DIV) *
    (cl.formed ? R.LONGEVITY_FORMED_MULT : 1);
  const p = ((cl.age - R.AGE_HAZARD_START) * R.AGE_HAZARD_RATE * dt) / longevity;
  if (w.rng() >= p) return true;
  corpse(w, cl); // old age — a natural death, becomes detritus
  return false;
}

// Push two overlapping clusters apart along the center line.
function separate(A: Cluster, B: Cluster) {
  const ax = A.x + (A.minC + A.maxC) / 2, ay = A.y + (A.minR + A.maxR) / 2;
  const bx = B.x + (B.minC + B.maxC) / 2, by = B.y + (B.minR + B.maxR) / 2;
  const dx = ax - bx, dy = ay - by;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  A.vx += (dx / d) * R.COMBAT_SEPARATE; A.vy += (dy / d) * R.COMBAT_SEPARATE;
  B.vx -= (dx / d) * R.COMBAT_SEPARATE; B.vy -= (dy / d) * R.COMBAT_SEPARATE;
}

// Two formed, compatible adults spawn a child: each donates edge cells and
// the child may inherit a parental trait as a limb it grows into. The child
// starts as an unformed mixed lump that must grow up like anything else.
function spawnOffspring(w: World, A: Cluster, B: Cluster) {
  let donated = 0;
  for (const parent of [A, B]) {
    for (let i = 0; i < R.MATE_CELLS; i++) {
      const edges = edgeKeys(parent);
      if (edges.length === 0) break;
      removeCell(parent, edges[Math.floor(w.rng() * edges.length)]); // never eyes
      donated++;
    }
    shedFragments(w, parent); // donation may have severed a bridge
  }
  if (donated < R.DISSOLVE_BELOW) return;
  // the child takes after one parent — a coherent single-color body forms
  // far more reliably than a mixed lump ever did
  const heir = w.rng() < 0.5 ? A : B;
  const child = newCluster(
    w,
    (A.x + B.x) / 2,
    Math.min(A.y + A.minR, B.y + B.minR) - 3,
    (w.rng() - 0.5) * 16,
    -(12 + w.rng() * 10),
  );
  child.dominant = heir.dominant;
  child.gaitBias = clamp01((A.gaitBias + B.gaitBias) / 2 + (w.rng() - 0.5) * R.GAIT_BIAS_NOISE);
  for (let i = 0; i < donated; i++) {
    child.cells.set(R.cellKey(Math.floor(i / 3), i % 3), heir.dominant);
  }
  recomputeMeta(child);
  const heritable = [...new Set<Trait>([...A.traits, ...B.traits])];
  // the child inherits at most one way of moving, drawn from its parents'
  const locos = heritable.filter((t) => LOCOMOTION.includes(t));
  const keepLoco = locos.length > 0 ? locos[Math.floor(w.rng() * locos.length)] : null;
  for (const t of heritable) {
    if (LOCOMOTION.includes(t) && t !== keepLoco) continue;
    if (w.rng() < R.INHERIT_CHANCE) startMutation(w, child, t); // first seed wins; the rest no-op
  }
  w.clusters.push(child);
  recordBirth(w, child);
  A.mateCooldown = R.MATE_COOLDOWN;
  B.mateCooldown = R.MATE_COOLDOWN;
}

// Affinity decides what touching clusters do — but complexity resists
// fusion: simple lumps consolidate freely, mature bodies rarely fuse, and
// formed creatures never do. Formed, compatible, rested pairs with surplus
// mass mate instead.
function collide(w: World, dt: number) {
  const cs = w.clusters;
  for (let a = 0; a < cs.length; a++) {
    for (let b = a + 1; b < cs.length; b++) {
      const A = cs[a], B = cs[b];
      if (A.cells.size === 0 || B.cells.size === 0) continue;
      const overlap =
        A.x + A.minC <= B.x + B.maxC + 1 && B.x + B.minC <= A.x + A.maxC + 1 &&
        A.y + A.minR <= B.y + B.maxR + 1 && B.y + B.minR <= A.y + A.maxR + 1;
      if (!overlap) continue;

      // Passing rules: not every meeting is an event. A LEGGED body in a
      // hop arc sails clean over whoever is below, so hoppers overtake at
      // will — but drifting lumps, buds, and falling bodies still interact
      // mid-air (fusion is how young clusters grow).
      const midLeap = (X: Cluster) =>
        X.traits.has("legs") && X.y + X.maxR < w.groundLevel - 2.5;
      if (midLeap(A) || midLeap(B)) continue;
      const torpidA = isTorpid(A), torpidB = isTorpid(B);
      const childA = A.age < R.CHILDHOOD, childB = B.age < R.CHILDHOOD;

      const aff = (w.affinity[A.dominant][B.dominant] + w.affinity[B.dominant][A.dominant]) / 2;
      if (aff > 0) {
        if (A.formed || B.formed) {
          if (
            A.formed && B.formed &&
            !torpidA && !torpidB &&
            A.mateCooldown <= 0 && B.mateCooldown <= 0 &&
            A.cells.size >= R.FORMED_MIN_SIZE + R.MATE_CELLS &&
            B.cells.size >= R.FORMED_MIN_SIZE + R.MATE_CELLS &&
            w.rng() < R.MATE_RATE * dt
          ) {
            spawnOffspring(w, A, B);
          }
          // only a pair of active formed adults bumps apart; a formed body
          // and a lump — or anything torpid — simply walk through each other
          if (A.formed && B.formed && !torpidA && !torpidB) separate(A, B);
        } else {
          const [big, small] = A.cells.size >= B.cells.size ? [A, B] : [B, A];
          const resist = small.cells.size / R.MERGE_FREE_SIZE;
          if (resist <= 1 || w.rng() < (R.MERGE_MATURE_RATE * dt) / (resist * resist)) {
            mergeInto(w, big, small);
          } else {
            separate(A, B);
          }
        }
      } else {
        // hostile: violence needs a hungry party. A hungry heavyweight with
        // a size × aggression edge hunts (torpid prey is fair game — but
        // never children); a hungry balanced pair trades chip damage; two
        // well-fed strangers just walk past each other without a glance.
        const aScore = A.cells.size * w.profiles[A.dominant].aggression;
        const bScore = B.cells.size * w.profiles[B.dominant].aggression;
        const aHungry = A.hunger > R.ENGAGE_HUNGER;
        const bHungry = B.hunger > R.ENGAGE_HUNGER;
        if (aHungry && !childB && aScore >= R.PREDATION_RATIO * bScore && w.rng() < R.PREDATION_RATE * dt) {
          predate(w, A, B);
          separate(A, B);
        } else if (bHungry && !childA && bScore >= R.PREDATION_RATIO * aScore && w.rng() < R.PREDATION_RATE * dt) {
          predate(w, B, A);
          separate(A, B);
        } else if ((aHungry || bHungry) && !torpidA && !torpidB && !childA && !childB) {
          const dvx = A.vx - B.vx, dvy = A.vy - B.vy;
          const impact = Math.sqrt(dvx * dvx + dvy * dvy);
          knock(w, A, Math.min(R.COMBAT_KNOCK_MAX, Math.max(1, Math.round(impact * R.COMBAT_KNOCK_SCALE * w.profiles[B.dominant].aggression))));
          knock(w, B, Math.min(R.COMBAT_KNOCK_MAX, Math.max(1, Math.round(impact * R.COMBAT_KNOCK_SCALE * w.profiles[A.dominant].aggression))));
          separate(A, B);
        }
        // neither hungry (or a protected party): pass without interacting
      }
    }
  }
  // sweep out clusters emptied by merges/combat
  for (let i = cs.length - 1; i >= 0; i--) {
    if (cs[i].cells.size === 0) { cs[i] = cs[cs.length - 1]; cs.pop(); }
  }
}

function knock(w: World, cl: Cluster, count: number) {
  for (let n = 0; n < count; n++) {
    const edges = edgeKeys(cl);
    if (edges.length === 0) break;
    popPixel(w, cl, edges[Math.floor(w.rng() * edges.length)], R.DEATH_BURST, false);
  }
  shedFragments(w, cl); // one sweep for the whole volley
}

// Grow one cell of the given color onto any open edge of the body.
function growCell(cl: Cluster, color: number): boolean {
  for (const [k] of cl.cells) {
    const r = R.keyR(k), c = R.keyC(k);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      if (!cl.cells.has(R.cellKey(r + dr, c + dc))) {
        addCell(cl, r + dr, c + dc, color);
        return true;
      }
    }
  }
  return false;
}

// Predation: the predator tears cells off the prey, absorbing a share into
// its own body (recolored) and scattering the rest. Prey that drops below
// viability is killed outright.
function predate(w: World, predator: Cluster, prey: Cluster) {
  const gain = Math.round(R.PREDATION_BITE * R.PREDATION_EAT_FRACTION);
  for (let n = 0; n < R.PREDATION_BITE; n++) {
    const edges = edgeKeys(prey);
    if (edges.length === 0) break;
    const k = edges[Math.floor(w.rng() * edges.length)];
    if (n < gain && growCell(predator, predator.dominant)) {
      removeCell(prey, k); // absorbed: gone from prey, added to predator
    } else {
      popPixel(w, prey, k, R.DEATH_BURST, false); // torn loose, back to the soup
    }
  }
  shedFragments(w, prey); // one sweep for the whole mauling
  predator.hunger = 0;
  let body = 0;
  for (const [, color] of prey.cells) if (color !== R.EYE) body++;
  if (body < R.DISSOLVE_BELOW) killCluster(w, prey, R.SHED_POP);
}

// The smaller cluster's pixels re-bond onto the larger's lattice; anything
// that can't find a slot spills back into the soup.
function mergeInto(w: World, big: Cluster, small: Cluster) {
  const baseR = Math.round(small.y - big.y);
  const baseC = Math.round(small.x - big.x);
  const smallDom = small.dominant;
  for (const [k, color] of small.cells) {
    if (color === R.EYE) {
      // winner keeps its own eyes; the loser's whitened cells spill as soup
      w.pixels.push({
        x: small.x + R.keyC(k), y: small.y + R.keyR(k),
        vx: (w.rng() - 0.5) * R.SHED_POP, vy: -w.rng() * R.SHED_POP,
        color: smallDom, streak: 0,
      });
      continue;
    }
    const r = baseR + R.keyR(k);
    const c = baseC + R.keyC(k);
    let placed = false;
    outer: for (let ring = 0; ring <= 3 && !placed; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const nk = R.cellKey(r + dr, c + dc);
          if (big.cells.has(nk)) continue;
          // must touch the existing body
          const rr = r + dr, cc = c + dc;
          if (
            big.cells.has(R.cellKey(rr - 1, cc)) || big.cells.has(R.cellKey(rr + 1, cc)) ||
            big.cells.has(R.cellKey(rr, cc - 1)) || big.cells.has(R.cellKey(rr, cc + 1))
          ) {
            big.cells.set(nk, color);
            placed = true;
            break outer;
          }
        }
      }
    }
    if (!placed) {
      w.pixels.push({
        x: small.x + R.keyC(k), y: small.y + R.keyR(k),
        vx: (w.rng() - 0.5) * R.SHED_POP, vy: -w.rng() * R.SHED_POP,
        color, streak: 0,
      });
    }
  }
  const bigMass = big.cells.size;
  const mass = bigMass + small.cells.size;
  big.vx = (big.vx * bigMass + small.vx * small.cells.size) / mass;
  big.vy = (big.vy * bigMass + small.vy * small.cells.size) / mass;
  small.cells.clear();
  big.hunger = 0; // it fed
  recomputeMeta(big);
}

// --- orchestration ----------------------------------------------------------

export function stepClusters(w: World, hash: SpatialHash, dt: number) {
  const cs = w.clusters;
  for (let i = cs.length - 1; i >= 0; i--) {
    const cl = cs[i];
    cl.age += dt;
    cl.hunger += dt;
    if (cl.mateCooldown > 0) cl.mateCooldown -= dt;
    if (cl.perchTimer > 0) {
      cl.perchTimer -= dt;
      // a starving flyer stays down and keeps foraging — only actually
      // eating (which resets hunger) releases it back into the sky
      if (cl.perchTimer <= 0 && cl.hunger > R.HUNGER_SHED_AFTER) cl.perchTimer = 1;
    }
    digBehavior(w, cl, dt); // sets the dig drive before physics integrates
    stepClusterPhysics(w, cl, dt);
    mutate(w, cl, dt);
    wander(w, cl, dt);
    burnForMotion(w, cl, dt);
    idleLife(w, cl, dt);
    bud(w, cl, dt);
    fission(w, cl, dt);
    assimilate(w, cl, dt);
    mirrorPull(w, hash, cl, dt);
    formEyes(w, cl, dt);
    if (!metabolism(w, cl, dt) || !hazard(w, cl, dt)) {
      cs[i] = cs[cs.length - 1];
      cs.pop();
    }
  }
  nucleate(w, hash, dt);
  capture(w, dt);
  collide(w, dt);
}
