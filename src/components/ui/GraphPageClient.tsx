"use client";

import { GraphCanvas } from "@/components/ui/GraphCanvas";
import { useEffect } from "react";

export function GraphPageClient() {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-background">
      <GraphCanvas revealProgress={1} />
    </div>
  );
}
