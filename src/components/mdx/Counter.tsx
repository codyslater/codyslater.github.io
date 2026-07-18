"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      onClick={() => setCount((c) => c + 1)}
      className="px-3 py-1.5 font-mono text-sm rounded border border-accent-green/30 text-accent-green bg-accent-green/5 hover:bg-accent-green/10 transition-colors"
    >
      clicks: {count}
    </button>
  );
}
