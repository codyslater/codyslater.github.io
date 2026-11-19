import { mulberry32 } from "./generation";
import type {
  BirthName, DeathName, Rng, Temperament, TemperamentName,
} from "./types";

export function weightedPick<K extends string>(
  rng: Rng,
  weights: Record<K, number>,
  exclude?: K | null,
): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(
    ([key, w]) => w > 0 && key !== exclude,
  );
  if (entries.length === 0) return (exclude as K) ?? (Object.keys(weights)[0] as K);
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
    birthWeights: {
      "fly-up": 1, "rain-down": 4, "implode-from-edges": 1, "spiral-vortex": 0, "glitch-in": 1, "spring-snap": 5,
      grow: 1, hatch: 3, coalesce: 2, scan: 1, "drop-in": 5,
    },
    deathWeights: {
      "gravity-scatter": 3, explosion: 5, evaporate: 0, "dust-drift": 1, "implode-to-point": 1, "glitch-out": 1,
      melt: 0.5, crumble: 2, dissolve: 0.5, burn: 3, shatter: 4, unravel: 1, wilt: 0, abduct: 1,
    },
    ticWeights: { jump: 4, wiggle: 3, spin: 1, tilt: 1, squash: 3 },
    behavior: {
      walk: 4, hop: 4, float: 0, sit: 0.5, look: 1.5, speed: 38, pause: [1, 2], hopHeight: 6,
      curiosity: 0.8, skittish: 0.8, dozeAfter: 40, stutter: 0.1, edgeLove: 0.2,
    },
    speed: 0.7, intensity: 1.2, ticFrequency: 3, breathDepth: 0.02, blinkRate: 1.4,
  },
  sleepy: {
    name: "sleepy",
    birthWeights: {
      "fly-up": 3, "rain-down": 0, "implode-from-edges": 1, "spiral-vortex": 3, "glitch-in": 0, "spring-snap": 0,
      grow: 4, hatch: 3, coalesce: 3, scan: 1, "drop-in": 0,
    },
    deathWeights: {
      "gravity-scatter": 1, explosion: 0, evaporate: 4, "dust-drift": 1, "implode-to-point": 2, "glitch-out": 0,
      melt: 4, crumble: 1, dissolve: 3, burn: 0, shatter: 0, unravel: 1, wilt: 5, abduct: 0.5,
    },
    ticWeights: { jump: 0, wiggle: 2, spin: 0, tilt: 3, squash: 2 },
    behavior: {
      walk: 2, hop: 0.3, float: 1, sit: 3, look: 1, speed: 15, pause: [2, 4], hopHeight: 3,
      curiosity: 0.1, skittish: 0.1, dozeAfter: 10, stutter: 0, edgeLove: 0.3,
    },
    speed: 1.6, intensity: 0.8, ticFrequency: 0.6, breathDepth: 0.045, blinkRate: 0.6,
  },
  glitchy: {
    name: "glitchy",
    birthWeights: {
      "fly-up": 1, "rain-down": 1, "implode-from-edges": 1, "spiral-vortex": 0, "glitch-in": 6, "spring-snap": 2,
      grow: 1, hatch: 0.5, coalesce: 2, scan: 4, "drop-in": 1,
    },
    deathWeights: {
      "gravity-scatter": 1, explosion: 2, evaporate: 0, "dust-drift": 0, "implode-to-point": 1, "glitch-out": 6,
      melt: 0.5, crumble: 1, dissolve: 3, burn: 1, shatter: 3, unravel: 3, wilt: 0, abduct: 2,
    },
    ticWeights: { jump: 2, wiggle: 4, spin: 2, tilt: 1, squash: 1 },
    behavior: {
      walk: 3, hop: 2, float: 1.5, sit: 0.5, look: 2, speed: 30, pause: [1, 3], hopHeight: 5,
      curiosity: 0, skittish: 0.6, dozeAfter: 50, stutter: 1, edgeLove: 0.1,
    },
    speed: 0.9, intensity: 1.0, ticFrequency: 2.5, breathDepth: 0.015, blinkRate: 1.8,
  },
  dramatic: {
    name: "dramatic",
    birthWeights: {
      "fly-up": 1, "rain-down": 2, "implode-from-edges": 5, "spiral-vortex": 2, "glitch-in": 0, "spring-snap": 1,
      grow: 1, hatch: 4, coalesce: 2, scan: 0.5, "drop-in": 3,
    },
    deathWeights: {
      "gravity-scatter": 1, explosion: 4, evaporate: 1, "dust-drift": 4, "implode-to-point": 2, "glitch-out": 0,
      melt: 1, crumble: 1, dissolve: 0.5, burn: 5, shatter: 3, unravel: 1, wilt: 0.5, abduct: 3,
    },
    ticWeights: { jump: 1, wiggle: 0, spin: 4, tilt: 4, squash: 1 },
    behavior: {
      walk: 4.5, hop: 2, float: 0, sit: 2, look: 2, speed: 28, pause: [1.5, 3], hopHeight: 8,
      curiosity: 0.5, skittish: 0.5, dozeAfter: 30, stutter: 0, edgeLove: 0.5,
    },
    speed: 1.1, intensity: 1.5, ticFrequency: 1.5, breathDepth: 0.03, blinkRate: 1.0,
  },
  gentle: {
    name: "gentle",
    birthWeights: {
      "fly-up": 3, "rain-down": 1, "implode-from-edges": 1, "spiral-vortex": 5, "glitch-in": 0, "spring-snap": 0,
      grow: 4, hatch: 2, coalesce: 3, scan: 1, "drop-in": 0,
    },
    deathWeights: {
      "gravity-scatter": 1, explosion: 0, evaporate: 5, "dust-drift": 2, "implode-to-point": 1, "glitch-out": 0,
      melt: 3, crumble: 2, dissolve: 4, burn: 0, shatter: 0, unravel: 1, wilt: 3, abduct: 2,
    },
    ticWeights: { jump: 1, wiggle: 2, spin: 0, tilt: 3, squash: 2 },
    behavior: {
      walk: 1.5, hop: 0.5, float: 4, sit: 1.5, look: 2, speed: 20, pause: [1.5, 3.5], hopHeight: 4,
      curiosity: -0.7, skittish: 0.9, dozeAfter: 25, stutter: 0, edgeLove: 0.4,
    },
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

// Endings run at their own declared length. A temperament may stretch or hurry
// one within this range, so a sleepy creature's melt is slower than a zippy one's.
export const deathSpeed = (speed: number) => Math.min(1.15, Math.max(0.85, speed));

// Reduced motion: only these, and only at gentle speed. No flashes, flying
// bits or bounces; each runs 600 to 900 ms.
export const REDUCED_DEATHS: DeathName[] = ["dissolve", "wilt"];
export const REDUCED_BIRTHS: BirthName[] = ["grow", "scan"];

// Reduced motion plays each of these a little quicker, so every one of them
// lands between 600 and 900 ms.
export const REDUCED_SPEED: Partial<Record<BirthName | DeathName, number>> = {
  dissolve: 0.9, wilt: 0.9, crumble: 0.7, grow: 0.85, scan: 0.9,
};

// Not in the home page's rotation: these get weight zero in stage.ts and are
// shown in the zoo only, where the debug panel can pin them.
export const RETIRED_BIRTHS: BirthName[] = ["fly-up", "rain-down", "implode-from-edges", "glitch-in", "spiral-vortex"];
export const RETIRED_DEATHS: DeathName[] = ["gravity-scatter", "evaporate", "glitch-out", "unravel", "crumble", "abduct", "shatter"];
