import type { Grid } from "./types";

// The creature's colors. One body color per creature (a field color); every
// other tone is made from it, so a shaded body works for any seed and any tint.

export const EYE_COLOR = "#f0f0f0";
export const PUPIL_COLOR = "#0e1030";
// the eye cells of a generated body: two columns, two rows (see generation.ts)
const EYE_SPOTS = [[2, 4], [3, 4], [2, 7], [3, 7]] as const;

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return `#${toHex(ar + (br - ar) * k)}${toHex(ag + (bg - ag) * k)}${toHex(ab + (bb - ab) * k)}`;
}

export const darker = (hex: string, t = 0.3) => mix(hex, "#000000", t);
export const lighter = (hex: string, t = 0.35) => mix(hex, "#ffffff", t);

// The body's own color, whatever shading is on top: of the tones present (one
// up, its own, one down) the middle one by brightness.
export function bodyColor(grid: Grid): string {
  const tones = new Set<string>();
  for (const row of grid) {
    for (const c of row) {
      if (c && c !== EYE_COLOR && c !== PUPIL_COLOR) tones.add(c);
    }
  }
  const lum = (hex: string) => {
    const [r, g, b] = channels(hex);
    return 0.3 * r + 0.59 * g + 0.11 * b;
  };
  const sorted = [...tones].sort((a, b) => lum(a) - lum(b));
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : "#39ff14";
}

// The resting look: a flat body in its one bright color (no edge shading: it
// dulled the pixel art), and an eye with a dark pupil under a white lid, all
// inside the body. Every ending and every birth is given this grid, so they
// start and end on exactly the sprite that stands there.
export function shadeGrid(raw: Grid): Grid {
  const out: Grid = raw.map((row) => row.slice());
  // eyes: white above, pupil below
  for (const [er, ec] of EYE_SPOTS) out[er][ec] = er === 2 ? EYE_COLOR : PUPIL_COLOR;
  return out;
}
