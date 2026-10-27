"use client";

import { useEffect, useRef, useState } from "react";
import { useLitTheme } from "./ThemeToggle";

// Media made in two themes (the project animations render a dark and a light cut).
// `base` is a path prefix under public/; the files are
//   <base>_<theme>.mp4, <base>_<theme>.webm, <base>_<theme>_poster.webp   (video)
//   <base>_<theme>.webp                                                   (image)
// The one matching the page theme is shown; a toggle swaps it in place.

export function ThemedVideo({
  base,
  label,
  themed = true,
  ratio = "4 / 3",
  autoplay = true,
}: {
  base: string;
  label: string;
  themed?: boolean; // false: one cut for both themes, <base>.mp4 / .webm / _poster.webp
  ratio?: string; // CSS aspect-ratio, reserved before the video loads
  autoplay?: boolean; // false: a player with controls (long recordings further down a page)
}) {
  const pageTheme = useLitTheme();
  const theme = themed ? pageTheme : null;
  const stem = theme ? `${base}_${theme}` : base;
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const still = reduced || !autoplay;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // a new source needs an explicit load; keep playing unless motion is reduced
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.load();
    if (!still) v.play().catch(() => {});
  }, [theme, still]);

  return (
    <video
      ref={ref}
      className="lit-video"
      style={{ aspectRatio: ratio }}
      poster={`${stem}_poster.webp`}
      autoPlay={!still}
      muted
      loop
      playsInline
      controls={still}
      preload="metadata"
      aria-label={label}
    >
      <source src={`${stem}.webm`} type="video/webm" />
      <source src={`${stem}.mp4`} type="video/mp4" />
    </video>
  );
}

export function ThemedImage({
  base,
  alt,
  className = "lit-figure",
}: {
  base: string;
  alt: string;
  className?: string;
}) {
  const theme = useLitTheme();
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${base}_${theme}.webp`} alt={alt} className={className} />;
}
