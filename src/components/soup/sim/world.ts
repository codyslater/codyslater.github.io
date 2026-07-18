import { mulberry32 } from "@/components/creature/generation";
import { stepClusters } from "./clusters";
import { stepFreePixels } from "./freePixels";
import * as R from "./rules";
import { SpatialHash } from "./spatialHash";
import type { World } from "./types";

// Distinct identity per world instance so the module-level render cache never
// serves a previous world's substrate after a remount. Not part of sim state.
let worldSeq = 0;

// The ground line: everything below it is underground (rock + ore). Clamped so
// there is always a surface column and an underground layer to work with.
function computeGround(height: number): number {
  return Math.min(height - 2, Math.max(2, Math.floor(height * R.GROUND_FRACTION)));
}

// Total conserved matter across every reservoir. Rock is scenery and excluded;
// only ore counts underground. Used at creation to fix the budget and by the
// harness/debug panel to assert conservation.
export function matterOf(w: World): number {
  let cells = 0;
  for (const cl of w.clusters) cells += cl.cells.size;
  let ore = 0;
  for (const v of w.substrate.values()) if (v !== R.ROCK) ore++;
  return w.pixels.length + cells + ore + w.detritus.length + w.reserve + w.fossil;
}

// Fill the underground with rock and scatter ore veins through it. Ore is the
// mineable, conserved matter; rock is dug through freely. Each vein's
// footprint and color are remembered — pockets regrow themselves from the
// deep reserve and shallow pockets seep to the surface.
function generateSubstrate(w: World) {
  w.substrate.clear();
  w.veins = [];
  w.regrow.clear();
  const { groundLevel, height, width, rng } = w;
  for (let r = groundLevel; r < height; r++) {
    for (let c = 0; c < width; c++) w.substrate.set(R.cellKey(r, c), R.ROCK);
  }
  const undergroundCells = width * (height - groundLevel);
  const veins = Math.max(1, Math.round((undergroundCells / 1000) * R.ORE_VEIN_PER_KCELL));
  const rad = R.ORE_VEIN_RADIUS;
  for (let v = 0; v < veins; v++) {
    // the first vein is guaranteed shallow so every world has a surface seep
    const vr = v === 0
      ? groundLevel + 1
      : groundLevel + Math.floor(rng() * (height - groundLevel));
    const vc = Math.floor(rng() * width);
    const color = Math.floor(rng() * R.COLORS.length);
    const cells: number[] = [];
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (dr * dr + dc * dc > rad * rad) continue;
        if (rng() >= R.ORE_VEIN_FILL) continue;
        const r = vr + dr, c = vc + dc;
        if (r < groundLevel || r >= height || c < 0 || c >= width) continue;
        const k = R.cellKey(r, c);
        w.substrate.set(k, color);
        cells.push(k);
      }
    }
    if (cells.length > 0) w.veins.push({ cells, color });
  }
  let ore = 0;
  for (const v of w.substrate.values()) if (v !== R.ROCK) ore++;
  w.oreBaseline = Math.max(1, ore);
  w.substrateVersion++; // full regen — forces a render-cache rebuild
  w.substrateDirty.length = 0; // the rebuild reflects all cells; drop pending patches
  // the vein array was rebuilt wholesale: any miner's locked pocket index
  // now points at an arbitrary new vein its birth luck never granted
  for (const cl of w.clusters) cl.digVein = -1;
}

