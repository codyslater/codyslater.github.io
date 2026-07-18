"use client";

import { useRef, useEffect, useState } from "react";
import { GRID, PAD, UNITS, CANVAS_W, CANVAS_H } from "@/components/creature/geometry";
import { mulberry32, generateCreature } from "@/components/creature/generation";
import { drawGrid, runStyle, type RunHandle } from "@/components/creature/engine";
import { BIRTHS, DEATHS } from "@/components/creature/styles";
import { fadeIn, fadeOut } from "@/components/creature/styles/fades";
import { useIdleLife } from "@/components/creature/useIdleLife";
import { usePrefersReducedMotion } from "@/components/creature/usePrefersReducedMotion";
import {
  DEATH_CAP_MS, TEMPERAMENTS, deathSpeed, temperamentForSeed, weightedPick,
} from "@/components/creature/temperaments";
import type {
  BirthName, DeathName, Grid, TemperamentName, TicName,
} from "@/components/creature/types";

// --- Component ---
export type CreatureDebugOverrides = {
  temperament?: TemperamentName;
  birth?: BirthName;
  death?: DeathName;
};

interface PixelCreatureProps {
  seed: number;
  size?: number;
  melting?: boolean;
  onDeathComplete?: () => void;
  debugOverrides?: CreatureDebugOverrides;
}

const TIC_ANIMS: Record<TicName, string> = {
  jump: "creature-jump 0.35s ease-out",
  wiggle: "creature-wiggle 0.4s ease-in-out",
  spin: "creature-spin 0.45s ease-in-out",
  tilt: "creature-tilt 0.4s ease-in-out",
  squash: "creature-squash 0.45s ease-in-out",
};

export function PixelCreature({
  seed, size = 80, melting = false, onDeathComplete, debugOverrides,
}: PixelCreatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const handleRef = useRef<RunHandle | null>(null);
  const [idle, setIdle] = useState(false);

  const temperament = debugOverrides?.temperament
    ? TEMPERAMENTS[debugOverrides.temperament]
    : temperamentForSeed(seed);

  const reduced = usePrefersReducedMotion();

  // ref-stabilized like CyclingTagline's callbacks — must not restart effects
  const onDeathCompleteRef = useRef(onDeathComplete);
  onDeathCompleteRef.current = onDeathComplete;
  const overridesRef = useRef(debugOverrides);
  overridesRef.current = debugOverrides;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  // Display size — creature portion = size, full (padded) canvas scales
  // proportionally; negative margins pull it back to the same visible
  // position it held before padding was added.
  const fullDisplay = (size * UNITS) / GRID;
  const margin = -(size * PAD) / GRID;

  // Build-up animation on every seed change (including first)
  useEffect(() => {
    setIdle(false);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    handleRef.current?.cancel();
    const grid = generateCreature(seed);
    gridRef.current = grid;
    const t = overridesRef.current?.temperament
      ? TEMPERAMENTS[overridesRef.current.temperament]
      : temperamentForSeed(seed);
    const rng = mulberry32(seed * 3571);
    const birthName = overridesRef.current?.birth ?? weightedPick(rng, t.birthWeights);
    const style = reducedRef.current ? fadeIn : BIRTHS[birthName];
    handleRef.current = runStyle(
      ctx, style, grid, rng,
      { intensity: t.intensity, speed: t.speed },
      () => {
        drawGrid(ctx, grid);
        setIdle(true);
      },
    );
    return () => handleRef.current?.cancel();
  }, [seed]);

  // Melt / scatter animation
  useEffect(() => {
    if (!melting || !gridRef.current) return;
    setIdle(false);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    handleRef.current?.cancel();
    const grid = gridRef.current;
    const t = overridesRef.current?.temperament
      ? TEMPERAMENTS[overridesRef.current.temperament]
      : temperamentForSeed(seed);
    const rng = mulberry32(seed * 7919);
    const deathName = overridesRef.current?.death ?? weightedPick(rng, t.deathWeights);
    const style = reducedRef.current ? fadeOut : DEATHS[deathName];
    handleRef.current = runStyle(
      ctx, style, grid, rng,
      { intensity: t.intensity, speed: deathSpeed(t.speed), maxMs: DEATH_CAP_MS },
      () => onDeathCompleteRef.current?.(),
    );
    return () => handleRef.current?.cancel();
  }, [melting, seed]);

  const { tic, breathStyle } = useIdleLife({
    active: idle && !melting, seed, temperament, reduced, canvasRef, gridRef,
  });

  return (
    <div style={{ width: size, height: size, overflow: "visible", ...breathStyle }}>
      <div style={tic ? { animation: TIC_ANIMS[tic] } : undefined}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          aria-hidden="true"
          style={{
            width: fullDisplay,
            height: fullDisplay,
            marginLeft: margin,
            marginTop: margin,
            imageRendering: "pixelated",
            pointerEvents: "none",
          }}
          className="rounded-sm"
        />
      </div>
    </div>
  );
}
