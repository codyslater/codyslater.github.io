"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Stage, LIFESPAN_MS } from "./stage";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { debugFlag, debugHook, debugParam, debugSeed } from "./debug";
import { BIRTHS, DEATHS } from "./styles";
import { TEMPERAMENTS } from "./temperaments";
import type { BirthName, DeathName, TemperamentName } from "./types";

// ?debug=1 only: pin a birth, ending or temperament by name (unknown names are ignored).
function pinned(): { birth?: BirthName; death?: DeathName; temperament?: TemperamentName } | undefined {
  const b = debugParam("birth");
  const d = debugParam("death");
  const t = debugParam("temp");
  const o: { birth?: BirthName; death?: DeathName; temperament?: TemperamentName } = {};
  if (b && b in BIRTHS) o.birth = b as BirthName;
  if (d && d in DEATHS) o.death = d as DeathName;
  if (t && t in TEMPERAMENTS) o.temperament = t as TemperamentName;
  return Object.keys(o).length ? o : undefined;
}

// ?debug=1&life=2000-4000 shortens a creature's life, for measuring endings.
function lifespan(): [number, number] | null {
  if (debugSeed() !== null) return null; // a held creature never dies
  const v = debugParam("life");
  const m = v && /^(\d+)-(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2])] : LIFESPAN_MS;
}

// Where the tallest letters of an element's text start, in px below its box top.
function glyphTop(el: HTMLElement): number {
  try {
    const cs = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return 0;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = (el.textContent ?? "").trim();
    const m = ctx.measureText(text);
    const content = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    const lh = parseFloat(cs.lineHeight);
    const lead = Number.isFinite(lh) ? (lh - content) / 2 : 0;
    const top = lead + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
    return Number.isFinite(top) && top > 0 ? Math.floor(top) : 0;
  } catch {
    return 0;
  }
}

// Touch and mouse, one path (pointer events on the button, with capture):
// a press that moves more than DRAG_PX, or is held HOLD_MS, picks the creature up;
// a press released before that is a tap, which startles it; two taps within
// DOUBLE_MS and DOUBLE_PX open the soup. A drag is never a tap.
const DRAG_PX = 6;
const HOLD_MS = 180;
const DOUBLE_MS = 350;
const DOUBLE_PX = 24;
// The button is a little bigger than the creature at the sides and the top, so a
// second tap still lands while it jumps. Never below it: that is the name.
const HIT_SIDE = 10;
const HIT_TOP = 10;

type Gesture = {
  id: number;
  x0: number; y0: number; // where the press began, client px
  x: number; y: number; // where the pointer is now
  dragging: boolean;
  timer: number | null;
};

interface CreatureStageProps {
  seed: number;
  onDeathComplete: () => void;
  /** The name below the stage: its top edge is the ground, its width the walkable part. */
  nameRef: RefObject<HTMLElement | null>;
  onActivate: () => void;
  /** The first creature arrives from the splash: its pixels come in from the screen edges. */
  fromSplash?: boolean;
}

