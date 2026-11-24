"use client";

import { useRef, useEffect } from "react";
import { GRID, PAD, UNITS } from "@/components/creature/geometry";
import { Stage, type Overrides } from "@/components/creature/stage";
import { usePrefersReducedMotion } from "@/components/creature/usePrefersReducedMotion";
import type { BirthName, DeathName, TemperamentName } from "@/components/creature/types";

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

// A creature that stays where it is: its own small canvas, with room around
// it for an ending. The nav screen's roaming creature is CreatureStage.
export function PixelCreature({
  seed, size = 80, melting = false, onDeathComplete, debugOverrides,
}: PixelCreatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const reduced = usePrefersReducedMotion();

  // latest values for effects that must not restart when they change
  const latest = useRef({ onDeathComplete, debugOverrides, reduced });
  useEffect(() => {
    latest.current = { onDeathComplete, debugOverrides, reduced };
  });

  // `size` is the creature's own display size; the padded canvas scales with it,
  // and negative margins keep the creature itself at the box's top-left.
  const fullDisplay = (size * UNITS) / GRID;
  const margin = -(size * PAD) / GRID;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new Stage(canvas, {
      contained: true,
      reduced: latest.current.reduced,
      onDeathComplete: () => latest.current.onDeathComplete?.(),
    });
    stageRef.current = stage;
    return () => {
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setReduced(reduced);
  }, [reduced]);

  // The birth animation plays on every seed change, the first included.
  useEffect(() => {
    const o: Overrides | undefined = latest.current.debugOverrides;
    stageRef.current?.spawn(seed, { overrides: o });
  }, [seed]);

  // The ending plays when `melting` turns on.
  useEffect(() => {
    if (!melting) return;
    stageRef.current?.kill({ overrides: latest.current.debugOverrides });
  }, [melting, seed]);

  return (
    <div style={{ width: size, height: size, overflow: "visible" }}>
      <canvas
        ref={canvasRef}
        width={UNITS * 8}
        height={UNITS * 8}
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
  );
}
