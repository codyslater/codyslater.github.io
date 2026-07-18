"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
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

  const handleTypingProgress = useCallback((progress: number) => {
    setRevealProgress(progress);
  }, []);

  const handleContinue = useCallback(() => {
    if (phase !== "hero") return;
    setPhase("transitioning");
    setCanvasOpacity(0);
    setTimeout(() => setPhase("nav"), 400);
  }, [phase]);

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