// The creature's habitat: fills its parent (the area above the name), draws on
// a canvas that never takes a click, and carries one real button that follows
// the creature so it stays clickable and focusable. A creature lives its own
// 8-18 s and then dies; the parent hands over the next seed. Each creature has
// its own size (stage.ts picks it from the seed): `cell` below is the base size.
export function CreatureStage({
  seed, onDeathComplete, nameRef, onActivate, fromSplash = false,
}: CreatureStageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const spawnedRef = useRef(false);
  const reduced = usePrefersReducedMotion();

  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const latest = useRef({ onDeathComplete, onActivate, reduced, fromSplash, seed });
  useEffect(() => {
    latest.current = { onDeathComplete, onActivate, reduced, fromSplash, seed };
  });

  const goSoup = () => {
    const d = debugHook();
    if (d) d.play.soups++;
    latest.current.onActivate();
  };

  const beginDrag = () => {
    const g = gesture.current;
    if (!g || g.dragging) return;
    if (g.timer !== null) window.clearTimeout(g.timer);
    g.timer = null;
    // refused (an ending began meanwhile): the press is spent, and is not a tap either
    if (stageRef.current?.grab(g.x, g.y)) g.dragging = true;
    else g.x0 = Infinity;
  };

  const finish = (cancelled: boolean, x: number, y: number) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (g.timer !== null) window.clearTimeout(g.timer);
    try {
      buttonRef.current?.releasePointerCapture(g.id);
    } catch {
      /* already released */
    }
    const stage = stageRef.current;
    if (g.dragging) {
      if (!cancelled) stage?.dragTo(x, y);
      stage?.drop(!cancelled);
      return;
    }
    if (cancelled || g.x0 === Infinity) return;
    const now = performance.now();
    const prev = lastTap.current;
    if (prev && now - prev.t <= DOUBLE_MS && Math.hypot(x - prev.x, y - prev.y) <= DOUBLE_PX) {
      lastTap.current = null;
      goSoup();
      return;
    }
    lastTap.current = { t: now, x, y };
    stage?.startle(x, y);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !e.isPrimary || gesture.current) return;
    if (!stageRef.current?.canPlay()) return; // an ending is under way: the press is ignored
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
    gesture.current = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dragging: false,
      timer: window.setTimeout(beginDrag, HOLD_MS),
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    g.x = e.clientX;
    g.y = e.clientY;
    if (!g.dragging && g.x0 !== Infinity && Math.hypot(g.x - g.x0, g.y - g.y0) > DRAG_PX) beginDrag();
    if (g.dragging) stageRef.current?.dragTo(g.x, g.y);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (gesture.current && e.pointerId === gesture.current.id) finish(false, e.clientX, e.clientY);
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (gesture.current && e.pointerId === gesture.current.id) finish(true, e.clientX, e.clientY);
  };

  useEffect(() => {
    return () => {
      const g = gesture.current;
      if (g?.timer != null) window.clearTimeout(g.timer);
      gesture.current = null;
    };
  }, []);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const name = nameRef.current;
    const stage = stageRef.current;
    if (!wrap || !name || !stage) return;
    const w = wrap.getBoundingClientRect();
    const n = name.getBoundingClientRect();
    if (w.width < 1 || w.height < 1) return;
    // The ground is the top of the name's tallest letters, not the top of its
    // line box: the canvas reaches down that far, in whole cells, so the feet
    // stand on the letters.
    const cell = w.width < 500 ? 6 : 7;
    // Two clear pixels between the feet and the letters: a creature in the name's own green
    // otherwise reads as fused with the letter it stands on.
    const inkTop = Math.max(0, glyphTop(name) - 2);
    const height = Math.floor((w.height + inkTop) / cell) * cell;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.top = "auto";
      canvas.style.bottom = `${-inkTop}px`;
      canvas.style.height = `${height}px`;
    }
    stage.setLayout({
      width: w.width,
      height,
      cell,
      dpr: Math.min(3, window.devicePixelRatio || 1),
      nameL: n.left - w.left,
      nameR: n.right - w.left,
    });
  }, [nameRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const stage = new Stage(canvas, {
      reduced: latest.current.reduced,
      lifespanMs: lifespan(),
      onBox: ({ x, y, w, h }) => {
        const b = buttonRef.current;
        if (!b) return;
        const top = Math.min(HIT_TOP, Math.max(0, y));
        b.style.width = `${w + 2 * HIT_SIDE}px`;
        b.style.height = `${h + top}px`;
        b.style.transform = `translate(${x - HIT_SIDE}px, ${y - top}px)`;
      },
      onDeathComplete: () => latest.current.onDeathComplete(),
    });
    stageRef.current = stage;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (nameRef.current) ro.observe(nameRef.current);
    // the name's box changes once the real font is in
    document.fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      stage.destroy();
      stageRef.current = null;
      spawnedRef.current = false;
    };
  }, [measure, nameRef]);

  useEffect(() => {
    stageRef.current?.setReduced(reduced);
  }, [reduced]);

  useEffect(() => {
    const first = !spawnedRef.current;
    spawnedRef.current = true;
    const splash = first && (latest.current.fromSplash || debugFlag("splash"));
    const held = debugSeed();
    if (held !== null && !first) return;
    stageRef.current?.spawn(held ?? seed, { firstBirth: splash ? "edges" : null, overrides: pinned() });
  }, [seed]);

  return (
    <div ref={wrapRef} className="absolute inset-y-0 -inset-x-4">
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
      <button
        ref={buttonRef}
        type="button"
        aria-label="open this creature in the soup"
        // pointer clicks are handled above (tap, double tap, drag); a click with no
        // pointer (detail 0: Enter, Space, a screen reader) opens the soup at once
        onClick={(e) => {
          if (e.detail === 0) goSoup();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute left-0 top-0 cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-green/60 active:cursor-grabbing"
        style={{
          width: 84, height: 84, transform: "translate(calc(50% - 42px), 0)",
          touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
        }}
      />
    </div>
  );
}
