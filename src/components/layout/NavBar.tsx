"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/lib/constants";

export function NavBar() {
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/graph") return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm bg-background/30">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between font-mono text-sm">
        <Link
          href="/?skip=1"
          className="text-foreground hover:text-accent-green transition-colors"
        >
          ~/
        </Link>
        <div className="flex items-center gap-6">
          {siteConfig.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-secondary hover:text-foreground glow-hover transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
