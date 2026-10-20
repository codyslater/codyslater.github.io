"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RealisticTyper } from "@/components/ui/RealisticTyper";
import { siteConfig } from "@/lib/constants";

// Adjacent keys on QWERTY for realistic typos
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
  // Fallback: random lowercase letter that isn't the correct one
  const letters = "abcdefghijklmnopqrstuvwxyz".replace(correct.toLowerCase(), "");
  return letters[Math.floor(Math.random() * letters.length)];
}

function generateRandomTypos() {
  const title = siteConfig.title; // "cody_slater"
  const underscoreIdx = title.indexOf("_");
  const afterUnderscore = underscoreIdx + 1; // first char of "slater"

  // Always include the "e" typo at position 3
  const typos: { position: number; wrong: string; probability: number }[] = [
    { position: 3, wrong: "e", probability: 1.0 },
  ];

  // Pick 1 random position after the underscore for a typo (~50% chance)
  const validPositions: number[] = [];
  for (let i = afterUnderscore; i < title.length; i++) {
    validPositions.push(i);
  }

  const pos1 = validPositions[Math.floor(Math.random() * validPositions.length)];
  typos.push({
    position: pos1,
    wrong: randomWrongChar(title[pos1]),
    probability: 0.5,
  });

  // ~10% chance of a second random typo after underscore (different position)
  if (Math.random() < 0.1) {
    const remaining = validPositions.filter((p) => p !== pos1);
    if (remaining.length > 0) {
      const pos2 = remaining[Math.floor(Math.random() * remaining.length)];
      typos.push({
        position: pos2,
        wrong: randomWrongChar(title[pos2]),
        probability: 1.0,
      });
    }
  }

  return typos;
}

interface HeroOverlayProps {
  onTypingProgress?: (progress: number) => void;
  onContinue?: () => void;
}

export function HeroOverlay({ onTypingProgress, onContinue }: HeroOverlayProps) {
  const [typingDone, setTypingDone] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const typosRef = useRef(generateRandomTypos());

  // Set in an effect so the first render matches the static HTML
  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const handleComplete = useCallback(() => {
    setTypingDone(true);
  }, []);

  const handleProgress = useCallback((progress: number) => {
    onTypingProgress?.(progress);
    // Show prompt once we've typed past the underscore (~45% through "cody_slater")
    if (progress >= 0.45 && !showPrompt) {
      setShowPrompt(true);
    }
  }, [onTypingProgress, showPrompt]);

  // Taps and drags belong to the graph, so only a scroll or an upward flick skips the intro.
  // A flick that starts on a node is a node drag (the canvas calls preventDefault), not a skip.
  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    const skip = () => onContinue?.();
    function handleWheel(e: WheelEvent) {
      if (e.deltaY > 0) skip();
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
      if (dy > 60 && dy > dx && e.timeStamp - start.t < 600) skip();
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
  }, [onContinue]);

  useEffect(() => {
    if (!showPrompt) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (["Enter", "ArrowDown", "PageDown"].includes(e.key) && document.activeElement?.tagName !== "INPUT") {
        onContinue?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPrompt, onContinue]);

  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center px-4 select-none pointer-events-none">
      <div className="text-center">
        {/* Name with realistic typing */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-mono font-bold text-accent-green tracking-tight">
          <RealisticTyper
            text={siteConfig.title}
            typos={typosRef.current}
            onProgress={handleProgress}
            onComplete={handleComplete}
            startDelay={100}
          />
        </h1>
      </div>

      {/* Press enter prompt pinned to bottom of screen */}
      <AnimatePresence>
        {showPrompt && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            onClick={() => onContinue?.()}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted text-xs font-mono cursor-pointer hover:text-secondary transition-colors pointer-events-auto"
            style={{ animation: "pulse-subtle 2s ease-in-out infinite" }}
          >
            <span>{coarse ? "swipe up or tap here" : "press enter to continue"}</span>
            <span className="text-base">&#x25BE;&#x25BE;&#x25BE;</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
