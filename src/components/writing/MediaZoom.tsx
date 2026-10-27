"use client";

import { useEffect, useRef, useState } from "react";

// Click an image or looping clip on a project page to see it large in front of the page.
// Esc or any click closes it. Players with controls are left alone: they have full screen.

const ZOOMABLE = ".lit-hero, .lit-figure, .project-prose img, video.lit-video:not([controls])";

type Shown =
  | { kind: "img"; src: string; alt: string }
  | { kind: "video"; sources: { src: string; type: string }[]; poster: string; label: string };

export function MediaZoom() {
  const ref = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(ZOOMABLE);
      if (!el || !el.closest(".writing-literary")) return;
      if (el instanceof HTMLImageElement) {
        setShown({ kind: "img", src: el.currentSrc || el.src, alt: el.alt });
      } else if (el instanceof HTMLVideoElement) {
        const sources = Array.from(el.querySelectorAll("source")).map((s) => ({
          src: s.src,
          type: s.type,
        }));
        setShown({ kind: "video", sources, poster: el.poster, label: el.getAttribute("aria-label") ?? "" });
      } else {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (shown && d && !d.open) d.showModal();
  }, [shown]);

  return (
    <dialog
      ref={ref}
      className="lit-zoom"
      onClick={() => ref.current?.close()}
      onClose={() => setShown(null)}
    >
      {shown?.kind === "img" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown.src} alt={shown.alt} />
      )}
      {shown?.kind === "video" && (
        <video poster={shown.poster} autoPlay muted loop playsInline aria-label={shown.label}>
          {shown.sources.map((s) => (
            <source key={s.src} src={s.src} type={s.type} />
          ))}
        </video>
      )}
    </dialog>
  );
}
