"use client";

import { useEffect, useRef, useState } from "react";

// Scrolling within this many px of where the reader came from counts as being back.
const NEAR = 200;

// After an in-article hash jump (footnote, figure, contents entry) a small pill returns the
// reader to where they were. Links that already return (footnote backref, figure "back to text")
// never arm it and disarm it.
export function BackPill() {
  const origin = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);

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
        setVisible(false);
        return;
      }
      // re-arm with the new origin; the pill appears once the jump has taken the reader away
      origin.current = window.scrollY;
      setVisible(false);
    }
    function onScroll() {
      if (origin.current === null) return;
      setVisible(Math.abs(window.scrollY - origin.current) > NEAR);
    }
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
    setVisible(false);
    // drop the hash so :target highlights clear and a reload does not jump again
    history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo({ top, behavior: "auto" });
  }

  if (!visible) return null;
  return (
    <button type="button" className="lit-back-pill" onClick={back}>
      ↩ back to where you were
    </button>
  );
}
