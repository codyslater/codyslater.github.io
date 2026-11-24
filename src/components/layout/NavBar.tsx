"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/lib/constants";

export function NavBar() {
  // trailingSlash export serves /graph/ and /soup/ — normalize before matching
  const pathname = usePathname().replace(/\/$/, "") || "/";

  // the section of the current page: /writing/<slug> marks writing
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (pathname === "/" || pathname === "/graph" || pathname === "/soup") return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm bg-background/30">
      <div className="max-w-5xl mx-auto px-2 min-[360px]:px-4 sm:px-6 py-4 flex items-center justify-between gap-2 min-[360px]:gap-3 sm:gap-4 font-mono text-xs leading-5 sm:text-sm">
        <Link
          href="/?skip=1"
          className="py-3 -my-3 px-2 -mx-2 text-foreground hover:text-accent-green transition-colors"
        >
          ~/
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 min-[360px]:gap-x-3 min-[390px]:gap-x-4 sm:gap-6">
          {siteConfig.nav.map((item) =>
            item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 -my-3 px-1 -mx-1 text-secondary hover:text-foreground glow-hover transition-colors"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent(item.href) ? "page" : undefined}
                className={`py-3 -my-3 px-1 -mx-1 hover:text-foreground glow-hover transition-colors ${
                  isCurrent(item.href) ? "text-foreground" : "text-secondary"
                }`}
              >
                {item.label}
              </Link>
            ),
          )}
        </div>
      </div>
    </nav>
  );
}
