// A measurement hook for the creature stage. It exposes `window.__creature`: the
// stage's current state, an event log of births and endings, play counters (taps,
// drags, throws) with the creature's box in viewport px, and per-frame timings.
// It is off, and costs nothing, unless the page URL has `?debug=1`; nothing in
// the app reads it.
//
// URL parameters, all read only when `debug=1` is present:
//   debug=1           turns the hook on
//   seed=<n>          holds one creature of that seed: later seeds and endings are ignored
//   birth=<name>      pins the birth style (a key of BIRTHS)
//   death=<name>      pins the ending style (a key of DEATHS)
//   temp=<name>       pins the temperament (a key of TEMPERAMENTS)
//   life=<min>-<max>  the creature's lifespan range in ms, for example life=2000-4000
//   splash=1          the first creature's pixels arrive from the screen edges, as after the opening screen
// Unknown birth, ending and temperament names are ignored.

type Entry = Record<string, unknown>;

type Box = { x: number; y: number; w: number; h: number };

// What a script needs to drive a tap, a drag and a double tap, and to check them.
export type PlayDebug = {
  state: string | null; // the creature's act ("idle", "walk", "startle", "retreat", "held", "fall", ...), or the birth/death style while one plays; null if none
  held: boolean; // picked up by a drag right now
  box: Box | null; // the creature's box, css px from the canvas's top-left
  client: Box | null; // the same box in viewport css px: aim pointer events at its middle
  startles: number; // taps that startled it (single clicks)
  drags: number; // pick-ups (a press that moved more than 6 px or was held 180 ms)
  soups: number; // navigations to /soup from a double tap or the keyboard
  throws: number; // releases that became throws (a drag let go while the pointer was moving)
  v: { x: number; y: number } | null; // the thrown creature's velocity in css px/s while it is in flight, else null
};

export type StageDebug = {
  mount: number;
  state: Entry;
  play: PlayDebug;
  log: Entry[];
  frames: { n: number; sumMs: number; maxMs: number; samples: number[] };
};

declare global {
  interface Window {
    __creature?: StageDebug;
  }
}

function debugOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

export function debugFlag(name: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return debugOn() && new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
}

// ?debug=1&seed=N: the nav screen spawns that one creature and ignores the
// word cycle's endings and new seeds.
export function debugSeed(): number | null {
  if (!debugOn()) return null;
  try {
    const v = new URLSearchParams(window.location.search).get("seed");
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

// ?debug=1&death=melt&birth=grow&temp=zippy&life=2000-4000: the raw value of a
// URL parameter, to pin a style, a temperament or a short life on the nav
// screen. The caller checks names.
export function debugParam(name: string): string | null {
  if (!debugOn()) return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

export function debugHook(): StageDebug | null {
  if (!debugOn()) return null;
  if (!window.__creature) {
    window.__creature = {
      mount: Math.floor(Math.random() * 1e9),
      state: {},
      play: { state: null, held: false, box: null, client: null, startles: 0, drags: 0, soups: 0, throws: 0, v: null },
      log: [],
      frames: { n: 0, sumMs: 0, maxMs: 0, samples: [] },
    };
  }
  return window.__creature;
}
