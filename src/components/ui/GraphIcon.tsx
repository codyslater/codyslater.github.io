"use client";

import Link from "next/link";

export function GraphIcon() {
  return (
    <Link
      href="/graph"
      className="fixed top-5 right-5 z-20 group pointer-events-auto"
      aria-label="Open interactive graph"
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        className="opacity-40 group-hover:opacity-100 transition-all duration-300 group-hover:scale-150 group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]"
      >
        {/* Edges */}
        <line x1="8" y1="8" x2="22" y2="6" stroke="#666" strokeWidth="0.8" />
        <line x1="8" y1="8" x2="14" y2="20" stroke="#666" strokeWidth="0.8" />
        <line x1="22" y1="6" x2="26" y2="18" stroke="#666" strokeWidth="0.8" />
        <line x1="22" y1="6" x2="14" y2="20" stroke="#666" strokeWidth="0.8" />
        <line x1="14" y1="20" x2="26" y2="18" stroke="#666" strokeWidth="0.8" />
        <line x1="14" y1="20" x2="6" y2="26" stroke="#666" strokeWidth="0.8" />
        <line x1="26" y1="18" x2="24" y2="28" stroke="#666" strokeWidth="0.8" />
        {/* Nodes */}
        <circle cx="8" cy="8" r="2.5" fill="#ffffff">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="22" cy="6" r="2.5" fill="#ffffff">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" begin="0.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="14" cy="20" r="2.5" fill="#ffffff">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" begin="1.6s" repeatCount="indefinite" />
        </circle>
        <circle cx="26" cy="18" r="2.5" fill="#ffffff">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" begin="0.4s" repeatCount="indefinite" />
        </circle>
        <circle cx="6" cy="26" r="2.5" fill="#ffffff">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" begin="1.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="24" cy="28" r="2" fill="#ffffff">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" begin="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </Link>
  );
}