// Geological upheaval between epochs: every tunnel collapses back to rock and
// the ore that accumulated underground (buried corpses, leftover veins) is
// re-cast into fresh veins. The ore count is preserved exactly — matter is
// redistributed, never made — so each epoch starts the arc over: sealed
// ground, surface life first, and an underground that only opens once a
// monster evolves the dig trait.
function redistributeSubstrate(w: World) {
  // upheaval reclaims everything: circulating ore, fossil strata cells, the
  // compacted fossil pool, AND the deep reserve are all recast as fresh
  // living veins — otherwise matter ratchets into the reserve across epochs
  // until abiogenesis can no longer seed a viable surface
  let ore = 0;
  for (const v of w.substrate.values()) if (v !== R.ROCK) ore++;
  ore += w.fossil;
  w.fossil = 0;
  ore += w.reserve;
  w.reserve = 0;
  const { groundLevel, height, width, rng } = w;
  w.substrate.clear();
  w.veins = [];
  w.regrow.clear();
  for (let r = groundLevel; r < height; r++) {
    for (let c = 0; c < width; c++) w.substrate.set(R.cellKey(r, c), R.ROCK);
  }
  const capacity = width * (height - groundLevel);
  if (ore > capacity) {
    // pathological tiny window: the overflow returns to the surface as soup
    for (let i = capacity; i < ore; i++) {
      w.pixels.push({
        x: rng() * width,
        y: rng() * (groundLevel - 1),
        vx: (rng() - 0.5) * 20,
        vy: (rng() - 0.5) * 20,
        color: Math.floor(rng() * R.COLORS.length),
        streak: 0,
      });
    }
    ore = capacity;
  }
  const rad = R.ORE_VEIN_RADIUS;
  let placed = 0;
  let first = true;
  for (let guard = 0; placed < ore && guard < 100000; guard++) {
    // the first recast vein is guaranteed shallow so the new epoch can seep
    const vr = first
      ? groundLevel + 1
      : groundLevel + Math.floor(rng() * (height - groundLevel));
    first = false;
    const vc = Math.floor(rng() * width);
    const color = Math.floor(rng() * R.COLORS.length);
    const cells: number[] = [];
    for (let dr = -rad; dr <= rad && placed < ore; dr++) {
      for (let dc = -rad; dc <= rad && placed < ore; dc++) {
        if (dr * dr + dc * dc > rad * rad) continue;
        if (rng() >= R.ORE_VEIN_FILL) continue;
        const r = vr + dr, c = vc + dc;
        if (r < groundLevel || r >= height || c < 0 || c >= width) continue;
        const k = R.cellKey(r, c);
        if (w.substrate.get(k) !== R.ROCK) continue; // that spot is already ore
        w.substrate.set(k, color);
        cells.push(k);
        placed++;
      }
    }
    if (cells.length > 0) w.veins.push({ cells, color });
  }
  // guard exhaustion (underground nearly full of ore): sweep the shortfall
  // in, grouped per color into synthetic veins so every ore cell can regrow
  const sweep: number[][] = [[], [], [], [], []];
  for (const [k, v] of w.substrate) {
    if (placed >= ore) break;
    if (v === R.ROCK) {
      const color = Math.floor(rng() * R.COLORS.length);
      w.substrate.set(k, color);
      sweep[color].push(k);
      placed++;
    }
  }
  for (let c = 0; c < sweep.length; c++) {
    if (sweep[c].length > 0) w.veins.push({ cells: sweep[c], color: c });
  }
  w.substrateVersion++;
  w.substrateDirty.length = 0;
  // the vein array was rebuilt wholesale: any miner's locked pocket index
  // now points at an arbitrary new vein its birth luck never granted
  for (const cl of w.clusters) cl.digVein = -1;
}

export function createWorld(seed: number, width: number, height: number): World {
  const rng = mulberry32(seed);
  const w: World = {
    rng,
    uid: ++worldSeq,
    width,
    height,
    groundLevel: computeGround(height),
    pixels: [],
    clusters: [],
    detritus: [],
    substrate: new Map(),
    substrateVersion: 0,
    substrateDirty: [],
    reserve: 0,
    fossil: 0,
    veins: [],
    regrow: new Map(),
    births: [],
    matter: 0,
    oreBaseline: 1,
    profiles: R.rollProfiles(rng),
    affinity: R.rollAffinity(rng),
    time: 0,
    emptySince: null,
    lifelessSince: null,
    nextClusterId: 1,
    epoch: 1,
  };
  generateSubstrate(w);
  const surfaceKcells = (width * (w.groundLevel - 1)) / 1000;
  seedSoup(w, Math.min(R.SOUP_SEED_MAX,
    Math.max(R.SOUP_SEED_MIN, Math.round(surfaceKcells * R.SOUP_SEED_PER_KCELL))));
  w.matter = matterOf(w);
  return w;
}

// Seed free pixels into the surface column only (life never originates below
// ground).
export function seedSoup(w: World, count: number) {
  for (let i = 0; i < count; i++) {
    w.pixels.push({
      x: w.rng() * w.width,
      y: w.rng() * (w.groundLevel - 1),
      vx: (w.rng() - 0.5) * 40,
      vy: (w.rng() - 0.5) * 40,
      color: Math.floor(w.rng() * R.COLORS.length),
      streak: 0,
    });
  }
}

