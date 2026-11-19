import { GRID } from "./geometry";
import type { Grid, Rng } from "./types";

const HALF = GRID / 2;

export const THEME_COLORS = ["#ff2d78", "#39ff14", "#bf5af2", "#00e5ff", "#ff6a00"];

const ROW_PROB = [
  0.05, 0.15, 0.80, 0.85, 0.55, 0.95, 0.95, 0.90, 0.65, 0.55, 0.50, 0.45,
];

// --- Mulberry32 PRNG ---
export function mulberry32(seed: number): Rng {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The body color a seed rolls (the first draw of its generator). The five
// field colors on the nav screen ARE the five theme colors, so a creature can
// be "born for" a field by stepping the seed until this lands on that color:
// no recoloring, and the seed handed to /soup stays the creature's own.
function primaryForSeed(seed: number): string {
  return THEME_COLORS[Math.floor(mulberry32(seed)() * THEME_COLORS.length)];
}

export function seedForColor(seed: number, color: string): number {
  if (!THEME_COLORS.includes(color)) return seed;
  let s = seed;
  while (primaryForSeed(s) !== color) s++;
  return s;
}

// --- BFS connectivity ---
function bfs(grid: Grid, startR: number, startC: number) {
  const visited = new Set<string>();
  const queue: [number, number][] = [[startR, startC]];
  visited.add(`${startR},${startC}`);
  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !visited.has(key) && grid[nr][nc]) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }
  return visited;
}

// --- Creature generation ---
function build(rand: Rng, primary: string): Grid {
  const eyeColor = "#f0f0f0";

  const grid: Grid = Array.from({ length: GRID }, () =>
    Array(GRID).fill(null)
  );

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < HALF; c++) {
      if (rand() < ROW_PROB[r]) {
        grid[r][c] = primary;
        grid[r][GRID - 1 - c] = primary;
      }
    }
  }

  // a cap of head above the eyes: they sit inside the body, never on its edge
  for (let c = 3; c <= GRID - 4; c++) grid[1][c] = primary;

  grid[2][4] = eyeColor;
  grid[3][4] = eyeColor;
  grid[2][7] = eyeColor;
  grid[3][7] = eyeColor;

  for (let r = 2; r <= 3; r++) {
    for (let c = 3; c <= 5; c++) {
      if (!grid[r][c]) {
        grid[r][c] = primary;
        grid[r][GRID - 1 - c] = primary;
      }
    }
  }

  for (let r = 2; r <= 9; r++) {
    grid[r][5] = grid[r][5] || primary;
    grid[r][6] = grid[r][6] || primary;
  }

  grid[9][2] = grid[9][2] || primary;
  grid[9][3] = grid[9][3] || primary;
  grid[9][GRID - 1 - 2] = grid[9][GRID - 1 - 2] || primary;
  grid[9][GRID - 1 - 3] = grid[9][GRID - 1 - 3] || primary;

  if (rand() < 0.6) {
    for (let r = 6; r <= 7; r++) {
      grid[r][0] = primary;
      grid[r][GRID - 1] = primary;
    }
  }

  for (let r = 10; r <= 11; r++) {
    grid[r][2] = primary;
    grid[r][3] = primary;
    grid[r][GRID - 1 - 2] = primary;
    grid[r][GRID - 1 - 3] = primary;
    grid[r][5] = null;
    grid[r][6] = null;
  }

  let startR = 6;
  let startC = 4;
  if (!grid[startR][startC]) {
    outer: for (let dr = 0; dr < GRID; dr++) {
      for (let dc = 0; dc < GRID; dc++) {
        if (grid[startR + dr]?.[startC + dc]) { startR += dr; startC += dc; break outer; }
        if (grid[startR - dr]?.[startC - dc]) { startR -= dr; startC -= dc; break outer; }
      }
    }
  }
  if (grid[startR]?.[startC]) {
    const connected = bfs(grid, startR, startC);
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (grid[r][c] && !connected.has(`${r},${c}`)) {
          grid[r][c] = null;
        }
      }
    }
  }

  return grid;
}

