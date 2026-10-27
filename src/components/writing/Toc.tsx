"use client";

import { useEffect, useState } from "react";
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

// Contents for a post: a fixed rail in the left margin on wide screens (with scrollspy),
// a collapsible block under the header on narrow ones. CSS shows one of the two.
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const heads = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    if (heads.length === 0) return;
    // The observer is only the trigger: whenever a heading crosses the band, re-read all positions.
    const update = () => {
      const line = window.innerHeight * READ_LINE + 2;
      let cur: string | null = null;
      for (const h of heads) {
        if (h.getBoundingClientRect().top <= line) cur = h.id;
      }
      setActive(cur);
    };
    const io = new IntersectionObserver(update, {
      rootMargin: `-80px 0px -${100 - READ_LINE * 100}% 0px`,
    });
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [items]);

  function pick(id: string, e: React.MouseEvent<HTMLAnchorElement>) {
    setActive(id);
    // collapse the mobile block once an entry is chosen
    e.currentTarget.closest("details")?.removeAttribute("open");
  }

  return (
    <>
      <details className="lit-toc lit-toc-inline">
        <summary>Contents</summary>
        <List items={items} active={active} onPick={pick} />
      </details>
      <nav className="lit-toc lit-toc-rail" aria-label="Contents">
        <List items={items} active={active} onPick={pick} />
      </nav>
    </>
  );
}
