"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { drawGrid } from "./engine";
import { EYE_CELLS, mulberry32 } from "./generation";
import { weightedPick } from "./temperaments";
import { PAD, SCALE } from "./geometry";
import type { Grid, Temperament, TicName } from "./types";

const BLINK_MS = 110;
const TIC_ANIM_MS = 500;

type IdleOpts = {
  active: boolean; // true only between birth completion and death start
  seed: number;
  temperament: Temperament;
  reduced: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  gridRef: RefObject<Grid | null>;
};

export function useIdleLife({
  active, seed, temperament, reduced, canvasRef, gridRef,
}: IdleOpts): { tic: TicName | null; breathStyle: CSSProperties } {
  const [tic, setTic] = useState<TicName | null>(null);

  // Blinking — retained under reduced motion (small, non-motion).
  useEffect(() => {
    if (!active) return;
    const rng = mulberry32(seed * 6151);
    let timer: ReturnType<typeof setTimeout>;
    let restore: ReturnType<typeof setTimeout>;

    const blink = () => {
      const ctx = canvasRef.current?.getContext("2d");
      const grid = gridRef.current;
      if (ctx && grid) {
        // eyelid = any guaranteed body pixel's color (generation always
        // fills [2][3]); fall back to first non-null cell
        const lid = grid[2]?.[3] ?? grid.flat().find((c) => c) ?? "#39ff14";
        for (const [r, c] of EYE_CELLS) {
          ctx.fillStyle = lid;
          ctx.fillRect((c + PAD) * SCALE, (r + PAD) * SCALE, SCALE, SCALE);
        }
        restore = setTimeout(() => {
          const g = gridRef.current;
          if (g) drawGrid(ctx, g);
        }, BLINK_MS);
      }
      timer = setTimeout(blink, (1400 + rng() * 3800) / temperament.blinkRate);
    };
    timer = setTimeout(blink, (1400 + rng() * 3800) / temperament.blinkRate);
    return () => {
      clearTimeout(timer);
      clearTimeout(restore);
      const ctx = canvasRef.current?.getContext("2d");
      const g = gridRef.current;
      if (ctx && g) drawGrid(ctx, g);
    };
  }, [active, seed, temperament, canvasRef, gridRef]);

  // Tics — temperament-weighted choice on a randomized timer; the first
  // beat ~150 ms after birth is the celebratory tic. Off under reduced motion.
  useEffect(() => {
    if (!active || reduced) return;
    const rng = mulberry32(seed * 8887);
    let timer: ReturnType<typeof setTimeout>;
    let clear: ReturnType<typeof setTimeout>;

    const fire = () => {
      clearTimeout(clear);
      setTic(weightedPick(rng, temperament.ticWeights));
      clear = setTimeout(() => setTic(null), TIC_ANIM_MS);
      // glitchy gets wildly irregular gaps; everyone else mild jitter
      const spread = temperament.name === "glitchy" ? 0.15 + rng() * 2.2 : 0.6 + rng() * 0.8;
      // Minimum gap ensures the previous tic has always cleared to null
      // before the next fire, so CSS animation restarts even on a repeat.
      timer = setTimeout(fire, Math.max(TIC_ANIM_MS + 100, (3000 / temperament.ticFrequency) * spread));
    };
    timer = setTimeout(fire, 150);
    return () => { clearTimeout(timer); clearTimeout(clear); setTic(null); };
  }, [active, reduced, seed, temperament]);

  const breathStyle: CSSProperties =
    active && !reduced
      ? {
          animation: `creature-breathe ${(3.2 * temperament.speed).toFixed(2)}s ease-in-out infinite`,
          ["--breath-scale" as string]: `${1 + temperament.breathDepth}`,
          transformOrigin: "50% 85%",
        }
      : {};

  return { tic, breathStyle };
}
