"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BlinkingCursor } from "./BlinkingCursor";

interface Typo {
  position: number; // char index where typo occurs
  wrong: string; // wrong character(s) typed
  probability?: number; // 0-1, default 1.0 (always)
}

interface RealisticTyperProps {
  text: string;
  typos?: Typo[];
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
  className?: string;
  startDelay?: number;
}

export function RealisticTyper({
  text,
  typos = [],
  onProgress,
  onComplete,
  className = "",
  startDelay = 300,
}: RealisticTyperProps) {
  const [displayed, setDisplayed] = useState("");
  const [cursorBlinking, setCursorBlinking] = useState(true);
  const [done, setDone] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctCharsRef = useRef(0); // how many correct chars have been committed

  const getDelay = useCallback((charIndex: number, char: string): number => {
    const base = 45;
    const jitter = (Math.random() - 0.5) * 30; // ±15ms

    if (char === "_" || char === " ") {
      return base + jitter + 40 + Math.random() * 60;
    }

    return base + jitter;
  }, []);

  useEffect(() => {
    // Build the sequence of actions
    type Action =
      | { type: "type"; char: string; delay: number }
      | { type: "pause"; delay: number }
      | { type: "backspace"; delay: number };

    const actions: Action[] = [];
    const typoMap = new Map(typos.map((t) => [t.position, t]));

    for (let i = 0; i < text.length; i++) {
      const typo = typoMap.get(i);
      if (typo && Math.random() < (typo.probability ?? 1)) {
        // Type wrong character(s)
        for (const c of typo.wrong) {
          actions.push({ type: "type", char: c, delay: getDelay(i, c) });
        }
        // Pause (realizing mistake)
        actions.push({ type: "pause", delay: 120 + Math.random() * 80 });
        // Backspace wrong characters
        for (let j = 0; j < typo.wrong.length; j++) {
          actions.push({ type: "backspace", delay: 60 });
        }
        // Short pause before correction
        actions.push({ type: "pause", delay: 100 });
      }
      // Type correct character
      actions.push({ type: "type", char: text[i], delay: getDelay(i, text[i]) });
    }

    let actionIndex = 0;
    let current = "";
    let correctCount = 0;

    function executeNext() {
      if (actionIndex >= actions.length) {
        // Done typing
        setCursorBlinking(true);
        setDone(true);
        onProgress?.(1);
        // Short delay then fire onComplete
        timeoutRef.current = setTimeout(() => {
          onComplete?.();
        }, 100);
        return;
      }

      const action = actions[actionIndex];
      actionIndex++;
      setCursorBlinking(false);

      switch (action.type) {
        case "type":
          current = current + action.char;
          setDisplayed(current);
          // Check if this matches the correct text so far
          if (text.startsWith(current)) {
            correctCount = current.length;
            correctCharsRef.current = correctCount;
            onProgress?.(correctCount / text.length);
          }
          break;
        case "backspace":
          current = current.slice(0, -1);
          setDisplayed(current);
          break;
        case "pause":
          // Just wait
          break;
      }

      timeoutRef.current = setTimeout(executeNext, action.delay);
    }

    // Start after initial delay
    timeoutRef.current = setTimeout(() => {
      executeNext();
    }, startDelay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span className={className}>
      {displayed}
      <BlinkingCursor
        className={`${cursorBlinking ? "" : "!animate-none !opacity-100"} ${done ? "" : ""}`}
      />
    </span>
  );
}
