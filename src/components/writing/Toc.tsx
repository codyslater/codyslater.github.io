"use client";

import { useEffect, useRef, useState } from "react";
import type { TocItem } from "@/lib/toc";

// Share of the viewport height above which a heading counts as "reached".
const READ_LINE = 0.35;

function List({
  items,
  active,
  onPick,
}: {
  items: TocItem[];
  active: string | null;
  onPick: (id: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <ol>
      {items.map((it) => (
        <li key={it.id} className={it.depth === 3 ? "lit-toc-sub" : undefined}>
          <a
            href={`#${it.id}`}
            aria-current={active === it.id ? "location" : undefined}
            onClick={(e) => onPick(it.id, e)}
          >
            {it.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

// Contents for a post: a collapsible block under the header on every screen, plus, on wide
// screens, a rail right of the text column (with scrollspy) once that block has scrolled away.
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [railShown, setRailShown] = useState(false);
  const inlineRef = useRef<HTMLDetailsElement>(null);

  // the rail would repeat the inline block while that block is still on screen
  useEffect(() => {
    const el = inlineRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setRailShown(!e.isIntersecting), {
      rootMargin: "-80px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const heads = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    if (heads.length === 0) return;
    // Re-read positions once per frame on scroll: a jump (figure link, back pill) can skip
    // past every heading without any of them crossing an observer band.
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * READ_LINE + 2;
      let cur: string | null = null;
      for (const h of heads) {
        if (h.getBoundingClientRect().top <= line) cur = h.id;
      }
      setActive(cur);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  function pick(id: string, e: React.MouseEvent<HTMLAnchorElement>) {
    setActive(id);
    // collapse the mobile block once an entry is chosen
    e.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <>
      <details ref={inlineRef} className="lit-toc lit-toc-inline">
        <summary>Contents</summary>
        <List items={items} active={active} onPick={pick} />
      </details>
      <nav
        className="lit-toc lit-toc-rail"
        aria-label="Contents"
        data-shown={railShown || undefined}
        inert={!railShown}
      >
        <List items={items} active={active} onPick={pick} />
      </nav>
    </>
  );
}
