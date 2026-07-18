"use client";

import { useCallback, useEffect, useState } from "react";
import type { CreatureDebugOverrides } from "@/components/ui/PixelCreature";
import { Specimen } from "./Specimen";
import { ZooDebugPanel } from "./ZooDebugPanel";

const SPECIMEN_COUNT = 12;
const newSeeds = () =>
  Array.from({ length: SPECIMEN_COUNT }, () => Math.floor(Math.random() * 2 ** 31));

export function ZooClient() {
  // Seeds produce visible label text — generate client-side only so
  // prerendered HTML never disagrees with the hydrated render.
  const [seeds, setSeeds] = useState<number[] | null>(null);
  const [killSignal, setKillSignal] = useState(0);
  const [overrides, setOverrides] = useState<CreatureDebugOverrides>({});

  useEffect(() => { setSeeds(newSeeds()); }, []);

  const extinction = useCallback(() => setKillSignal((k) => k + 1), []);
  const rerollAll = useCallback(() => {
    setKillSignal(0);
    setSeeds(newSeeds());
  }, []);

  return (
    <div className="min-h-screen pt-20 pb-20 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-mono font-bold text-foreground mb-2">zoo</h1>
        <p className="font-mono text-sm text-muted mb-8">
          specimen collection · handle with care
        </p>

        {process.env.NODE_ENV === "development" && (
          <ZooDebugPanel value={overrides} onChange={setOverrides} onReroll={rerollAll} />
        )}

        {seeds && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {seeds.map((seed, i) => (
              <Specimen
                key={`${i}-${seed}`}
                initialSeed={seed}
                killSignal={killSignal}
                killDelay={i * 110}
                debugOverrides={overrides}
              />
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={extinction}
            className="font-mono text-sm px-4 py-2 border border-border rounded text-secondary cursor-pointer hover:text-accent-pink hover:border-accent-pink/50 hover:bg-accent-pink/5 glow-hover transition-all duration-200"
          >
            EXTINCTION EVENT
          </button>
        </div>
      </div>
    </div>
  );
}
