import type { CSSProperties, ReactNode } from "react";
import styles from "./FadeIn.module.css";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "down" | "none";
  /** Keep `delay` as given. Without it the delay is capped at MAX_DELAY so a
   *  long list's stagger never holds text back. Only the nav screen opts in. */
  stagger?: boolean;
}

const MAX_DELAY = 0.5;

export function FadeIn({
  children,
  delay = 0,
  className = "",
  direction = "up",
  stagger = false,
}: FadeInProps) {
  const y = direction === "up" ? 16 : direction === "down" ? -16 : 0;
  const d = stagger ? delay : Math.min(delay, MAX_DELAY);
  const style = {
    "--fade-y": `${y}px`,
    "--fade-delay": `${d}s`,
  } as CSSProperties;

  return (
    <div className={`${styles.fade} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
