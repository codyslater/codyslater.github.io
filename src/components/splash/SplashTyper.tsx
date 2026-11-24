"use client";

import { useEffect, useRef, useState } from "react";

interface Typo {
  position: number; // char index where the typo occurs
  wrong: string; // wrong character(s) typed
  probability?: number; // 0-1, default 1
}

interface SplashTyperProps {
  text: string;
  typos?: Typo[];
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
  /** Fires on every change of the typed text (a letter, the typo, its backspace). */
  onKeystroke?: () => void;
  startDelay?: number;
  /** The splash is leaving: show the whole name now, drop the cursor and type no more, so the name matches the nav screen's. */
  finish?: boolean;
}

const BLINKS = 3;
const BLINK_MS = 900;

/**
 * The name types in from its left edge. The caller reserves the final width, so nothing slides while it types.
 * The cursor is the name's green, cap height, about 0.55em wide, and goes after it has blinked three times.
 * It types at an uneven, human rhythm and makes and corrects the typos it is given.
 */
export function SplashTyper({ text, typos = [], onProgress, onComplete, onKeystroke, startDelay = 100, finish = false }: SplashTyperProps) {
  const [displayed, setDisplayed] = useState("");
  const [phase, setPhase] = useState<"typing" | "blink" | "gone">("typing");
  const cb = useRef({ onProgress, onComplete, onKeystroke });
  const finishRef = useRef(finish);
  useEffect(() => {
    cb.current = { onProgress, onComplete, onKeystroke };
    finishRef.current = finish;
  });

  useEffect(() => {
    type Action = { type: "type"; char: string; delay: number } | { type: "pause"; delay: number } | { type: "backspace"; delay: number };
    const delay = (char: string) => {
      const base = 45;
      const jitter = (Math.random() - 0.5) * 30;
      return char === "_" || char === " " ? base + jitter + 40 + Math.random() * 60 : base + jitter;
    };
    const actions: Action[] = [];
    const typoMap = new Map(typos.map((t) => [t.position, t]));
    for (let i = 0; i < text.length; i++) {
      const typo = typoMap.get(i);
      if (typo && Math.random() < (typo.probability ?? 1)) {
        for (const c of typo.wrong) actions.push({ type: "type", char: c, delay: delay(c) });
        actions.push({ type: "pause", delay: 120 + Math.random() * 80 });
        for (let j = 0; j < typo.wrong.length; j++) actions.push({ type: "backspace", delay: 60 });
        actions.push({ type: "pause", delay: 100 });
      }
      actions.push({ type: "type", char: text[i], delay: delay(text[i]) });
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let index = 0;
    let current = "";
    const next = () => {
      if (finishRef.current) return; // leaving: the render shows the whole name, nothing more to type
      if (index >= actions.length) {
        setPhase("blink");
        cb.current.onProgress?.(1);
        timers.push(setTimeout(() => cb.current.onComplete?.(), 100));
        timers.push(setTimeout(() => setPhase("gone"), BLINKS * BLINK_MS));
        return;
      }
      const a = actions[index++];
      if (a.type === "type") {
        current += a.char;
        setDisplayed(current);
        cb.current.onKeystroke?.();
        if (text.startsWith(current)) cb.current.onProgress?.(current.length / text.length);
      } else if (a.type === "backspace") {
        current = current.slice(0, -1);
        setDisplayed(current);
        cb.current.onKeystroke?.();
      }
      timers.push(setTimeout(next, a.delay));
    };
    timers.push(setTimeout(next, startDelay));
    return () => timers.forEach(clearTimeout);
    // the typo plan is rolled once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <>
      {finish ? text : displayed}
      {!finish && phase !== "gone" && (
        // An svg box, not a styled span: it is in the served page, so the cursor is the first thing a visitor sees,
        // and a browser counts a drawn svg as content (a colored box alone is not).
        <svg
          aria-hidden="true"
          viewBox="0 0 11 14"
          preserveAspectRatio="none"
          className="inline-block h-[0.72em] w-[0.55em] fill-accent-green align-baseline"
          style={phase === "blink" ? { animation: `blink ${BLINK_MS}ms step-end ${BLINKS} forwards` } : undefined}
        >
          <rect width="11" height="14" />
        </svg>
      )}
    </>
  );
}
