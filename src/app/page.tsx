"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { GraphCanvas } from "@/components/ui/GraphCanvas";
import { HeroOverlay } from "@/components/sections/HeroOverlay";
import { GraphIcon } from "@/components/ui/GraphIcon";
import { NavGrid } from "@/components/sections/NavGrid";

type Phase = "hero" | "transitioning" | "nav";

function HomeContent() {
  const searchParams = useSearchParams();
  const skip = searchParams.get("skip") === "1";

  const [revealProgress, setRevealProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>(skip ? "nav" : "hero");
  const [canvasOpacity, setCanvasOpacity] = useState(1);
  const phaseRef = useRef<Phase>(skip ? "nav" : "hero");

  const handleTypingProgress = useCallback((progress: number) => {
    setRevealProgress(progress);
  }, []);

  // Returning visitors in this session go straight to the nav grid
  useEffect(() => {
    if (skip) return;
    try {
      if (sessionStorage.getItem("hero-seen") === "1") {
        phaseRef.current = "nav";
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is unavailable during SSR
        setPhase("nav");
      }
    } catch {}
  }, [skip]);

  // Ref guard: several triggers can fire in the same tick, before state updates
  const handleContinue = useCallback(() => {
    if (phaseRef.current !== "hero") return;
    phaseRef.current = "transitioning";
    try {
      sessionStorage.setItem("hero-seen", "1");
    } catch {}
    setPhase("transitioning");
    setCanvasOpacity(0);
    setTimeout(() => {
      phaseRef.current = "nav";
      setPhase("nav");
    }, 400);
  }, []);

  // Lock body overflow during hero/transitioning phases
  useEffect(() => {
    if (phase === "nav") {
      document.body.style.overflow = "";
    } else {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [phase]);

  return (
    <>
      {phase !== "nav" && (
        <div
          style={{
            opacity: canvasOpacity,
            transition: "opacity 400ms ease-out",
          }}
        >
          <GraphCanvas
            revealProgress={revealProgress}
            opacity={canvasOpacity}
          />
          <HeroOverlay
            onTypingProgress={handleTypingProgress}
            onContinue={handleContinue}
          />
          <GraphIcon />
        </div>
      )}
      {phase === "nav" && <NavGrid />}
    </>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
