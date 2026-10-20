"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const KEY = "writing-theme";
const EVENT = "writing-theme-change";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
function getSnapshot(): Theme {
  return document.documentElement.dataset.writingTheme === "light"
    ? "light"
    : "dark";
}
function getServerSnapshot(): Theme {
  return "dark";
}

// The current writing/projects theme, kept in step with the toggle.
export function useLitTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ThemeToggle() {
  const theme = useLitTheme();

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.writingTheme = next;
    window.dispatchEvent(new Event(EVENT));
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage unavailable: the choice just lasts for this page view
    }
  }

  const target = theme === "light" ? "dark" : "light";
  // Both icons render; CSS shows the one for the mode a click switches to.
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === "light"}
      aria-label={`Switch to ${target} mode`}
      title={`Switch to ${target} mode`}
      className="lit-toggle"
    >
      <svg className="lit-toggle-sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg className="lit-toggle-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
