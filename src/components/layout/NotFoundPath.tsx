"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// The path that was asked for. A static host serves this page for any
// unknown URL, so the path is only known in the browser; SSR prints "/page".
export function NotFoundPath() {
  const path = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/page",
  );
  return <>{path}</>;
}
