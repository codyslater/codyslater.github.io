"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FadeIn } from "@/components/ui/FadeIn";
import { CyclingTagline } from "@/components/ui/CyclingTagline";
import { PixelCreature } from "@/components/ui/PixelCreature";
import { siteConfig } from "@/lib/constants";
import { Footer } from "@/components/layout/Footer";

export function NavGrid() {
  const [creatureSeed, setCreatureSeed] = useState(() => Date.now());
  const [melting, setMelting] = useState(false);
  const router = useRouter();

  const handleWordChange = useCallback(() => {
    setMelting(false);
    setCreatureSeed((s) => s + 1);
  }, []);

  const handleDeletingStart = useCallback(() => {
    setMelting(true);
  }, []);

  return (
    <>
    <section className="min-h-screen grid grid-rows-[1fr_auto_1fr] justify-items-center px-4">
      {/* Top cell: creature pinned to bottom — pb must exceed the canvas's
          below-body padding (PAD/GRID × size = 40px) so death scatter clears the name */}
      <div className="flex flex-col items-center justify-end pb-[60px]">
        <FadeIn direction="none">
          <button
            type="button"
            aria-label="something is evolving…"
            className="cursor-pointer"
            onClick={() => router.push(`/soup?seed=${creatureSeed}`)}
          >
            <PixelCreature seed={creatureSeed} size={80} melting={melting} />
          </button>
        </FadeIn>
      </div>

      {/* Middle cell: name appears immediately */}
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-mono font-bold text-accent-green tracking-tight">
        {siteConfig.title}
      </h1>

      {/* Bottom cell: tagline + icons pinned to top */}
      <div className="flex flex-col items-center justify-start pt-8 gap-8">
        <FadeIn delay={0.7}>
          <div className="h-6 flex items-center">
            <CyclingTagline onWordChange={handleWordChange} onDeletingStart={handleDeletingStart} />
          </div>
        </FadeIn>

        <div className="flex items-center gap-10">
          {siteConfig.nav.map((item, i) => {
            const isExternal = item.external ?? false;
            const Wrapper = isExternal ? "a" : Link;
            const extraProps = isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
            return (
              <FadeIn key={item.label} delay={0.8 + 0.1 * i}>
                <Wrapper
                  href={item.href}
                  className="group flex flex-col items-center gap-2"
                  {...extraProps}
                >
                  <span
                    className={`text-3xl font-mono font-bold opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200${!item.color ? " text-secondary" : ""}`}
                    style={item.color ? { color: item.color } : undefined}
                  >
                    {item.icon}
                  </span>
                  <span className="text-xs font-mono text-muted group-hover:text-foreground transition-colors">
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
