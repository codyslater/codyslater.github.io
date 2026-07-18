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
export function generateCreature(seed: number): Grid {
  const rand = mulberry32(seed);
  const primary = THEME_COLORS[Math.floor(rand() * THEME_COLORS.length)];
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

// Fixed eye coordinates in BODY-grid space (generateCreature always sets
// these to eyeColor). Idle blinking repaints exactly these cells.
export const EYE_CELLS: ReadonlyArray<readonly [number, number]> = [
  [2, 4], [3, 4], [2, 7], [3, 7],
];
