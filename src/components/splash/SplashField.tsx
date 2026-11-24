"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Renderer } from "./draw";
import { Sim } from "./field/sim";
import { QUIET_NEAR, QUIET_RAMP, WIRE_TEXT_NEAR, WIRE_TEXT_RAMP, type QuietRect } from "./field/types";

export interface SplashFieldApi {
  /** One keystroke of the name (letters, the typo and its backspace). */
  keystroke: () => void;
  /** The name has finished typing. */
  typingDone: () => void;
  /** The splash is leaving: pixels fly toward where the nav screen's creature appears. */
  leave: () => void;
}

interface SplashFieldProps {
  /** 0..1 typing progress: drives the opening sweep and the melt wave. */
  revealProgress: number;
  /** First time the visitor touches the graph (hover within grab range, press, touch, edit). */
  onInteract?: () => void;
  ref?: Ref<SplashFieldApi>;
}

const GRAB = 20;
const TOUCH_RADIUS = 40;
const DRAG_IDLE = { on: false, node: -1, sx: 0, sy: 0, moved: false };
const MAKE_DELAY_MS = 160; // the board's first try waits this long, so the name's first letter (at 100 ms) comes first

export function SplashField({ revealProgress, onInteract, ref }: SplashFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const pending = useRef({ keys: 0, done: false });
  // Values the long-lived effect reads each frame, so changing them never rebuilds the graph.
  const live = useRef({ reveal: revealProgress, onInteract });

  useEffect(() => {
    live.current = { reveal: revealProgress, onInteract };
  });

  useImperativeHandle(
    ref,
    () => ({
      keystroke: () => {
        const sim = simRef.current;
        if (sim) sim.score.keystroke(sim);
        else pending.current.keys++;
      },
      typingDone: () => {
        const sim = simRef.current;
        if (sim) sim.score.typingDone(sim);
        else pending.current.done = true;
      },
      leave: () => {
        const sim = simRef.current;
        if (sim) rendererRef.current?.startLeave(sim);
      },
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new Renderer(ctx);
    rendererRef.current = renderer;
    const mouse = { x: -1000, y: -1000 };

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let disposed = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let interacted = false;
    let pressedOnCanvas = false;
    let drag = { ...DRAG_IDLE };
    let sim: Sim | null = null;
    let making: Generator<undefined, Sim, void> | null = null; // the board while it is being made, a step per slice
    let makeTimer: ReturnType<typeof setTimeout> | undefined;

    const layoutCanvas = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    const measure = (): QuietRect[] => {
      const out: QuietRect[] = [];
      document.querySelectorAll<HTMLElement>("[data-splash-quiet]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const kind = el.dataset.splashQuiet === "prompt" ? "prompt" : "name";
        if (kind === "name") {
          // keep-clear ellipse around name + tagline: about 760 x 280 on a desktop, 340 x 200 on a phone
          const vw = window.innerWidth;
          const k = Math.max(0, Math.min(1, (vw - 390) / 1050));
          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          const a = Math.max(170 + 210 * k, r.width / 2 + 44);
          const b = Math.max(100 + 40 * k, r.height / 2 + 36);
          const box = { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
          out.push({ x0: cx - a, y0: cy - b, x1: cx + a, y1: cy + b, kind, near: QUIET_NEAR, ramp: QUIET_RAMP, ell: { cx, cy, a, b, box } });
          return;
        }
        // the prompt box: nodes keep their distance, and a wire never comes within 12 px of it
        out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, kind, near: WIRE_TEXT_NEAR, ramp: WIRE_TEXT_RAMP });
      });
      return out;
    };

    const touched = () => {
      if (sim) sim.score.yield(sim);
      if (interacted) return;
      interacted = true;
      live.current.onInteract?.();
    };

    const drawFrame = () => {
      if (!sim) return;
      renderer.draw(sim, { w, h, dpr, mouse, calm: reduced });
    };

    // Reduced motion: the settled picture stays put; a few pads and cells brighten and dim softly (opacity only,
    // 2-4 s each, never more than four at once). No signals, no drift, no size change.
    let calmRaf = 0;
    let calmLast = 0;
    let calmNext = 0;
    const calm: { id: number; t0: number; dur: number }[] = [];
    const calmTick = (ts: number) => {
      calmRaf = requestAnimationFrame(calmTick);
      if (!sim || ts - calmLast < 40) return;
      calmLast = ts;
      if (ts >= calmNext && calm.length < 4) {
        const cands = sim.nodes.filter((n) => n.alive && !calm.some((c) => c.id === n.id));
        if (cands.length) calm.push({ id: cands[Math.floor(Math.random() * cands.length)].id, t0: ts, dur: 2000 + Math.random() * 2000 });
        calmNext = ts + 500 + Math.random() * 700;
      }
      for (const n of sim.nodes) n.pulse = 0;
      for (let i = calm.length - 1; i >= 0; i--) {
        const c = calm[i];
        const k = (ts - c.t0) / c.dur;
        if (k >= 1 || !sim.nodes[c.id]) calm.splice(i, 1);
        else sim.nodes[c.id].pulse = 0.9 * Math.sin(Math.PI * k) ** 2;
      }
      drawFrame();
    };

    // The board is ready: it takes the keystrokes typed while it was being made.
    const adopt = (made: Sim) => {
      sim = made;
      simRef.current = made;
      const p = pending.current;
      for (let i = 0; i < p.keys; i++) made.score.keystroke(made);
      if (p.done) made.score.typingDone(made);
      p.keys = 0;
      p.done = false;
    };

    // Making the board is a search of several tries. It runs a step per slice, after the name has started typing,
    // so the first letter is not held up and no slice freezes the page.
    const pump = () => {
      if (disposed || !making) return;
      const r = making.next();
      if (r.done) {
        making = null;
        adopt(r.value);
        r.value.setQuiet(measure());
      } else makeTimer = setTimeout(pump, 0);
    };

    const init = () => {
      layoutCanvas();
      const rects = measure();
      if (!sim) {
        clearTimeout(makeTimer);
        if (reduced) {
          making = null;
          adopt(new Sim(w, h, rects, { score: false }));
        } else {
          making = Sim.createSteps(w, h, rects, { score: true });
          makeTimer = setTimeout(pump, MAKE_DELAY_MS);
        }
      } else {
        sim.relayout(w, h, rects);
      }
      if (reduced && sim) {
        // one static frame of the settled, blended board
        sim.field.settle();
        sim.reveal = 1;
        sim.time = 30;
        sim.updateField();
        sim.updateGeometry(true);
        drawFrame();
      }
    };

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (!sim) {
        last = ts;
        return;
      }
      const dt = Math.min(50, Math.max(0, ts - last));
      last = ts;
      sim.sweep(live.current.reveal, Math.hypot(w / 2, h / 2));
      sim.step(dt / 1000);
      sim.updateField();
      sim.updateGeometry();
      drawFrame();
    };

    const start = () => {
      if (raf || reduced) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      cancelAnimationFrame(calmRaf);
      calmRaf = 0;
    };
    const startCalm = () => {
      if (reduced && !calmRaf) calmRaf = requestAnimationFrame(calmTick);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        start();
        startCalm();
      }
    };

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // phone address bars change the height by a few dozen px: keep the layout then
        if (Math.abs(window.innerWidth - w) > 0 || Math.abs(window.innerHeight - h) > 120) init();
        else {
          layoutCanvas();
          if (sim) sim.setQuiet(measure());
          if (reduced) drawFrame();
        }
      }, 120);
    };

    // ---- pointer input -------------------------------------------------------------
    const onMouseMove = (e: MouseEvent) => {
      if (!sim) return;
      const px = mouse.x;
      const py = mouse.y;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (drag.on && drag.node >= 0) {
        if (Math.abs(e.clientX - drag.sx) > 3 || Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
        sim.dragTo(drag.node, e.clientX, e.clientY);
        canvas.style.cursor = "grabbing";
        return;
      }
      if (e.target !== canvas) return;
      if (px > -500) sim.pointerMoved(px, py, e.clientX, e.clientY);
      const ni = sim.nodeAt(e.clientX, e.clientY, GRAB);
      if (ni >= 0) {
        canvas.style.cursor = "grab";
        const n = sim.nodes[ni];
        if (e.buttons === 0 && sim.time - n.lastHover > 0.8) {
          touched();
          sim.fire(ni, true);
          n.lastHover = sim.time;
        }
      } else {
        canvas.style.cursor = "crosshair";
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || !sim) return;
      pressedOnCanvas = true;
      touched();
      const ni = sim.nodeAt(e.clientX, e.clientY, GRAB);
      if (ni >= 0) {
        drag = { on: true, node: ni, sx: e.clientX, sy: e.clientY, moved: false };
        sim.startDrag(ni);
        canvas.style.cursor = "grabbing";
        e.preventDefault();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 || !pressedOnCanvas || !sim) return;
      pressedOnCanvas = false;
      if (drag.on && drag.node >= 0) sim.endDrag(drag.node, e.clientX, e.clientY, drag.moved, 30);
      else if (!drag.on) sim.addNode(e.clientX, e.clientY);
      drag = { ...DRAG_IDLE };
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!sim) return;
      touched();
      const ni = sim.nodeAt(e.clientX, e.clientY, GRAB);
      if (ni >= 0) {
        sim.removeNode(ni);
        return;
      }
      const wi = sim.wireAt(e.clientX, e.clientY, 8);
      if (wi >= 0) sim.cutWire(wi);
    };

    const onTouchStart = (e: TouchEvent) => {
      touched();
      if (e.touches.length !== 1 || !sim) return;
      const t = e.touches[0];
      const ni = sim.nodeAt(t.clientX, t.clientY, TOUCH_RADIUS);
      if (ni >= 0) {
        drag = { on: true, node: ni, sx: t.clientX, sy: t.clientY, moved: false };
        sim.startDrag(ni);
        e.preventDefault();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!drag.on || e.touches.length !== 1 || !sim) return;
      const t = e.touches[0];
      mouse.x = t.clientX;
      mouse.y = t.clientY;
      if (Math.abs(t.clientX - drag.sx) > 3 || Math.abs(t.clientY - drag.sy) > 3) drag.moved = true;
      sim.dragTo(drag.node, t.clientX, t.clientY);
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!sim) return;
      if (!drag.on) {
        if (e.changedTouches.length === 1) {
          const t = e.changedTouches[0];
          if (sim.nodeAt(t.clientX, t.clientY, TOUCH_RADIUS) < 0) sim.addNode(t.clientX, t.clientY);
        }
        drag = { ...DRAG_IDLE };
        return;
      }
      const t = e.changedTouches[0];
      if (t && drag.node >= 0) sim.endDrag(drag.node, t.clientX, t.clientY, drag.moved, 35);
      drag = { ...DRAG_IDLE };
      mouse.x = -1000;
      mouse.y = -1000;
    };

    // ---- go ----------------------------------------------------------------------
    const go = () => {
      if (disposed) return;
      init();
      start();
      startCalm();
    };
    if (document.fonts?.ready) void document.fonts.ready.then(() => requestAnimationFrame(go));
    else go();

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (sim) sim.setQuiet(measure());
          })
        : null;
    document.querySelectorAll("[data-splash-quiet]").forEach((el) => ro?.observe(el));
    if (!reduced) {
      window.addEventListener("mousemove", onMouseMove);
      canvas.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mouseup", onMouseUp);
      canvas.addEventListener("contextmenu", onContextMenu);
      canvas.addEventListener("touchstart", onTouchStart, { passive: false });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("touchend", onTouchEnd);
    }

    return () => {
      disposed = true;
      stop();
      clearTimeout(resizeTimer);
      clearTimeout(makeTimer);
      making = null;
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      simRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0" style={{ touchAction: "none" }} aria-hidden="true" />;
}
