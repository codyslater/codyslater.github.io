"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SplashTyper } from "./SplashTyper";
import { siteConfig } from "@/lib/constants";
import { NAME_CLASS, NAME_GRID_CLASS } from "./nameLayout";

/** The one line under the name. */
export const TAGLINE = "prototyping executable biology";

// Adjacent keys on QWERTY, for realistic typos
const NEARBY_KEYS: Record<string, string[]> = {
  a: ["s", "q", "z"], b: ["v", "n", "g"], c: ["x", "v", "d"],
  d: ["s", "f", "e", "c"], e: ["w", "r", "d"], f: ["d", "g", "r", "v"],
  g: ["f", "h", "t", "b"], h: ["g", "j", "y", "n"], i: ["u", "o", "k"],
  j: ["h", "k", "u", "n"], k: ["j", "l", "i", "m"], l: ["k", "o", "p"],
  m: ["n", "k", "j"], n: ["b", "m", "h", "j"], o: ["i", "p", "l"],
  p: ["o", "l"], q: ["w", "a"], r: ["e", "t", "f"],
  s: ["a", "d", "w", "x"], t: ["r", "y", "g"], u: ["y", "i", "j"],
  v: ["c", "b", "f", "g"], w: ["q", "e", "s"], x: ["z", "c", "s"],
  y: ["t", "u", "h"], z: ["x", "a", "s"],
};

function randomWrongChar(correct: string): string {
  const nearby = NEARBY_KEYS[correct.toLowerCase()];
  if (nearby && nearby.length > 0) {
    return nearby[Math.floor(Math.random() * nearby.length)];
  }
  const letters = "abcdefghijklmnopqrstuvwxyz".replace(correct.toLowerCase(), "");
  return letters[Math.floor(Math.random() * letters.length)];
}

function generateRandomTypos() {
  const title = siteConfig.title; // "cody_slater"
  const afterUnderscore = title.indexOf("_") + 1;
  const typos: { position: number; wrong: string; probability: number }[] = [
    { position: 3, wrong: "e", probability: 1.0 },
  ];
  const validPositions: number[] = [];
  for (let i = afterUnderscore; i < title.length; i++) validPositions.push(i);
  const pos1 = validPositions[Math.floor(Math.random() * validPositions.length)];
  typos.push({ position: pos1, wrong: randomWrongChar(title[pos1]), probability: 0.5 });
  if (Math.random() < 0.1) {
    const remaining = validPositions.filter((p) => p !== pos1);
    if (remaining.length > 0) {
      const pos2 = remaining[Math.floor(Math.random() * remaining.length)];
      typos.push({ position: pos2, wrong: randomWrongChar(title[pos2]), probability: 1.0 });
    }
  }
  return typos;
}

interface SplashOverlayProps {
  onTypingProgress?: (progress: number) => void;
  /** Fires once when the name has finished typing (immediately under reduced motion). */
  onTypingDone?: () => void;
  /** Fires on every keystroke of the name: letters, the typo and its backspace. */
  onKeystroke?: () => void;
  onContinue?: () => void;
  /** The hand-off to the nav screen is running: finish the name, hide this layer from assistive tech and the pointer. */
  leaving?: boolean;
}

