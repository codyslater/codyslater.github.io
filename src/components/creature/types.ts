export type Grid = (string | null)[][];
export type Rng = () => number;

// Per-pixel animation state. Styles own the semantics of the scratch
// fields (vr/vc/phase); the engine only reads r, c, color, alpha, done.
export type PixelAnim = {
  r: number; // current row, canvas grid units (includes PAD offset)
  c: number; // current col, canvas grid units
  color: string;
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
};

export type Style = {
  name: string;
  init(grid: Grid, rng: Rng, intensity: number): PixelAnim[];
  // elapsed is speed-scaled ms since start; return false when finished
  step(pixels: PixelAnim[], elapsed: number): boolean;
};

export type BirthName =
  | "fly-up" | "rain-down" | "implode-from-edges"
  | "spiral-vortex" | "glitch-in" | "spring-snap";
export type DeathName =
  | "gravity-scatter" | "explosion" | "evaporate"
  | "dust-drift" | "implode-to-point" | "glitch-out";
export type TemperamentName = "zippy" | "sleepy" | "glitchy" | "dramatic" | "gentle";
export type TicName = "jump" | "wiggle" | "spin" | "tilt" | "squash";

export type Temperament = {
  name: TemperamentName;
  birthWeights: Record<BirthName, number>;
  deathWeights: Record<DeathName, number>;
  ticWeights: Record<TicName, number>;
  speed: number; // duration multiplier (>1 = slower); capped on the death path
  intensity: number; // extent multiplier — how far pixels travel
  ticFrequency: number; // relative tic rate (1 ≈ one tic per ~3s of idle)
  breathDepth: number; // breathing scale amplitude (0.03 = ±3%)
  blinkRate: number; // blink frequency multiplier
};
