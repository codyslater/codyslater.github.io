"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FadeIn } from "@/components/ui/FadeIn";
import { CyclingTagline } from "@/components/ui/CyclingTagline";
import { CreatureStage } from "@/components/creature/CreatureStage";
import { seedForColor } from "@/components/creature/generation";
import { siteConfig } from "@/lib/constants";
import { NAME_CLASS, NAME_GRID_CLASS } from "@/components/splash/nameLayout";
import { Footer } from "@/components/layout/Footer";

export function NavGrid({ fromSplash = false }: { fromSplash?: boolean }) {
  const [creatureSeed, setCreatureSeed] = useState(() => Date.now());
  const router = useRouter();
  const nameRef = useRef<HTMLHeadingElement>(null);
  // The color of the phrase on the line right now (a field color, or none).
  // The creature does not follow the line: it only takes this color when it is born.
  const phraseColor = useRef<string | undefined>(undefined);

  const handleWordChange = useCallback(({ color }: { color?: string }) => {
    phraseColor.current = color;
  }, []);

  // A creature lives 8-18 s (LIFESPAN_MS in creature/stage.ts); when its ending is
  // over, the next one is born at once. A field phrase on the line at that
  // moment gives the newborn that field's color, which it keeps for life.
  const handleDeathComplete = useCallback(() => {
    const color = phraseColor.current;
    setCreatureSeed((s) => (color ? seedForColor(s + 1, color) : s + 1));
  }, []);

  return (
    <>
    <section className={`min-h-screen ${NAME_GRID_CLASS}`}>
      {/* Top cell: the creature's stage, filling the area above the name. Nothing
          in flow, so the name sits where the grid puts it. */}
      <div className="relative w-full">
        <CreatureStage
          seed={creatureSeed}
          onDeathComplete={handleDeathComplete}
          nameRef={nameRef}
          onActivate={() => router.push(`/soup?seed=${creatureSeed}`)}
          fromSplash={fromSplash}
        />
      </div>

      {/* Middle cell: name appears immediately (no fade, so it is already there under a leaving splash).
          Its box is the reference the splash's name matches: see splash/nameLayout.ts. */}
      <h1 ref={nameRef} className={NAME_CLASS}>
        {siteConfig.title}
      </h1>

      {/* Bottom cell: tagline + icons pinned to top */}
      <div className="flex flex-col items-center justify-start pt-8 gap-8">
        <FadeIn delay={0.7} stagger>
          <div className="h-6 flex items-center">
            <CyclingTagline onWordChange={handleWordChange} />
          </div>
        </FadeIn>

        <div className="flex items-center gap-4 min-[390px]:gap-5 min-[480px]:gap-8 md:gap-10">
          {siteConfig.nav.map((item, i) => {
            const isExternal = item.external ?? false;
            const Wrapper = isExternal ? "a" : Link;
            const extraProps = isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
            return (
              <FadeIn key={item.label} delay={0.8 + 0.1 * i} stagger>
                <Wrapper
                  href={item.href}
                  className="group flex flex-col items-center gap-2"
                  {...extraProps}
                >
                  <span
                    className={`text-2xl min-[360px]:text-3xl font-mono font-bold opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200${!item.color ? " text-secondary" : ""}`}
                    style={{ ...(item.color ? { color: item.color } : {}), ...(item.inkTrim ? { marginInline: `${-item.inkTrim}em` } : {}) }}
                  >
                    {item.icon}
                  </span>
                  <span className="text-[10px] min-[360px]:text-[11px] min-[390px]:text-xs font-mono text-muted group-hover:text-foreground transition-colors">
                    {item.label}
                  </span>
                </Wrapper>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
    <Footer />
    </>
  );
}
