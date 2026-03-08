"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BlinkingCursor } from "./BlinkingCursor";

const WORDS = [
  "engineer",
  "scientist",
  "medical student",
  "thinker",
  "curious",
  "dreamer",
  "committed to helping humanity thrive",
];

const DIRS = ["about", "projects", "publications", "writing"];
const DIR_HREFS: Record<string, string> = {
  about: "/about",
  projects: "/projects",
  publications: "https://scholar.google.com/citations?user=2iMWaGAAAAAJ&hl=en",
  writing: "#",
};

const TYPE_SPEED = 70;
const DELETE_SPEED = 40;
const PAUSE_AFTER_TYPE = 1500;
const PAUSE_AFTER_DELETE = 300;
const MELT_LEAD = 500; // ms before word transition to fire melt

interface CyclingTaglineProps {
  onWordChange?: () => void;
  onDeletingStart?: () => void;
}

export function CyclingTagline({ onWordChange, onDeletingStart }: CyclingTaglineProps) {
  const [displayed, setDisplayed] = useState("");
  const [cursorBlinking, setCursorBlinking] = useState(true);
  const [interactive, setInteractive] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meltTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Stable refs for callbacks — avoids restarting the cycling effect
  const onWordChangeRef = useRef(onWordChange);
  onWordChangeRef.current = onWordChange;
  const onDeletingStartRef = useRef(onDeletingStart);
  onDeletingStartRef.current = onDeletingStart;

  // Cycling animation
  useEffect(() => {
    if (interactive) return;

    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const word = WORDS[wordIndex];

      if (!isDeleting) {
        charIndex++;
        setDisplayed(word.slice(0, charIndex));
        setCursorBlinking(false);

        if (charIndex === word.length) {
          setCursorBlinking(true);
          const isLast = wordIndex === WORDS.length - 1;

          // Fire melt MELT_LEAD ms before the word transitions
          if (meltTimeoutRef.current) clearTimeout(meltTimeoutRef.current);
          meltTimeoutRef.current = setTimeout(() => {
            if (!cancelled) onDeletingStartRef.current?.();
          }, PAUSE_AFTER_TYPE - MELT_LEAD);

          timeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            if (isLast) {
              charIndex = 0;
              setDisplayed("");
              wordIndex = 0;
              onWordChangeRef.current?.();
              timeoutRef.current = setTimeout(tick, PAUSE_AFTER_DELETE);
            } else {
              isDeleting = true;
              tick();
            }
          }, PAUSE_AFTER_TYPE);
          return;
        }

        const jitter = (Math.random() - 0.5) * 40;
        timeoutRef.current = setTimeout(tick, TYPE_SPEED + jitter);
      } else {
        charIndex--;
        setDisplayed(word.slice(0, charIndex));
        setCursorBlinking(false);

        if (charIndex === 0) {
          isDeleting = false;
          wordIndex = (wordIndex + 1) % WORDS.length;
          onWordChangeRef.current?.();
          timeoutRef.current = setTimeout(tick, PAUSE_AFTER_DELETE);
          return;
        }

        timeoutRef.current = setTimeout(tick, DELETE_SPEED);
      }
    }

    timeoutRef.current = setTimeout(tick, 600);

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (meltTimeoutRef.current) clearTimeout(meltTimeoutRef.current);
    };
  }, [interactive]);

  const handleClick = useCallback(() => {
    if (interactive) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setInteractive(true);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [interactive]);

  const handleBlur = useCallback(() => {
    // Return to cycling after losing focus
    setTimeout(() => {
      setInteractive(false);
      setDisplayed("");
    }, 200);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const val = input.trim();
      // Autocomplete: "cd " prefix or just the dir name
      const partial = val.startsWith("cd ") ? val.slice(3) : val;
      if (partial.length > 0) {
        const match = DIRS.find((d) => d.startsWith(partial.toLowerCase()));
        if (match) {
          setInput(`cd ${match}`);
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const val = input.trim();
      const target = val.startsWith("cd ") ? val.slice(3).trim() : val.trim();
      const href = DIR_HREFS[target.toLowerCase()];
      if (href && href !== "#") {
        if (href.startsWith("http")) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else {
          router.push(href);
        }
      }
    }
  }, [input, router]);

  if (interactive) {
    return (
      <span className="font-mono text-sm inline-flex items-center whitespace-pre">
        <span className="text-accent-green">$ </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="bg-transparent border-none outline-none text-secondary font-mono text-sm w-48 caret-accent-green"
          spellCheck={false}
          autoComplete="off"
        />
      </span>
    );
  }

  return (
    <span
      className="font-mono text-sm cursor-text"
      onClick={handleClick}
    >
      <span className="text-accent-green">$ </span>
      <span className="text-secondary">{displayed}</span>
      <BlinkingCursor
        className={cursorBlinking ? "" : "!animate-none !opacity-100"}
      />
    </span>
  );
}
