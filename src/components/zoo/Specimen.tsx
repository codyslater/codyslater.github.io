"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PixelCreature, type CreatureDebugOverrides,
} from "@/components/ui/PixelCreature";
import { temperamentForSeed } from "@/components/creature/temperaments";
import { makeBinomial } from "./binomial";

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

interface SpecimenProps {
  initialSeed: number;
  killSignal: number; // increments to schedule an external death (extinction)
  killDelay: number; // ms stagger within an extinction cascade
  debugOverrides?: CreatureDebugOverrides;
}

export function Specimen({
  initialSeed, killSignal, killDelay, debugOverrides,
}: SpecimenProps) {
  const [seed, setSeed] = useState(initialSeed);
  const [melting, setMelting] = useState(false);

  // Parent key changes normally remount us on reroll; this reset is a
  // safety net in case the key coupling ever changes.
  useEffect(() => { setSeed(initialSeed); setMelting(false); }, [initialSeed]);

  useEffect(() => {
    if (killSignal === 0) return;
    const t = setTimeout(() => setMelting(true), killDelay);
    return () => clearTimeout(t);
  }, [killSignal, killDelay]);

  const handleDeathComplete = useCallback(() => {
    setMelting(false);
    setSeed(newSeed());
  }, []);

  const temperament = debugOverrides?.temperament ?? temperamentForSeed(seed).name;
  const name = makeBinomial(seed, temperament);

  return (
    <button
      type="button"
      onClick={() => setMelting(true)}
      aria-label={`${name} — click to observe extinction`}
      className="group flex flex-col items-center gap-3 p-4 border border-border rounded bg-surface hover:border-accent-green/40 transition-colors cursor-pointer"
    >
      <div className="h-24 flex items-end justify-center">
        <PixelCreature
          seed={seed}
          size={72}
          melting={melting}
          onDeathComplete={handleDeathComplete}
          debugOverrides={debugOverrides}
        />
      </div>
      <div className="font-mono text-center">
        <p className="text-xs italic text-foreground">{name}</p>
        <p className="text-[10px] text-muted">
          {temperament} · 0x{seed.toString(16)}
        </p>
      </div>
    </button>
  );
}
