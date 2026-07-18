import * as R from "./rules";
import type { SpatialHash } from "./spatialHash";
import type { World } from "./types";

const scratch: number[] = [];

// Free pixels are the hot, floaty phase: strong jitter, low terminal
// velocity, chemistry forces. Drag vs jitter is the soup's thermostat.
export function stepFreePixels(w: World, hash: SpatialHash, dt: number) {
  const { pixels, rng, profiles, affinity } = w;

  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    const prof = profiles[p.color];

    // gravity + brownian heat (slight upward bias keeps the pile seething)
    p.vy += R.GRAVITY * prof.weight * dt;
    p.vx += (rng() - 0.5) * R.JITTER_ACCEL * dt;
    p.vy += (rng() - 0.65) * R.JITTER_ACCEL * dt;

    // chemistry: short-range pairwise forces, capped neighbor count
    hash.neighbors(p.x, p.y, scratch);
    const n = Math.min(scratch.length, R.MAX_NEIGHBORS);
    for (let s = 0; s < n; s++) {
      const j = scratch[s];
      if (j === i) continue;
      const q = pixels[j];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R.FORCE_RADIUS * R.FORCE_RADIUS || d2 < 0.01) continue;
      const d = Math.sqrt(d2);
      const aff = affinity[p.color][q.color];
      const f = R.FORCE_STRENGTH * aff * (1 - d / R.FORCE_RADIUS) * dt;
      p.vx += (dx / d) * f;
      p.vy += (dy / d) * f;
    }

    // drag + terminal velocity (mass-relative: lone pixels drift)
    const drag = Math.exp(-R.DRAG_FREE * dt);
    p.vx *= drag;
    p.vy *= drag;
    const tv = R.TERMINAL_FREE / prof.weight;
    if (p.vy > tv) p.vy = tv;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.streak > 0) p.streak -= dt;

    // walls + floor; soup rests on the ground line, floor bleeds energy
    const floorY = w.groundLevel - 1;
    const rest = R.RESTITUTION_FREE * prof.bounciness;
    if (p.x < 0) {
      p.x = 0;
      p.vx = Math.abs(p.vx) * rest;
    } else if (p.x > w.width - 1) {
      p.x = w.width - 1;
      p.vx = -Math.abs(p.vx) * rest;
    }
    if (p.y < 0) {
      p.y = 0;
      p.vy = Math.abs(p.vy) * rest;
    } else if (p.y > floorY) {
      p.y = floorY;
      p.vy = -Math.abs(p.vy) * rest;
      p.vx *= R.FLOOR_DAMP_X;
    }
  }

  // sedimentation — a pixel resting on the ground line very slowly percolates
  // into the deep reserve, the pool the ore veins regrow from; overcrowding
  // raises the rate, so this stays the population thermostat
  const crowd = pixels.length > R.CROWD_CAP ? 3 : 1;
  const restY = w.groundLevel - 1.5;
  for (let i = pixels.length - 1; i >= 0; i--) {
    const p = pixels[i];
    if (p.y < restY) continue;
    const prof = profiles[p.color];
    if (rng() >= R.SEDIMENT_RATE * prof.volatility * crowd * dt) continue;
    // matter conserved either way: most feeds the veins' deep reserve, a
    // share compacts into fossil strata — out of circulation until upheaval
    if (rng() < R.SEDIMENT_FOSSIL_FRACTION) w.fossil++;
    else w.reserve++;
    pixels[i] = pixels[pixels.length - 1];
    pixels.pop();
  }
}