// Vein pockets are the underground's living sources: a depleted pocket very
// slowly re-crystallizes its own color from the deep reserve (matter that
// sedimented or was spent as metabolic upkeep), and a pocket whose ore sits
// right under the surface seeps — bubbling units out at the ground line.
function seepAndRegrow(w: World, dt: number) {
  for (const vein of w.veins) {
    if (w.reserve > 0 && w.rng() < R.VEIN_REGROW_RATE * dt) {
      const off = Math.floor(w.rng() * vein.cells.length);
      for (let i = 0; i < vein.cells.length; i++) {
        const k = vein.cells[(off + i) % vein.cells.length];
        // regrow only into healed rock — never materialize ore in an open tunnel
        if (w.substrate.get(k) === R.ROCK) {
          w.substrate.set(k, vein.color);
          w.substrateDirty.push(k);
          w.reserve--;
          break;
        }
      }
    }
    if (w.rng() < R.SEEP_RATE * dt) {
      let bestK = -1;
      let bestR = w.groundLevel + R.SEEP_DEPTH + 1;
      for (const k of vein.cells) {
        const r = R.keyR(k);
        if (r < bestR && w.substrate.get(k) === vein.color) {
          bestR = r;
          bestK = k;
        }
      }
      if (bestK < 0) continue; // pocket is deep or drained: no seep
      w.substrate.set(bestK, R.ROCK);
      w.substrateDirty.push(bestK);
      w.pixels.push({
        x: R.keyC(bestK) + 0.5,
        y: w.groundLevel - 1,
        vx: (w.rng() - 0.5) * 8,
        vy: -(24 + w.rng() * 20),
        color: vein.color,
        streak: R.EMIT_STREAK,
      });
    }
  }
}

// Dug tunnels heal: rock re-forms block-by-block a short while after being
// carved — the underground always closes back up on an infinite timeline.
// A cell waits while a corpse buried into it or a digger still occupies it.
function healRock(w: World) {
  if (w.regrow.size === 0) return;
  for (const [k, at] of w.regrow) {
    if (w.time < at) continue;
    if (w.substrate.has(k)) { w.regrow.delete(k); continue; } // buried over
    const r = R.keyR(k), c = R.keyC(k);
    let occupied = false;
    for (const cl of w.clusters) {
      if (!cl.digging) continue;
      if (
        r >= cl.y + cl.minR - 1 && r <= cl.y + cl.maxR + 1 &&
        c >= cl.x + cl.minC - 1 && c <= cl.x + cl.maxC + 1
      ) { occupied = true; break; }
    }
    if (occupied) { w.regrow.set(k, w.time + 1); continue; }
    w.substrate.set(k, R.ROCK);
    w.substrateDirty.push(k);
    w.regrow.delete(k);
  }
}

// Sink corpses; on reaching the ground they bury into an open tunnel
// (fossilizing) or rest and slowly crumble back into the living soup.
function stepDetritus(w: World, dt: number) {
  const g = w.groundLevel;
  for (let i = w.detritus.length - 1; i >= 0; i--) {
    const d = w.detritus[i];
    d.vy += R.DETRITUS_GRAVITY * dt;
    if (d.vy > R.DETRITUS_TERMINAL) d.vy = R.DETRITUS_TERMINAL;
    d.y += d.vy * dt;
    if (d.x < 0) d.x = 0;
    else if (d.x > w.width - 1) d.x = w.width - 1;

    if (d.y < g - 1) continue; // still falling through the air column
    const col = Math.round(d.x);

    // bury through an open tunnel mouth at the surface, settling at its floor
    if (!w.substrate.has(R.cellKey(g, col))) {
      let r = g;
      while (r + 1 < w.height && !w.substrate.has(R.cellKey(r + 1, col))) r++;
      const bk = R.cellKey(r, col);
      w.substrate.set(bk, R.FOSSIL); // buried bone fossilizes — out of circulation
      w.regrow.delete(bk); // the burial claimed this cell; no heal pending
      w.substrateDirty.push(bk); // one changed cell — patch, don't rebuild
      w.detritus[i] = w.detritus[w.detritus.length - 1];
      w.detritus.pop();
      continue;
    }

    // solid ground underfoot: rest, then crumble back into the living soup
    d.y = g - 1;
    d.vy = 0;
    if (w.rng() < R.DETRITUS_DECOMPOSE * dt) {
      w.pixels.push({
        x: d.x,
        y: g - 1,
        vx: (w.rng() - 0.5) * 12,
        vy: -(6 + w.rng() * 10),
        color: d.color,
        streak: 0,
      });
      w.detritus[i] = w.detritus[w.detritus.length - 1];
      w.detritus.pop();
    }
  }
}

// Eruption abiogenesis: reseed the surface by erupting ore up through the
// ground. Matter is only moved, never created.
function erupt(w: World, target: number) {
  let spawned = 0;
  const oreKeys: number[] = [];
  for (const [k, v] of w.substrate) {
    if (v !== R.ROCK && v !== R.FOSSIL) oreKeys.push(k); // fossils stay locked
  }
  for (const k of oreKeys) {
    if (spawned >= target) break;
    const color = w.substrate.get(k)!;
    w.substrate.delete(k);
    w.regrow.set(k, w.time + R.ROCK_REGROW_DELAY); // eruption cavities heal too
    w.pixels.push({
      x: R.keyC(k) + 0.5,
      y: Math.max(0, w.groundLevel - 1),
      vx: (w.rng() - 0.5) * 24,
      vy: -(30 + w.rng() * 40),
      color,
      streak: R.EMIT_STREAK,
    });
    spawned++;
  }
  if (spawned > 0) w.substrateVersion++;
  // shortfall falls back on the deep reserve, so an eruption (and the debug
  // shower) always has a reservoir even when the veins are picked clean
  while (spawned < target && w.reserve > 0) {
    w.reserve--;
    w.pixels.push({
      x: w.rng() * w.width,
      y: Math.max(0, w.groundLevel - 1),
      vx: (w.rng() - 0.5) * 24,
      vy: -(30 + w.rng() * 40),
      color: Math.floor(w.rng() * R.COLORS.length),
      streak: R.EMIT_STREAK,
    });
    spawned++;
  }
}

