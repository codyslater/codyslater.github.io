import type { ReactNode } from "react";
import { ThemedVideo } from "@/components/writing/ThemedMedia";

// A captioned grid of short loops; one column on phones.
export function ClipGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 }) {
  return <div className={`lit-clips lit-clips-${cols}`}>{children}</div>;
}

export function Clip({ base, caption, ratio }: { base: string; caption: string; ratio: string }) {
  return (
    <figure className="lit-clip">
      <ThemedVideo base={base} themed={false} ratio={ratio} label={caption} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
