"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BlinkingCursor } from "./BlinkingCursor";
import { siteConfig } from "@/lib/constants";
import { usePrefersReducedMotion } from "@/components/creature/usePrefersReducedMotion";

// One phrase on the line. The five fields carry their own color; every other
// phrase stays text-secondary. The last phrase is special: it is never deleted
// letter by letter, the line just clears and starts over.
type Phrase = { text: string; color?: string };

const WORDS: Phrase[] = [
  { text: "prototyping executable biology" },
  { text: "engineer" },
  { text: "scientist" },
  { text: "medical student" },
  ...siteConfig.interests.map(({ label, color }) => ({ text: label, color })),
  { text: "committed to helping humanity thrive" },
];

const DIRS = siteConfig.nav.map((item) => item.label);
const DIR_HREFS: Record<string, string> = Object.fromEntries(
  siteConfig.nav.map((item) => [item.label, item.href]),
);

const TYPE_SPEED = 70;
const DELETE_SPEED = 40;
const PAUSE_AFTER_TYPE = 1500;
const FIRST_PAUSE = 3000; // the opening phrase holds twice as long, once
const PAUSE_AFTER_DELETE = 300;

interface CyclingTaglineProps {
  /** The word is gone and the next phrase is about to type; `color` is that phrase's own color, if it has one. */
  onWordChange?: (next: { color?: string }) => void;
}

export function CyclingTagline({ onWordChange }: CyclingTaglineProps) {
  const [displayed, setDisplayed] = useState("");
  const [color, setColor] = useState<string | undefined>(undefined);
  const seenFirstRef = useRef(false);
  const [cursorBlinking, setCursorBlinking] = useState(true);
  const [interactive, setInteractive] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [fade, setFade] = useState(1);

  // A ref for the callback, so a new function does not restart the cycling effect
  const onWordChangeRef = useRef(onWordChange);
  onWordChangeRef.current = onWordChange;

  // Cycling animation
  useEffect(() => {
    if (interactive || reduced) return;

    let wordIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let cancelled = false;

    function tick() {
      if (cancelled) return;
      const { text: word, color: wordColor } = WORDS[wordIndex];
      const nextColor = WORDS[(wordIndex + 1) % WORDS.length].color;

      if (!isDeleting) {
        charIndex++;
        setDisplayed(word.slice(0, charIndex));
        setColor(wordColor);
        setCursorBlinking(false);

        if (charIndex === word.length) {
          setCursorBlinking(true);
          const isLast = wordIndex === WORDS.length - 1;
          const pause = wordIndex === 0 && !seenFirstRef.current ? FIRST_PAUSE : PAUSE_AFTER_TYPE;
          if (wordIndex === 0) seenFirstRef.current = true;

          timeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            if (isLast) {
              charIndex = 0;
              setDisplayed("");
              wordIndex = 0;
              onWordChangeRef.current?.({ color: nextColor });
              timeoutRef.current = setTimeout(tick, PAUSE_AFTER_DELETE);
            } else {
              isDeleting = true;
              tick();
            }
          }, pause);
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
          onWordChangeRef.current?.({ color: nextColor });
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
    };
  }, [interactive, reduced]);

  // Reduced motion: no typing and no cursor. The whole phrase is shown, held,
  // faded out, and the next one faded in; it opens on the first phrase.
  useEffect(() => {
    if (interactive || !reduced) return;
    let i = 0;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));
    const show = () => {
      setDisplayed(WORDS[i].text);
      setColor(WORDS[i].color);
      setFade(1);
      later(() => {
        setFade(0);
        later(() => {
          i = (i + 1) % WORDS.length;
          onWordChangeRef.current?.({ color: WORDS[i].color });
          show();
        }, 350);
      }, i === 0 && !seenFirstRef.current ? FIRST_PAUSE : PAUSE_AFTER_TYPE + 1000);
      if (i === 0) seenFirstRef.current = true;
    };
    show();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [interactive, reduced]);

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
      const partial = val.toLowerCase().startsWith("cd ") ? val.slice(3) : val;
      if (partial.length > 0) {
        const match = DIRS.find((d) => d.startsWith(partial.toLowerCase()));
        if (match) {
          setInput(`cd ${match}`);
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const val = input.trim();
      const target = val.toLowerCase().startsWith("cd ") ? val.slice(3).trim() : val.trim();
      if (target.toLowerCase() === "zoo") {
        router.push("/zoo");
        return;
      }
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
      className="font-mono text-xs min-[380px]:text-sm whitespace-nowrap cursor-text"
      onClick={handleClick}
    >
      <span className="text-accent-green">$ </span>
      <span
        className={color ? undefined : "text-secondary"}
        style={{ ...(color ? { color } : {}), ...(reduced ? { opacity: fade, transition: "opacity 300ms ease" } : {}) }}
      >{displayed}</span>
      {!reduced && (
        <BlinkingCursor
          className={cursorBlinking ? "" : "!animate-none !opacity-100"}
        />
      )}
    </span>
  );
}
