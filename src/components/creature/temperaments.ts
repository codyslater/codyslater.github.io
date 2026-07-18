import { mulberry32 } from "./generation";
import type {
  Rng, Temperament, TemperamentName,
} from "./types";

export function weightedPick<K extends string>(
  rng: Rng,
  weights: Record<K, number>,
): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

// Exact numbers are tuning values, adjusted by eye on /zoo.
export const TEMPERAMENTS: Record<TemperamentName, Temperament> = {
  zippy: {
    name: "zippy",
    birthWeights: { "fly-up": 1, "rain-down": 4, "implode-from-edges": 1, "spiral-vortex": 0, "glitch-in": 1, "spring-snap": 5 },
    deathWeights: { "gravity-scatter": 3, explosion: 5, evaporate: 0, "dust-drift": 1, "implode-to-point": 1, "glitch-out": 1 },
    ticWeights: { jump: 4, wiggle: 3, spin: 1, tilt: 1, squash: 3 },
    speed: 0.7, intensity: 1.2, ticFrequency: 3, breathDepth: 0.02, blinkRate: 1.4,
  },
  sleepy: {
    name: "sleepy",
    birthWeights: { "fly-up": 4, "rain-down": 0, "implode-from-edges": 1, "spiral-vortex": 4, "glitch-in": 0, "spring-snap": 0 },
    deathWeights: { "gravity-scatter": 1, explosion: 0, evaporate: 5, "dust-drift": 1, "implode-to-point": 3, "glitch-out": 0 },
    ticWeights: { jump: 0, wiggle: 2, spin: 0, tilt: 3, squash: 2 },
    speed: 1.6, intensity: 0.8, ticFrequency: 0.6, breathDepth: 0.045, blinkRate: 0.6,
  },
  glitchy: {
    name: "glitchy",
    birthWeights: { "fly-up": 1, "rain-down": 1, "implode-from-edges": 1, "spiral-vortex": 0, "glitch-in": 6, "spring-snap": 2 },
    deathWeights: { "gravity-scatter": 1, explosion: 2, evaporate: 0, "dust-drift": 0, "implode-to-point": 1, "glitch-out": 6 },
    ticWeights: { jump: 2, wiggle: 4, spin: 2, tilt: 1, squash: 1 },
    speed: 0.9, intensity: 1.0, ticFrequency: 2.5, breathDepth: 0.015, blinkRate: 1.8,
  },
  dramatic: {
    name: "dramatic",
    birthWeights: { "fly-up": 1, "rain-down": 2, "implode-from-edges": 5, "spiral-vortex": 2, "glitch-in": 0, "spring-snap": 1 },
    deathWeights: { "gravity-scatter": 1, explosion: 4, evaporate: 1, "dust-drift": 4, "implode-to-point": 2, "glitch-out": 0 },
    ticWeights: { jump: 1, wiggle: 0, spin: 4, tilt: 4, squash: 1 },
    speed: 1.1, intensity: 1.5, ticFrequency: 1.5, breathDepth: 0.03, blinkRate: 1.0,
  },
  gentle: {
    name: "gentle",
    birthWeights: { "fly-up": 3, "rain-down": 1, "implode-from-edges": 1, "spiral-vortex": 5, "glitch-in": 0, "spring-snap": 0 },
    deathWeights: { "gravity-scatter": 1, explosion: 0, evaporate: 6, "dust-drift": 2, "implode-to-point": 1, "glitch-out": 0 },
    ticWeights: { jump: 1, wiggle: 2, spin: 0, tilt: 3, squash: 2 },
    speed: 1.2, intensity: 0.9, ticFrequency: 0.8, breathDepth: 0.035, blinkRate: 1.0,
  },
};

const TEMPERAMENT_NAMES = Object.keys(TEMPERAMENTS) as TemperamentName[];

// Deterministic per seed so the zoo can label a specimen with the same
// temperament PixelCreature rolls internally.
export function temperamentForSeed(seed: number): Temperament {
  const rng = mulberry32(seed * 4093);
  return TEMPERAMENTS[
    TEMPERAMENT_NAMES[Math.floor(rng() * TEMPERAMENT_NAMES.length)]
  ];
}

// Slowest death style at speed 1 — gravity-scatter with its upward kick at
// high intensity — measures ~515 ms natural (see per-style budgets in
// styles/). Cap speed so 500/520 ≈ 0.96 guarantees duration × speed never
// exceeds 500 ms without relying on the engine's maxMs backstop, which
// freeze-truncates rather than completing naturally.
export const DEATH_NATURAL_MS = 520;
export const DEATH_CAP_MS = 500;
export const deathSpeed = (speed: number) =>
  Math.min(speed, DEATH_CAP_MS / DEATH_NATURAL_MS);