// What a body is judged on: enough of the 12x12 filled, few closed pockets (a
// box with holes), and at least two visible features outside the core: ears,
// arms or a tail, each more than a single cell.
function silhouetteStats(grid: Grid) {
  const at = (r: number, c: number) => !!grid[r]?.[c];
  let cells = 0;
  let pockets = 0;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c]) { cells++; continue; }
      if (r < 2 || r > 9 || c < 1 || c > GRID - 2) continue;
      const around = [at(r - 1, c), at(r + 1, c), at(r, c - 1), at(r, c + 1)].filter(Boolean).length;
      if (around >= 3) pockets++;
    }
  }
  // features: connected groups of cells outside the core (rows 1-9, columns 3-8), legs excluded
  const seen = new Set<string>();
  const feature = (r: number, c: number) => r >= 0 && r <= 9 && at(r, c) && (c <= 2 || c >= GRID - 3 || r === 0);
  let features = 0;
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!feature(r, c) || seen.has(`${r},${c}`)) continue;
      let size = 0;
      const stack: [number, number][] = [[r, c]];
      seen.add(`${r},${c}`);
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        size++;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (feature(nr, nc) && !seen.has(`${nr},${nc}`)) { seen.add(`${nr},${nc}`); stack.push([nr, nc]); }
        }
      }
      if (size >= 2) features++;
    }
  }
  // the trunk should be solid (a grille of holes reads as a box), and both feet on the ground
  let trunkEmpty = 0;
  for (let r = 2; r <= 9; r++) for (let c = 2; c <= 9; c++) if (!at(r, c)) trunkEmpty++;
  let feet = 0;
  for (let c = 0; c < GRID; c++) if (at(GRID - 1, c)) feet++;
  return { cells, pockets, features, trunkEmpty, feet, fill: cells / (GRID * GRID) };
}

// 0 = a body worth showing; more = worse (pockets, missing features, a fill outside the band).
const badness = (grid: Grid) => {
  const s = silhouetteStats(grid);
  return Math.max(0, s.pockets - 2) * 2 + Math.max(0, 2 - s.features) * 6
    + Math.max(0, s.trunkEmpty - 3) * 2 + (s.feet < 4 ? 20 : 0)
    + Math.max(0, 0.5 - s.fill) * 100 + Math.max(0, s.fill - 0.76) * 100;
};

// --- Creature generation ---
// The body color is the seed's first draw (see primaryForSeed). The shape is
// drawn from the same stream; a shape that is a box with holes, or has no ears,
// arms or tail, is redrawn (the same seed always settles on the same body).
export function generateCreature(seed: number): Grid {
  const rand = mulberry32(seed);
  const primary = THEME_COLORS[Math.floor(rand() * THEME_COLORS.length)];
  let best = build(rand, primary);
  let bestScore = badness(best);
  for (let attempt = 0; attempt < 40 && bestScore > 0; attempt++) {
    const g = build(rand, primary);
    const s = badness(g);
    if (s < bestScore) { best = g; bestScore = s; }
  }
  return best;
}

// Fixed eye coordinates in BODY-grid space (generateCreature always sets
// these to eyeColor). Idle blinking repaints exactly these cells.
export const EYE_CELLS: ReadonlyArray<readonly [number, number]> = [
  [2, 4], [3, 4], [2, 7], [3, 7],
];

// First and last filled column of the body, in body-grid units. Walking
// keeps this span, not the whole 12 columns, on the ground.
export function bodySpan(grid: Grid): { left: number; right: number } {
  let left = GRID;
  let right = -1;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c]) {
        if (c < left) left = c;
        if (c > right) right = c;
      }
    }
  }
  return left > right ? { left: 0, right: GRID - 1 } : { left, right };
}
