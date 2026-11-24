"use client";

import { useEffect, useRef, useState } from "react";
import { useLitTheme } from "./ThemeToggle";

// Media made in two themes (the project animations render a dark and a light cut).
// `base` is a path prefix under public/; the files are
//   <base>_<theme>.mp4, <base>_<theme>.webm, <base>_<theme>_poster.webp   (video)
//   <base>_<theme>.webp                                                   (image)
//
// Both cuts are in the served HTML and CSS shows the one that matches the page theme (`themed-dark` / `themed-light`
// in globals.css), the same way the post covers do. The theme is set on <html> before the first paint, so a reader whose
// light mode is remembered sees the light cut from the first frame; nothing waits for script.
//
// The dark cut is the common case and loads exactly as a plain element would: an eager image, a video that plays
// by itself from the HTML. The light cut costs nothing until it is shown: its image is lazy, its video is not preloaded
// and starts from script. So a dark-theme visit is as fast as before, and a light-theme visit never shows the dark cut.

const CUTS = ["dark", "light"] as const;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

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
  const reduced = useReducedMotion();
  const still = reduced || !autoplay;
  if (!themed) return <SharedCut stem={base} label={label} ratio={ratio} still={still} />;
  return (
    <>
      {CUTS.map((cut) => (
        <ThemedCut key={cut} cut={cut} stem={`${base}_${cut}`} label={label} ratio={ratio} still={still} />
      ))}
    </>
  );
}

// One cut for both themes: plays by itself from the served HTML.
function SharedCut({ stem, label, ratio, still }: { stem: string; label: string; ratio: string; still: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  // keep playing unless motion is reduced
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.load();
    if (!still) v.play().catch(() => {});
  }, [still]);

  return (
    <video
      ref={ref}
      className="lit-video"
      data-cut="shared"
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

// One of the two themed cuts. Only the dark cut carries the autoplay attribute and a metadata preload (see the top of
// this file); after mount, and on every theme change, the cut CSS is showing plays and the other pauses.
function ThemedCut({
  cut,
  stem,
  label,
  ratio,
  still,
}: {
  cut: (typeof CUTS)[number];
  stem: string;
  label: string;
  ratio: string;
  still: boolean;
}) {
  const pageTheme = useLitTheme();
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Ask the page, not React: during hydration the hook still reports the server's theme.
    const shown = getComputedStyle(v).display !== "none";
    if (!shown) {
      v.pause();
      return;
    }
    v.preload = "metadata";
    if (!still) v.play().catch(() => {});
    else v.pause();
  }, [pageTheme, still]);

  return (
    <video
      ref={ref}
      className={`lit-video themed-${cut}`}
      data-cut={cut}
      style={{ aspectRatio: ratio }}
      poster={`${stem}_poster.webp`}
      autoPlay={cut === "dark" && !still}
      muted
      loop
      playsInline
      controls={still}
      preload={cut === "dark" ? "metadata" : "none"}
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
  return (
    <>
      {CUTS.map((cut) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={cut} src={`${base}_${cut}.webp`} alt={alt} className={`${className} themed-${cut}`} data-cut={cut} loading={cut === "dark" ? "eager" : "lazy"} />
      ))}
    </>
  );
}
