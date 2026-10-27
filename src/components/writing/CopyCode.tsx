"use client";

import { useEffect } from "react";

// Adds a copy button to every code block in project prose, so install commands
// can be copied in one click.

export function CopyCode() {
  useEffect(() => {
    const added: HTMLButtonElement[] = [];
    for (const pre of document.querySelectorAll<HTMLPreElement>(".project-prose pre")) {
      if (pre.querySelector(".copy-code")) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-code";
      btn.textContent = "copy";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      btn.addEventListener("click", () => {
        const text = pre.querySelector("code")?.innerText ?? pre.innerText;
        const done = (ok: boolean) => {
          btn.textContent = ok ? "copied" : "select and copy";
          if (ok) setTimeout(() => (btn.textContent = "copy"), 1500);
        };
        // the async clipboard needs a secure context; fall back to a hidden textarea
        const fallback = () => {
          const ta = document.createElement("textarea");
          ta.value = text.trimEnd();
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try {
            ok = document.execCommand("copy");
          } catch {}
          ta.remove();
          done(ok);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(text.trimEnd()).then(() => done(true), fallback);
        else fallback();
      });
      pre.appendChild(btn);
      added.push(btn);
    }
    return () => added.forEach((b) => b.remove());
  }, []);
  return null;
}
