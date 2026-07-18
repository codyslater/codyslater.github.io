"use client";

import { useEffect, useState } from "react";
import { monoFraction, symmetryScore } from "./sim/clusters";
import { FOSSIL, ROCK } from "./sim/rules";
import { matterOf } from "./sim/world";
import type { World } from "./sim/types";

interface SoupDebugPanelProps {
  getWorld: () => World | null;
  onShower: () => void;
  onExtinction: () => void;
  onMutate: () => void;
  onSpeed: (s: number) => void;
}

type Snapshot = {
  epoch: number;
  pixels: number;
  clusters: number;
  time: number;
  detritus: number;
  ore: number;
  reserve: number;
  fossil: number;
  veins: number;
  matter: number;
  matterNow: number;
  diggers: number;
  largest: { size: number; traits: string; formed: boolean; sym: string; mono: string } | null;
  profiles: string;
};

// Dev-only tuning instrument. The NODE_ENV guard at the call site makes
// this dead code in production bundles.
export function SoupDebugPanel({ getWorld, onShower, onExtinction, onMutate, onSpeed }: SoupDebugPanelProps) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const w = getWorld();
      if (!w) return;
      let largest = null;
      let largestCl = null;
      for (const cl of w.clusters) {
        if (!largestCl || cl.cells.size > largestCl.cells.size) largestCl = cl;
      }
      if (largestCl) {
        largest = {
          size: largestCl.cells.size,
          traits: [...largestCl.traits].join(",") || "-",
          formed: largestCl.formed,
          sym: symmetryScore(largestCl).toFixed(2),
          mono: monoFraction(largestCl).toFixed(2),
        };
      }
      let ore = 0;
      let fossilCells = 0;
      for (const v of w.substrate.values()) {
        if (v === FOSSIL) fossilCells++;
        else if (v !== ROCK) ore++;
      }
      let diggers = 0;
      for (const cl of w.clusters) if (cl.digging) diggers++;
      setSnap({
        epoch: w.epoch,
        pixels: w.pixels.length,
        clusters: w.clusters.length,
        time: Math.round(w.time),
        detritus: w.detritus.length,
        ore,
        reserve: w.reserve,
        fossil: fossilCells + w.fossil,
        veins: w.veins.length,
        matter: w.matter,
        matterNow: matterOf(w),
        diggers,
        largest,
        profiles: w.profiles
          .map((p) => `w${p.weight.toFixed(1)} s${p.stickiness.toFixed(1)} v${p.volatility.toFixed(1)}`)
          .join(" | "),
      });
    }, 250);
    return () => clearInterval(id);
  }, [getWorld]);

  const btn = "border border-border rounded px-2 py-0.5 hover:text-foreground";

  return (
    <div className="fixed top-2 left-2 z-50 p-3 border border-dashed border-border rounded font-mono text-xs text-secondary bg-black/70 flex flex-col gap-2 max-w-md">
      <span className="text-accent-green">[soup debug]</span>
      {snap && (
        <>
          <span>
            epoch {snap.epoch} · t={snap.time}s · pixels {snap.pixels} · clusters {snap.clusters} · diggers {snap.diggers}
          </span>
          <span>
            matter {snap.matterNow}/{snap.matter}
            {snap.matterNow !== snap.matter ? " ⚠" : " ✓"} · soup {snap.pixels} · ore {snap.ore} · reserve {snap.reserve} · fossil {snap.fossil} · veins {snap.veins} · detritus {snap.detritus}
          </span>
          <span>
            largest: {snap.largest ? `${snap.largest.size}px sym=${snap.largest.sym} mono=${snap.largest.mono} traits=${snap.largest.traits} formed=${String(snap.largest.formed)}` : "none"}
          </span>
          <span className="text-muted break-all">{snap.profiles}</span>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={onShower}>shower</button>
        <button type="button" className={btn} onClick={onMutate}>mutate</button>
        <button type="button" className={btn} onClick={onExtinction}>extinction</button>
        <button type="button" className={btn} onClick={() => onSpeed(1)}>×1</button>
        <button type="button" className={btn} onClick={() => onSpeed(8)}>×8</button>
      </div>
    </div>
  );
}
