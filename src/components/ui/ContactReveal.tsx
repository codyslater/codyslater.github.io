"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ContactReveal.module.css";

// The address is assembled into one string only on a click (build). Until then it exists as
// pieces: these shifted character codes, out of order, so neither the address nor the host
// is a literal in the bundle or the page. After mount, the pieces (local part, host, domain)
// are also decoded into data attributes of a print-only element, which CSS joins for paper.
// The key is fixed; this is obscurity, not secrecy.
const KEY = 17;
const F: number[][] = [
  [116, 129, 128],
  [132, 126, 116, 136, 122, 136],
  [120, 127, 116, 125, 129],
  [116, 129, 119, 121, 67],
];

function dec(i: number): string {
  return String.fromCharCode(...F[i].map((n, k) => n - k - KEY));
}

function user(): string {
  return dec(3) + dec(1);
}

function build(): string {
  return [user(), "@", dec(2), ".", dec(0)].join("");
}

type Phase = "idle" | "typing" | "done";

export function ContactReveal({
  className = "",
  variant = "row",
}: {
  className?: string;
  /** "row" matches the about page link rows; "inline" is the compact cv header form. */
  variant?: "row" | "inline";
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);
  const [href, setHref] = useState("");
  const [mounted, setMounted] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const hadFocus = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setMounted(true); // browser-only markup: see the print pieces below
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    // The button unmounts on reveal; hold keyboard focus on the live region while the
    // address types so it never drops to the page, then the link takes it below.
    if (phase === "typing" && hadFocus.current) liveRef.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    if (phase !== "done") return;
    const active = document.activeElement;
    // Move focus to the link unless the visitor has already tabbed somewhere else.
    if (!active || active === document.body || rootRef.current?.contains(active)) {
      linkRef.current?.focus();
    }
  }, [phase]);

  function reveal() {
    if (phase !== "idle") return;
    hadFocus.current = !!rootRef.current?.contains(document.activeElement);
    const full = build();
    setHref(`mailto:${full}`);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setTyped(full);
      setPhase("done");
      return;
    }
    setPhase("typing");
    let n = 0;
    const step = () => {
      n += 1;
      setTyped(full.slice(0, n));
      if (n >= full.length) {
        setPhase("done");
        return;
      }
      timers.current.push(window.setTimeout(step, 25 + Math.round(Math.random() * 10)));
    };
    timers.current.push(window.setTimeout(step, 120));
  }

  async function copy() {
    const full = build();
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = full;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    setCopied(true);
    timers.current.push(window.setTimeout(() => setCopied(false), 1600));
  }

  const row = variant === "row";
  // One look per page: the address wears its page's link color from the first typed letter.
  const tone = row ? "text-secondary" : "text-accent-green";
  const root = `${row ? "flex items-center gap-2" : "inline-flex items-center gap-2"} ${styles.ink} ${className}`.trim();

  if (phase === "idle") {
    return (
      <>
        <span ref={rootRef} className={`${root} ${styles.live}`}>
          <button
            type="button"
            onClick={reveal}
            className={
              row
                ? `${styles.hit} group flex items-center gap-2 text-secondary hover:text-accent-green glow-hover transition-all cursor-pointer`
                : `${styles.hit} group inline-flex items-center gap-2 text-accent-green hover:underline glow-hover transition-all cursor-pointer`
            }
          >
            {row && (
              <span
                aria-hidden="true"
                className="text-muted group-hover:translate-x-1 transition-transform duration-200"
              >
                -&gt;
              </span>
            )}
            <span>email</span>
            <span className="text-muted text-xs">[reveal]</span>
          </button>
        </span>
        {/* Paper gets the real address: CSS joins these pieces. They are added only in the
            browser, after load, so the served HTML holds no part of the address. */}
        {mounted && (
          <span className={`${root} ${styles.print}`} aria-hidden="true">
            {!row && <span>email</span>}
            <span
              className={styles.printAddr}
              data-u={user()}
              data-d={dec(2)}
              data-t={dec(0)}
            />
          </span>
        )}
        {/* Without scripts the address stays out of the page entirely; the row says why. */}
        <noscript>
          <span className={`${root} ${styles.plain}`}>
            {row && <span className="text-muted" aria-hidden="true">-&gt;</span>}
            <span className="text-secondary">email</span>
            <span className="text-muted text-xs">[needs javascript]</span>
          </span>
          <style>{`.${styles.live}{display:none!important}`}</style>
        </noscript>
      </>
    );
  }

  return (
    <span ref={rootRef} className={root}>
      {row && (
        <span className="text-muted" aria-hidden="true">
          -&gt;
        </span>
      )}
      <span
        ref={liveRef}
        tabIndex={-1}
        style={{ outline: "none" }}
        aria-live="polite"
        aria-atomic="true"
        aria-busy={phase === "typing"}
      >
        <span className="sr-only">email </span>
        {phase === "typing" ? (
          <span className={`${tone} whitespace-pre`}>
            {typed}
            <span className={styles.caret} aria-hidden="true" />
          </span>
        ) : (
          <a
            ref={linkRef}
            href={href}
            className={
              row
                ? `${tone} hover:text-accent-green glow-hover transition-all break-all`
                : `${tone} hover:underline glow-hover break-all`
            }
          >
            {typed}
          </a>
        )}
      </span>
      {/* Present (hidden) while the address types, so the row never changes size when [copy] arrives. */}
      <button
        type="button"
        onClick={copy}
        disabled={phase !== "done"}
        tabIndex={phase === "done" ? 0 : -1}
        aria-hidden={phase !== "done" || undefined}
        className={`${styles.hit} ${styles.copy} shrink-0 text-xs text-muted hover:text-accent-green glow-hover transition-all cursor-pointer ${phase === "done" ? "" : "invisible"}`}
        aria-label="copy email address"
      >
        {copied ? "[copied]" : "[copy]"}
      </button>
    </span>
  );
}