export function SplashOverlay({ onTypingProgress, onTypingDone, onKeystroke, onContinue, leaving = false }: SplashOverlayProps) {
  const [typingDone, setTypingDone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [typos] = useState(generateRandomTypos);
  const tagShown = typingDone || reduced;
  const promptShown = showPrompt || reduced;
  // Exits stay dormant until the name has typed past the underscore, so a stray scroll cannot skip it.
  const liveRef = useRef(false);
  const doneFiredRef = useRef(false);

  // Set in an effect so the first render matches the static HTML
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- matchMedia is unavailable during SSR */
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setReduced(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const fireDone = useCallback(() => {
    if (doneFiredRef.current) return;
    doneFiredRef.current = true;
    onTypingDone?.();
  }, [onTypingDone]);

  // Reduced motion: name and tagline show at once, no typing
  useEffect(() => {
    if (!reduced) return;
    liveRef.current = true;
    onTypingProgress?.(1);
    fireDone();
  }, [reduced, onTypingProgress, fireDone]);

  const handleComplete = useCallback(() => {
    setTypingDone(true);
    fireDone();
  }, [fireDone]);

  const handleProgress = useCallback(
    (progress: number) => {
      onTypingProgress?.(progress);
      // Show prompt once we've typed past the underscore (~45% through "cody_slater")
      if (progress >= 0.45 && !showPrompt) {
        liveRef.current = true;
        setShowPrompt(true);
      }
    },
    [onTypingProgress, showPrompt],
  );

  const go = useCallback(() => {
    if (liveRef.current) onContinue?.();
  }, [onContinue]);

  // Scroll down or flick up leaves; taps and drags belong to the graph.
  // A flick that starts on a node is a node drag (the canvas calls preventDefault), not a skip.
  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    function handleWheel(e: WheelEvent) {
      if (e.deltaY > 0) go();
    }
    function handleTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      start = e.defaultPrevented || e.touches.length !== 1 ? null : { x: t.clientX, y: t.clientY, t: e.timeStamp };
    }
    function handleTouchEnd(e: TouchEvent) {
      if (!start) return;
      const t = e.changedTouches[0];
      const dy = start.y - t.clientY;
      const dx = Math.abs(t.clientX - start.x);
      if (dy > 60 && dy > dx && e.timeStamp - start.t < 600) go();
      start = null;
    }
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [go]);

  useEffect(() => {
    if (!promptShown) return;
    function handleKeyDown(e: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (["Enter", "ArrowDown", "PageDown", " "].includes(e.key)) {
        if (e.key === " ") e.preventDefault();
        go();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [promptShown, go]);

  const promptText = coarse ? "tap to enter" : "press enter";

  return (
    // The same grid as the nav screen's section (see nameLayout.ts): 100vh tall, the name alone in the middle row, so its
    // box here is the box of the nav screen's h1. Do not add anything in flow to this grid: it would move the name.
    // `inert` + aria-hidden while leaving: the nav screen's h1 is then the only one in the accessibility tree.
    <div
      inert={leaving}
      aria-hidden={leaving || undefined}
      className={`fixed inset-x-0 top-0 z-10 h-screen select-none pointer-events-none ${NAME_GRID_CLASS}`}
    >
      <div className="relative row-start-2">
        {/* The measured block the canvas keeps clear: name + tagline. An empty probe, so it takes no part in the
            layout: the name's box plus the tagline's margin (0.75rem) and line (1rem, 1.25rem from sm) below it. */}
        <div
          aria-hidden="true"
          data-splash-quiet="name"
          className="pointer-events-none invisible absolute left-0 top-0 h-[calc(100%+1.75rem)] w-full sm:h-[calc(100%+2rem)]"
        />
        <h1 aria-label={siteConfig.title} className={`${NAME_CLASS} relative`}>
          {/* The final name is laid out invisibly, so the h1 is the final width and height, as on the nav screen. The
              typed text sits over it from the same left edge: nothing slides while it types. */}
          <span aria-hidden="true" className="invisible">
            {siteConfig.title}
          </span>
          <span aria-hidden="true" className="absolute left-0 top-0 whitespace-nowrap">
            {reduced ? (
              siteConfig.title
            ) : (
              <SplashTyper
                text={siteConfig.title}
                typos={typos}
                onProgress={handleProgress}
                onComplete={handleComplete}
                onKeystroke={onKeystroke}
                startDelay={100}
                finish={leaving}
              />
            )}
          </span>
          {/* The tap target floats over the name (at least 44 px) and adds nothing to the h1's box */}
          <button
            type="button"
            aria-label="continue to the site"
            onClick={go}
            className="pointer-events-auto absolute left-1/2 top-1/2 h-full min-h-11 w-[calc(100%+1rem)] min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent-green/60"
          />
        </h1>
        {/* In the DOM from the first render; hidden only while JS is about to type. No-JS and reduced motion show it.
            It hangs under the name out of flow (the name stays on the center line). */}
        <p
          className={`splash-tagline absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-center text-xs sm:text-sm text-[#a8a8a8] font-mono transition-opacity duration-700 motion-reduce:opacity-100 ${tagShown ? "opacity-100" : "opacity-0"}`}
        >
          {TAGLINE}
        </p>
      </div>

      {/* Invisible twin of the prompt, always laid out, so the quiet zone is known before it appears */}
      <div
        aria-hidden="true"
        data-splash-quiet="prompt"
        className="invisible fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center justify-center whitespace-nowrap px-8 py-3 min-h-11 text-xs font-mono"
      >
        <span>{promptText}</span>
      </div>

      <AnimatePresence>
        {/* the prompt stays fully hidden (opacity 0, not even in the tab order) until the name has finished typing */}
        {tagShown && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            onClick={go}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center justify-center whitespace-nowrap px-8 py-3 min-h-11 text-[#8f8f8f] text-xs font-mono cursor-pointer hover:text-[#c0c0c0] transition-colors pointer-events-auto"
          >
            <span>{promptText}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
