"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface TimeSliderProps {
  speed: number;
  onSpeed: (s: number) => void;
}

// slider position 0 = paused; 1..100 → speed 0.25..20, log scale (×1 ≈ 32)
const RANGE = 20 / 0.25;
const toSpeed = (v: number) => (v <= 0 ? 0 : 0.25 * Math.pow(RANGE, (v - 1) / 99));
const fromSpeed = (s: number) =>
  s <= 0 ? 0 : Math.round(1 + (99 * Math.log(s / 0.25)) / Math.log(RANGE));

// Invisible until the pointer nears the top edge; fades out ~2s after it
// leaves. On touch devices a tap toggles it.
export function TimeSlider({ speed, onSpeed }: TimeSliderProps) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function show() {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
    }
    function scheduleHide() {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 2000);
    }
    function onMove(e: MouseEvent) {
      if (e.clientY < window.innerHeight * 0.15) show();
      else scheduleHide();
    }
    function onTouch(e: TouchEvent) {
      // A touch that lands on the control itself is an interaction, not a
      // dismiss — keep it up so it can't fade out mid-drag.
      if (barRef.current && e.target instanceof Node && barRef.current.contains(e.target)) {
        show();
        return;
      }
      setVisible((v) => {
        if (!v) return true;
        scheduleHide();
        return v;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchstart", onTouch);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchstart", onTouch);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <>
      {/* the way home stays on screen: the bar below fades away, and a page with no nav needs
          one visible exit. Same ~/ mark, color, size and hover as the nav on every other inner page, in a 44px target. */}
      <Link
        href="/?skip=1"
        aria-label="home"
        className="fixed top-2 left-2 sm:left-4 z-50 flex items-center justify-center min-w-11 h-11 px-2 font-mono text-sm text-foreground hover:text-accent-green focus-visible:text-accent-green transition-colors [text-shadow:0_0_6px_#000,0_0_2px_#000]"
      >
        ~/
      </Link>
      <div
        ref={barRef}
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center gap-6 pt-5 pb-8 transition-opacity duration-500"
        style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
      >
        <input
          type="range"
          min={0}
          max={100}
          value={fromSpeed(speed)}
          onChange={(e) => onSpeed(toSpeed(Number(e.target.value)))}
          aria-label="simulation speed"
          className="soup-slider w-48 h-1 cursor-pointer appearance-none rounded bg-border"
        />
        <span className="font-mono text-xs text-muted w-12">
          {speed <= 0 ? "⏸" : `×${speed < 1 ? speed.toFixed(2) : speed.toFixed(1)}`}
        </span>
      </div>
    </>
  );
}
