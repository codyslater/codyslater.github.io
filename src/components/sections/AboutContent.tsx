"use client";

import { FadeIn } from "@/components/ui/FadeIn";
import { siteConfig } from "@/lib/constants";

const links = [
  { label: "github", href: siteConfig.links.github },
  { label: "bluesky", href: siteConfig.links.bluesky },
  { label: "copying ourselves", href: siteConfig.links.substack, note: "substack" },
  { label: "cv", href: siteConfig.links.cv, note: "will be updated soon" },
];

export function AboutContent() {
  return (
    <div className="max-w-3xl mx-auto">
      <FadeIn>
        <h1 className="text-2xl font-mono font-bold text-foreground mb-8">
          about
        </h1>
      </FadeIn>

      <FadeIn delay={0.1}>
        <p className="text-secondary text-base leading-relaxed font-mono">
          {siteConfig.bio}
        </p>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className="flex flex-wrap gap-3 mt-8 justify-center">
          {siteConfig.interests.map((interest) => (
            <span
              key={interest.label}
              className="px-3 py-1.5 text-xs font-mono rounded border"
              style={{
                color: interest.color,
                borderColor: `${interest.color}30`,
                backgroundColor: `${interest.color}08`,
                textShadow: `0 0 12px ${interest.color}25`,
              }}
            >
              {interest.label}
            </span>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.3}>
        <div className="mt-12 space-y-3 font-mono text-sm">
          {links.map((link, i) => (
            <FadeIn key={link.label} delay={0.35 + 0.05 * i}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 text-secondary hover:text-accent-green glow-hover transition-all"
              >
                <span className="text-muted group-hover:translate-x-1 transition-transform duration-200">
                  -&gt;
                </span>
                <span>{link.label}</span>
                {link.note && (
                  <span className="text-muted text-xs">[{link.note}]</span>
                )}
              </a>
            </FadeIn>
          ))}
        </div>
      </FadeIn>
    </div>
  );
}
