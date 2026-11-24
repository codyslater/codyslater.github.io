"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { SplashField, type SplashFieldApi } from "./SplashField";
import { SplashOverlay, TAGLINE } from "./SplashOverlay";
import { NavGrid } from "@/components/sections/NavGrid";
import { siteConfig } from "@/lib/constants";

type Phase = "splash" | "transitioning" | "nav";

/** Idle time after the name has typed before the splash continues by itself. */
const AUTO_ADVANCE_MS = 6000;
const FADE_MS = 400;

export function SplashHome() {
  const [revealProgress, setRevealProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>("splash");
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  // True once the visitor has come through the splash (not ?skip=1):
  // the first creature then assembles from the edges, as if from the board's pixels.
  const [cameThrough, setCameThrough] = useState(false);
  const phaseRef = useRef<Phase>("splash");
  const fieldRef = useRef<SplashFieldApi>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const interacted = useRef(false);

  const handleTypingProgress = useCallback((progress: number) => {
    setRevealProgress(progress);
  }, []);

  // The splash plays on every arrival and every reload. The site's own links back to home carry ?skip=1 and go
  // straight to the nav grid. The URL is read after mount, so the static HTML is the splash, not empty.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("skip") === "1") {
      phaseRef.current = "nav";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is unavailable during SSR
      setPhase("nav");
    }
  }, []);

  // Ref guard: several triggers can fire in the same tick, before state updates
  const handleContinue = useCallback(() => {
    if (phaseRef.current !== "splash") return;
    phaseRef.current = "transitioning";
    clearTimeout(autoTimer.current);
    fieldRef.current?.leave();
    setCameThrough(true);
    // Reduced motion: an instant swap, in one commit, so there is no frame without the name.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      phaseRef.current = "nav";
      setPhase("nav");
      return;
    }
    // Cross-fade: the nav screen mounts now, under the leaving splash. Its name is in the same box and fully visible from
    // its first frame, so the name stays put while the canvas, tagline and prompt fade out and the creature, line and links
    // fade in. The splash unmounts when its fade is over.
    setPhase("transitioning");
    setCanvasOpacity(0);
    handoffTimer.current = setTimeout(() => {
      phaseRef.current = "nav";
      setPhase("nav");
    }, FADE_MS);
  }, []);

  // Typing is done: the opening score continues from here, and the idle timer starts.
  const handleTypingDone = useCallback(() => {
    if (phaseRef.current !== "splash") return; // a late typing timer after the splash has started to leave
    fieldRef.current?.typingDone();
    // Reduced motion: nothing happens by itself. The visitor leaves when they choose to.
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!interacted.current && !reduced) {
      clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => {
        if (!interacted.current) handleContinue();
      }, AUTO_ADVANCE_MS);
    }
  }, [handleContinue]);

  const handleKeystroke = useCallback(() => {
    fieldRef.current?.keystroke();
  }, []);

  // Any play with the graph cancels the idle timer for the rest of this page load
  const handleInteract = useCallback(() => {
    interacted.current = true;
    clearTimeout(autoTimer.current);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(autoTimer.current);
      clearTimeout(handoffTimer.current);
    },
    [],
  );

  // Lock body overflow during the splash and transitioning phases
  useEffect(() => {
    document.body.style.overflow = phase === "nav" ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [phase]);

  return (
    <>
      <noscript>
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[#0a0a0a] px-4 text-center font-mono">
          <style>{".splash-tagline{opacity:1!important}"}</style>
          <p className="text-4xl sm:text-5xl md:text-6xl font-bold text-accent-green tracking-tight">{siteConfig.title}</p>
          <p className="text-xs sm:text-sm text-secondary">{TAGLINE}</p>
          <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
            {siteConfig.nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="text-foreground underline underline-offset-4">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </noscript>
      {/* Before the splash in the DOM, and in a fixed slot of this list, so the leaving splash paints over it and the nav
          screen is not remounted when the splash goes. Mounted from the start of the hand-off. */}
      {phase !== "splash" && <NavGrid fromSplash={cameThrough} />}
      {phase !== "nav" && (
        <div style={{ opacity: canvasOpacity, transition: `opacity ${FADE_MS}ms ease-out` }}>
          <SplashField ref={fieldRef} revealProgress={revealProgress} onInteract={handleInteract} />
          <SplashOverlay
            onTypingProgress={handleTypingProgress}
            onTypingDone={handleTypingDone}
            onKeystroke={handleKeystroke}
            onContinue={handleContinue}
            leaving={phase === "transitioning"}
          />
        </div>
      )}
    </>
  );
}
