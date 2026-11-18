"use client";

import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

// Scrolling within this many px of where the reader came from counts as being back.
const NEAR = 200;

// Two small pills in the bottom-right corner of a post:
// - "back to where you were", after an in-article hash jump (footnote, figure, contents entry)
//   or the contents pill. Links that already return (footnote backref, figure "back to text")
//   never arm it and disarm it.
// - "contents" (or "top" on a post without one), once the reader is a screen past the top,
//   beside a light/dark toggle so the theme is reachable mid-read.
export function ReaderPills({ hasToc }: { hasToc: boolean }) {
  const origin = useRef<number | null>(null);
  const [backShown, setBackShown] = useState(false);
  const [topShown, setTopShown] = useState(false);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest("a");
      const href = a?.getAttribute("href");
      if (!a || !href || href.length < 2 || !href.startsWith("#")) return;
      if (!a.closest("article")) return;
      if (a.hasAttribute("data-footnote-backref") || a.classList.contains("fig-back")) {
        // already a return trip: nothing left to go back to
        origin.current = null;
        setBackShown(false);
        return;
      }
      // re-arm with the new origin; the pill appears once the jump has taken the reader away
      origin.current = window.scrollY;
      setBackShown(false);
    }
    function onScroll() {
      setTopShown(window.scrollY > window.innerHeight);
      if (origin.current === null) return;
      setBackShown(Math.abs(window.scrollY - origin.current) > NEAR);
    }
    onScroll();
    document.addEventListener("click", onClick);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function back() {
    if (origin.current === null) return;
    const top = origin.current;
    origin.current = null;
    setBackShown(false);
    // drop the hash so :target highlights clear and a reload does not jump again
    history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo({ top, behavior: "auto" });
  }

  function toTop() {
    origin.current = window.scrollY;
    const toc = hasToc ? document.getElementById("contents") : null;
    if (toc instanceof HTMLDetailsElement) {
      toc.open = true;
      toc.scrollIntoView({ block: "start" });
      toc.querySelector("summary")?.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  if (!backShown && !topShown) return null;
  return (
    <div className="lit-pills">
      {backShown && (
        <button type="button" className="lit-pill" onClick={back}>
          ↩ back to where you were
        </button>
      )}
      {topShown && (
        <div className="lit-pill-row">
          <ThemeToggle className="lit-toggle lit-pill lit-pill-icon" />
          <button type="button" className="lit-pill" onClick={toTop}>
            ↑ {hasToc ? "contents" : "top"}
          </button>
        </div>
      )}
    </div>
  );
}
