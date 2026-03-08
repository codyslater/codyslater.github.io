"use client";

export function BlinkingCursor({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block w-[0.6em] h-[1.1em] bg-white align-middle ${className}`}
      style={{ animation: "blink 1s step-end infinite" }}
      aria-hidden="true"
    />
  );
}
