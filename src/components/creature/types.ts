export type Grid = (string | null)[][];
export type Rng = () => number;

// Per-pixel animation state. Styles own the semantics of the scratch
// fields (vr/vc/phase); the engine only reads r, c, color, alpha, done.
export type PixelAnim = {
  r: number; // current row, canvas grid units (includes PAD offset)
  c: number; // current col, canvas grid units
  color: string;
  base: string; // the color it was born with; styles that tint recolor from here
  alpha: number; // 0..1, drawn via ctx.globalAlpha
  targetR: number; // resting position = body cell + PAD
  targetC: number;
  startR: number;
  startC: number;
  vr: number; // per-style scratch (velocity, offset, radius…)
  vc: number;
  delay: number; // ms before this pixel starts moving
  duration: number; // ms of active motion after delay
  phase: number; // per-style scratch (angle, amplitude, beat, salt…)
  done: boolean; // engine skips drawing when true
  from?: string; // the color it starts from, for styles that morph it into `base`
  keep?: number; // alpha this pixel is left at when the ending is over (residue)
  lid?: string; // on an eye cell: the body color it closes to, so tinting never turns an eye grey
};

// A pixel that outlived its ending: where it came to rest, in canvas units.
export type Remain = { r: number; c: number; color: string };

// What the stage tells a style about the place it plays in. Rows and columns
// are canvas units (PAD offset included), like PixelAnim.
export type StyleEnv = {
  groundR: number; // row where the ground starts: a pixel rests at groundR - 1
  topR: number; // top edge of the stage (can be negative: room above the body)
  leftC: number;
  rightC: number;
  reduced: boolean; // prefers-reduced-motion: no flashes, bounces or flying bits
  remains: Remain[]; // the last creature's resting pixels (coalesce only)
};

export type Style = {
  name: string;
  // Natural length in ms at speed 1. The engine stops there at the latest,
  // and the stage uses it to time an ending before it starts.
  duration: number;
  init(grid: Grid, rng: Rng, intensity: number, env: StyleEnv): PixelAnim[];
  // elapsed is speed-scaled ms since start; return false when finished
  step(pixels: PixelAnim[], elapsed: number): boolean;
  // Pixels worth carrying into the next birth (coalesce). Default: none.
  remains?(pixels: PixelAnim[]): Remain[];
};

export type BirthName =
  | "fly-up" | "rain-down" | "implode-from-edges"
  | "spiral-vortex" | "glitch-in" | "spring-snap"
  | "grow" | "hatch" | "coalesce" | "scan" | "drop-in";
export type DeathName =
  | "gravity-scatter" | "explosion" | "evaporate"
  | "dust-drift" | "implode-to-point" | "glitch-out"
  | "melt" | "crumble" | "dissolve" | "burn"
  | "shatter" | "unravel" | "wilt" | "abduct";
export type TemperamentName = "zippy" | "sleepy" | "glitchy" | "dramatic" | "gentle";
export type TicName = "jump" | "wiggle" | "spin" | "tilt" | "squash";

// What a creature does with its free time. Weights are relative.
type Behavior = {
  walk: number;
  hop: number;
  float: number;
  sit: number;
  look: number;
  speed: number; // walking speed, px/s
  pause: [number, number]; // seconds between moves
  hopHeight: number; // grid units
  curiosity: number; // -1 backs away from the pointer, +1 follows it, 0 only looks
  skittish: number; // 0..1, how easily a quick pointer startles it
  dozeAfter: number; // seconds of quiet before it dozes off
  stutter: number; // 0..1, glitchy irregularity of gait and timing
  edgeLove: number; // 0..1, pull toward the ends of the ground
};

export type Temperament = {
  name: TemperamentName;
  birthWeights: Record<BirthName, number>;
  deathWeights: Record<DeathName, number>;
  ticWeights: Record<TicName, number>;
  behavior: Behavior;
  speed: number; // duration multiplier (>1 = slower), clamped on the death path
  intensity: number; // extent multiplier — how far pixels travel
  ticFrequency: number; // relative tic rate (1 ≈ one tic per ~3s of idle)
  breathDepth: number; // breathing scale amplitude (0.03 = ±3%)
  blinkRate: number; // blink frequency multiplier
};
