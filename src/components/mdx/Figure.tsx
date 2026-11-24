"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const noop = () => () => {};

// The "back to text" link only makes sense once a mention of this figure exists in the page.
function useElementExists(id: string): boolean {
  return useSyncExternalStore(
    noop,
    () => document.getElementById(id) !== null,
    () => false,
  );
}

// A numbered figure: label line, then art and/or caption markdown. The first in-text
// mention (remarkFigureRefs) carries id "figure-N-ref".
export function Figure({
  n,
  title,
  children,
}: {
  n: number;
  title?: string;
  children?: ReactNode;
}) {
  const refId = `figure-${n}-ref`;
  const hasRef = useElementExists(refId);
  return (
    <figure id={`figure-${n}`} className="essay-figure">
      <div className="essay-figure-head">
        <p className="essay-figure-label">
          <strong>Figure {n}.</strong>
          {title && ` ${title}`}
        </p>
        {hasRef && (
          <a className="fig-back" href={`#${refId}`}>
            ↩ back to text
          </a>
        )}
      </div>
      {children}
    </figure>
  );
}
