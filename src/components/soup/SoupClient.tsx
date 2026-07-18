"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/creature/usePrefersReducedMotion";
import { render } from "./render";
import { SoupDebugPanel } from "./SoupDebugPanel";
import { TimeSlider } from "./TimeSlider";
import { CELL_PX, DEBUG_SHOWER_COUNT } from "./sim/rules";
import { startMutation } from "./sim/clusters";
import { createWorld, resizeWorld, spawnShower, stepWorld } from "./sim/world";
import type { World } from "./sim/types";
import type { Trait } from "./sim/types";

const FIXED_DT = 1 / 120;
const MAX_STEPS_PER_FRAME = 50; // over-budget frames drop sim time
const MAX_FRAME_DELTA = 0.1; // s — hidden-tab return gets no catch-up

export function SoupClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduced = usePrefersReducedMotion();

  const seedParam = searchParams.get("seed");
  // Lazy useState initializer (not useRef's arg, which re-evaluates every
  // render) is the sanctioned one-time-impure-call spot under the
  // react-hooks/purity rule — Date.now() must not run on every render.
  const [initialSeed] = useState(() =>
    seedParam ? Number(seedParam) | 0 : Date.now() & 0x7fffffff,
  );
  const seedRef = useRef(initialSeed);

  // reduced motion: same behavior, calmer default speed
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way ratchet on OS preference change; the matchMedia subscription lives in usePrefersReducedMotion
    if (reduced) setSpeed(0.5);
  }, [reduced]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const scale = CELL_PX * dpr;

    function resize() {
      if (!canvas) return;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const wCells = Math.ceil(canvas.width / scale);
      const hCells = Math.ceil(canvas.height / scale);
      if (worldRef.current) resizeWorld(worldRef.current, wCells, hCells);
      else worldRef.current = createWorld(seedRef.current, wCells, hCells);
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const w = worldRef.current;
      if (w) {
        let delta = (now - last) / 1000;
        if (!Number.isFinite(delta) || delta < 0) delta = 0;
        if (delta > MAX_FRAME_DELTA) delta = MAX_FRAME_DELTA;
        acc += delta * speedRef.current;
        let steps = 0;
        while (acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
          stepWorld(w, FIXED_DT);
          acc -= FIXED_DT;
          steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) acc = 0; // drop excess sim time
        render(ctx, w, scale);
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Dev-only pump so a hidden (rAF-throttled) automation tab can still be
    // advanced and screenshotted for visual QA. No-op in production bundles.
    if (process.env.NODE_ENV === "development") {
      const dev = window as unknown as {
        __soupPump?: (n: number) => void;
        __soupWorld?: () => World | null;
      };
      dev.__soupPump = (n: number) => {
        const w = worldRef.current;
        if (!w) return;
        for (let s = 0; s < n; s++) stepWorld(w, FIXED_DT);
        render(ctx, w, scale);
      };
      dev.__soupWorld = () => worldRef.current;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/?skip=1");
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      if (process.env.NODE_ENV === "development") {
        const dev = window as unknown as {
          __soupPump?: unknown;
          __soupWorld?: unknown;
        };
        delete dev.__soupPump;
        delete dev.__soupWorld;
      }
    };
  }, [router]);

  const getWorld = useCallback(() => worldRef.current, []);
  const onShower = useCallback(() => {
    if (worldRef.current) spawnShower(worldRef.current, DEBUG_SHOWER_COUNT);
  }, []);
  const onExtinction = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    // matter is moved, not destroyed: crediting the wipe to the deep reserve
    // keeps the conservation readout honest and gives the eruption fallback
    // a reservoir to reseed from
    let wiped = w.pixels.length + w.detritus.length;
    for (const cl of w.clusters) wiped += cl.cells.size;
    w.reserve += wiped;
    w.pixels.length = 0;
    w.clusters.length = 0;
    w.detritus.length = 0;
  }, []);
  const onMutate = useCallback(() => {
    const w = worldRef.current;
    if (!w || w.clusters.length === 0) return;
    let biggest = w.clusters[0];
    for (const cl of w.clusters) if (cl.cells.size > biggest.cells.size) biggest = cl;
    const options: Trait[] = ["legs", "arms", "lift", "dig"];
    const t = options.find((o) => !biggest.traits.has(o));
    if (t) startMutation(w, biggest, t);
  }, []);
  const onSpeed = useCallback((s: number) => {
    setSpeed(s);
  }, []);

  return (
    <div className="fixed inset-0 bg-black">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ imageRendering: "pixelated" }}
      />
      <TimeSlider speed={speed} onSpeed={setSpeed} />
      {process.env.NODE_ENV === "development" && (
        <SoupDebugPanel
          getWorld={getWorld}
          onShower={onShower}
          onExtinction={onExtinction}
          onMutate={onMutate}
          onSpeed={onSpeed}
        />
      )}
    </div>
  );
}