export function spawnShower(w: World, count: number) {
  // Debug helper: force a burst of `count` units of surface soup, drawn
  // conservatively from the real ore reservoir — never fabricated, so the
  // dev conservation readout stays honest. Reuses the eruption path.
  erupt(w, count);
}

export function resizeWorld(w: World, width: number, height: number) {
  const dimsChanged = width !== w.width || height !== w.height;
  w.width = width;
  w.height = height;
  w.groundLevel = computeGround(height);
  for (const p of w.pixels) {
    p.x = Math.min(w.width - 1, Math.max(0, p.x));
    p.y = Math.min(w.groundLevel - 1, Math.max(0, p.y));
  }
  for (const cl of w.clusters) {
    cl.x = Math.min(w.width - 1 - cl.maxC, Math.max(-cl.minC, cl.x));
    cl.y = Math.min(w.height - 1 - cl.maxR, Math.max(-cl.minR, cl.y));
  }
  // A window resize is a re-layout, not a sim event; regenerate the substrate
  // (either dimension can expose bare underground) and re-fix the matter budget.
  if (dimsChanged) {
    generateSubstrate(w);
    w.matter = matterOf(w);
  }
}

const hash = new SpatialHash();

export function stepWorld(w: World, dt: number) {
  w.time += dt;
  // birth flashes are append-ordered; drop the ones that have faded
  while (w.births.length > 0 && w.time - w.births[0].time > R.BIRTH_FLASH_LEN) {
    w.births.shift();
  }
  hash.build(w.pixels, w.width);
  stepFreePixels(w, hash, dt);
  stepClusters(w, hash, dt);
  stepDetritus(w, dt);

  // veins regrow from the deep reserve and shallow pockets seep upward —
  // suppressed during the extinction pause so the screen goes fully black
  if (w.emptySince === null) seepAndRegrow(w, dt);
  healRock(w);

  // extinction → eruption abiogenesis: a new epoch with re-rolled chemistry,
  // reseeded from the recast ore reserve rather than from fresh matter
  const barren = w.pixels.length === 0 && w.clusters.length === 0 && w.detritus.length === 0;
  if (barren) {
    if (w.emptySince === null) {
      w.emptySince = w.time;
    } else if (w.time - w.emptySince >= R.EXTINCTION_PAUSE) {
      resetEpoch(w);
    }
  } else {
    w.emptySince = null;
  }

  // Soft-lock watchdog: a starved surface can flicker 2-cell nucleations
  // forever (defeating a zero-clusters test) while nearly all matter sits
  // buried as ore — too sparse to ever grow a formed body again. "Viable"
  // means some cluster has reached real aggregate size AND either a
  // formed-scale body already exists or there is enough surface matter left
  // to build one. Anything else, held long enough, forces a fresh epoch — the
  // world always either lives or resets, never limps forever.
  let biggest = 0;
  let cellSum = 0;
  for (const cl of w.clusters) {
    cellSum += cl.cells.size;
    if (cl.cells.size > biggest) biggest = cl.cells.size;
  }
  const surface = w.pixels.length + cellSum;
  const viable =
    biggest >= R.LIFELESS_MIN_CLUSTER &&
    (biggest >= R.FORMED_MIN_SIZE || surface >= R.SURFACE_VIABLE_MIN);
  if (!viable) {
    if (w.lifelessSince === null) w.lifelessSince = w.time;
    else if (w.time - w.lifelessSince >= R.LIFELESS_RESET) resetEpoch(w);
  } else {
    w.lifelessSince = null;
  }
}

// New epoch: geological upheaval seals the tunnels and recasts the buried
// ore + fossil strata, chemistry re-rolls, and life erupts from the veins.
function resetEpoch(w: World) {
  w.epoch++;
  w.profiles = R.rollProfiles(w.rng);
  w.affinity = R.rollAffinity(w.rng);
  redistributeSubstrate(w);
  erupt(w, R.ABIOGENESIS_MIN + Math.floor(w.rng() * (R.ABIOGENESIS_MAX - R.ABIOGENESIS_MIN)));
  w.emptySince = null;
  w.lifelessSince = null;
}
