"use client";

import { useEffect, useMemo, useState } from "react";
import { Cells, parse } from "./HudTerminal";

// A row of retro-hud creatures, one per mood, each its own robot (its own session id).
// The frames are real statusline.py output: the stretch of rule each creature walks on.
// Clicking one opens its speech cloud, as in the terminal, and sets the terminal above
// to the same state.

type Creature = { id: string; label: string; frames: string[] };

// what the cloud's first two lines say for each mood, as the handler's card puts it
const CLOUD: Record<string, [string, string]> = {
  working: ["agent · working for 1m", "context 38% · limit 22% · $1.84 · 47m"],
  yours: ["agent · your turn for 0s", "context 38% · limit 22% · $1.84 · 47m"],
  hot: ["agent · working for 1m", "context 75% · limit 22% · $1.84 · 47m"],
  alert: ["agent · working for 1m", "context 92% · limit 22% · $1.84 · 47m"],
  idle: ["agent · idle for 11m", "context 38% · limit 22% · $1.84 · 47m"],
  asleep: ["agent · asleep for 1h", "context 38% · limit 22% · $1.84 · 47m"],
};

export function HudCreatures({ src }: { src: string }) {
  const [list, setList] = useState<Creature[] | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(src)
      .then((r) => r.json())
      .then(setList)
      .catch(() => {});
  }, [src]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // a click or key anywhere else closes the cloud, as in tmux
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("keydown", close);
    document.addEventListener("click", close);
    return () => {
      window.removeEventListener("keydown", close);
      document.removeEventListener("click", close);
    };
  }, [open]);

  const rows = useMemo(
    () => list?.map((c) => parse(c.frames[tick % c.frames.length])) ?? [],
    [list, tick],
  );

  if (!list) return <div className="hud-crowd" aria-hidden />;
  return (
    <div className="hud-crowd" role="group" aria-label="retro-hud creatures, one per state">
      {list.map((c, k) => (
        <button
          key={c.id}
          type="button"
          className="hud-critter"
          aria-pressed={open === c.id}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(open === c.id ? null : c.id);
            window.dispatchEvent(new CustomEvent("hud:mood", { detail: c.id }));
          }}
        >
          {open === c.id && (
            <span className="hud-cloud hud-critter-cloud">
              <b>{CLOUD[c.id][0]}</b>
              {"\n"}
              {CLOUD[c.id][1]}
              {"\n"}
              <span className="hud-dim">the terminal above is now in this state</span>
            </span>
          )}
          <span className="hud-critter-track">
            {rows[k].map((run, j) => (
              <span key={j} style={{ color: run.fg, background: run.bg, fontWeight: run.bold ? 700 : 400 }}>
                <Cells text={run.text} />
              </span>
            ))}
          </span>
          <span className="hud-critter-label">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
