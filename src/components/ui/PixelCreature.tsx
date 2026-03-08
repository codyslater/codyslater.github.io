"use client";

import { useRef, useEffect, useState, useMemo } from "react";

const GRID = 12;
const HALF = 6;
const SCALE = 8;
const H_PAD = 5; // grid units of horizontal scatter padding
const V_PAD = 5; // grid units of vertical padding below (melt/build space)
const CANVAS_W = (GRID + H_PAD * 2) * SCALE;
const CANVAS_H = (GRID + V_PAD) * SCALE;

const THEME_COLORS = ["#ff2d78", "#39ff14", "#bf5af2", "#00e5ff", "#ff6a00"];

const ROW_PROB = [
  0.05, 0.15, 0.80, 0.85, 0.55, 0.95, 0.95, 0.90, 0.65, 0.55, 0.50, 0.45,
];

// --- Mulberry32 PRNG ---
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- BFS connectivity ---
function bfs(grid: (string | null)[][], startR: number, startC: number) {
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
function generateCreature(seed: number): (string | null)[][] {
  const rand = mulberry32(seed);
  const primary = THEME_COLORS[Math.floor(rand() * THEME_COLORS.length)];
  const eyeColor = "#f0f0f0";

  const grid: (string | null)[][] = Array.from({ length: GRID }, () =>
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

// --- Drawing ---
function drawGrid(ctx: CanvasRenderingContext2D, grid: (string | null)[][]) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c]) {
        ctx.fillStyle = grid[r][c]!;
        ctx.fillRect((c + H_PAD) * SCALE, r * SCALE, SCALE, SCALE);
      }
    }
  }
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

interface AnimPixel {
  r: number;
  c: number;
  color: string;
  vy: number;
  vx: number;
  delay: number;
  active: boolean;
  targetR?: number;
  targetC?: number;
  startR?: number;
  startC?: number;
  duration?: number;
}

// --- Component ---
interface PixelCreatureProps {
  seed: number;
  size?: number;
  melting?: boolean;
}

// Movement types: jump, wiggle, spin, tilt
const MOVEMENTS = ["jump", "wiggle", "spin", "tilt"] as const;
type Movement = (typeof MOVEMENTS)[number];

function getMovementStyle(movement: Movement, active: boolean): React.CSSProperties {
  if (!active) return { transform: "none", transition: "transform 0.2s ease-in" };
  switch (movement) {
    case "jump":
      return { animation: "creature-jump 0.35s ease-out" };
    case "wiggle":
      return { animation: "creature-wiggle 0.4s ease-in-out" };
    case "spin":
      return { animation: "creature-spin 0.45s ease-in-out" };
    case "tilt":
      return { animation: "creature-tilt 0.4s ease-in-out" };
  }
}

export function PixelCreature({ seed, size = 80, melting = false }: PixelCreatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<(string | null)[][] | null>(null);
  const rafRef = useRef(0);
  const animatingRef = useRef(false);
  const [moveActive, setMoveActive] = useState(false);

  // Deterministic movement type per seed
  const movement = useMemo<Movement>(() => {
    const rand = mulberry32(seed * 1301);
    return MOVEMENTS[Math.floor(rand() * MOVEMENTS.length)];
  }, [seed]);

  // Display sizes — creature portion = size, full canvas scales proportionally
  const fullDisplayW = size * (GRID + H_PAD * 2) / GRID;
  const fullDisplayH = size * (GRID + V_PAD) / GRID;

  // Build-up animation on every seed change (including first)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    animatingRef.current = false;

    const grid = generateCreature(seed);
    gridRef.current = grid;

    // Build animation: pixels fly in from scattered positions below + wider area
    animatingRef.current = true;
    const rand = mulberry32(seed * 3571);

    const pixels: AnimPixel[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (grid[r][c]) {
          const canvasC = c + H_PAD;
          pixels.push({
            r: 0,
            c: 0,
            color: grid[r][c]!,
            vy: 0,
            vx: 0,
            delay: (GRID - 1 - r) * 25 + rand() * 30,
            active: true,
            targetR: r,
            targetC: canvasC,
            startR: GRID + 1 + rand() * (V_PAD - 1),
            startC: rand() * (GRID + H_PAD * 2), // scattered across full width
            duration: 280 + rand() * 120,
          });
        }
      }
    }

    const startTime = performance.now();

    function animateBuild(now: number) {
      if (!animatingRef.current || !ctx) return;

      const elapsed = now - startTime;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      let allSettled = true;

      for (const p of pixels) {
        if (elapsed < p.delay) {
          allSettled = false;
          continue;
        }

        const t = Math.min(1, (elapsed - p.delay) / p.duration!);
        const e = easeOutCubic(t);
        const currentR = p.startR! + (p.targetR! - p.startR!) * e;
        const currentC = p.startC! + (p.targetC! - p.startC!) * e;

        if (t < 1) allSettled = false;

        ctx.fillStyle = p.color;
        ctx.fillRect(
          Math.round(currentC * SCALE),
          Math.round(currentR * SCALE),
          SCALE,
          SCALE
        );
      }

      if (allSettled) {
        drawGrid(ctx, grid);
        animatingRef.current = false;
        setMoveActive(true);
        setTimeout(() => setMoveActive(false), 500);
      } else {
        rafRef.current = requestAnimationFrame(animateBuild);
      }
    }

    rafRef.current = requestAnimationFrame(animateBuild);

    return () => {
      animatingRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [seed]);

  // Melt / scatter animation
  useEffect(() => {
    if (!melting || !gridRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    animatingRef.current = true;

    const grid = gridRef.current;
    const rand = mulberry32(seed * 7919);

    const pixels: AnimPixel[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (grid[r][c]) {
          pixels.push({
            r,
            c: c + H_PAD,
            color: grid[r][c]!,
            vy: 0,
            vx: (rand() - 0.5) * 0.6, // wider horizontal scatter
            delay: (GRID - 1 - r) * 25 + rand() * 30,
            active: true,
          });
        }
      }
    }

    const startTime = performance.now();

    function animateMelt(now: number) {
      if (!animatingRef.current || !ctx) return;

      const elapsed = now - startTime;
      let anyActive = false;

      for (const p of pixels) {
        if (!p.active) continue;
        if (elapsed < p.delay) {
          anyActive = true;
          continue;
        }
        p.vy += 0.2;
        p.r += p.vy;
        p.c += p.vx;

        if (p.r > GRID + V_PAD || p.c < -1 || p.c > GRID + H_PAD * 2 + 1) {
          p.active = false;
        } else {
          anyActive = true;
        }
      }

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      for (const p of pixels) {
        if (!p.active) continue;
        ctx.fillStyle = p.color;
        ctx.fillRect(
          Math.round(p.c * SCALE),
          Math.round(p.r * SCALE),
          SCALE,
          SCALE
        );
      }

      if (anyActive) {
        rafRef.current = requestAnimationFrame(animateMelt);
      } else {
        animatingRef.current = false;
      }
    }

    rafRef.current = requestAnimationFrame(animateMelt);

    return () => {
      animatingRef.current = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [melting, seed]);

  return (
    <div
      style={{
        width: size,
        height: size,
        overflow: "visible",
        ...getMovementStyle(movement, moveActive),
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          width: fullDisplayW,
          height: fullDisplayH,
          marginLeft: -(fullDisplayW - size) / 2,
          imageRendering: "pixelated",
          pointerEvents: "none",
        }}
        className="rounded-sm"
      />
    </div>
  );
}
