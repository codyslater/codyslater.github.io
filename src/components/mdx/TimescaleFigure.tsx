// "Relative time scales across which neurons must reliably function": one
// log-scaled time axis (1 ms to ~50 years) with the caption's stages a-d plus
// the decades-long retention span drawn at their true positions. Colors come
// only from the .writing-literary tokens (globals.css) through the CSS module,
// so the page's light/dark flip needs no logic here. Two SVGs share the data:
// a horizontal strip from 560px up and a vertical one below it (CSS media
// query; the hidden one is display:none, so a screen reader hears one figure).
// Panel (e) of the original caption (the protein-state loop) is deliberately
// not drawn; here (e) is the retained-for-decades span.

import type { ReactNode } from "react";
import styles from "./TimescaleFigure.module.css";

// ---- the axis, in seconds -------------------------------------------------
const MIN = 60;
const HOUR = 3600;
const DAY = 86400;
const YEAR = 3.156e7;
const T_MIN = 1e-3; // 1 ms
const T_MAX = 50 * YEAR; // ~1.58e9 s
const LOG_MIN = Math.log10(T_MIN);
const LOG_RANGE = Math.log10(T_MAX) - LOG_MIN; // ~12.2 decades

const TICKS: { t: number; label: string }[] = [
  { t: 1e-3, label: "1 ms" },
  { t: 1, label: "1 s" },
  { t: MIN, label: "1 min" },
  { t: HOUR, label: "1 h" },
  { t: DAY, label: "1 day" },
  { t: YEAR, label: "1 year" },
  { t: 10 * YEAR, label: "10 years" },
];

type Glyph = "ap" | "raster" | "nucleus" | "growth" | "held";
type Stage = {
  id: string;
  from: number; // seconds; a point stage has from === to
  to: number;
  glyph: Glyph;
  label: string[]; // lines
};

const STAGES: Stage[] = [
  { id: "a", from: 3e-3, to: 3e-3, glyph: "ap", label: ["single spikes"] },
  { id: "b", from: 5, to: 5, glyph: "raster", label: ["spike trains"] },
  { id: "c", from: 5 * MIN, to: 5 * MIN, glyph: "nucleus", label: ["immediate", "early genes"] },
  { id: "d", from: HOUR, to: 3 * DAY, glyph: "growth", label: ["synaptic", "remodeling"] },
  { id: "e", from: YEAR, to: T_MAX, glyph: "held", label: ["retained for", "decades"] },
];

// RNA-state bridge: from 10 s (on purpose) to 3 days, so it covers all of (d)
const BRIDGE = { from: 10, to: 3 * DAY };

const frac = (t: number) => (Math.log10(t) - LOG_MIN) / LOG_RANGE;

// ---- glyphs, drawn around (0, 0), roughly 76 x 68 -------------------------
const SHAFT_TOP = 20;
const SHAFT_BOT = 33;
const NECK_W = 3;
const GAP = NECK_W * 1.8;

// a dendritic spine standing on the shaft's top edge: flared base, thin neck, round head
function spinePath(cx: number, neckH: number, headR: number): string {
  const l = cx - NECK_W / 2;
  const r = cx + NECK_W / 2;
  const top = SHAFT_TOP - neckH;
  return (
    `M${cx - GAP} ${SHAFT_TOP} C${l - 0.4} ${SHAFT_TOP - 1.5} ${l - 0.3} ${top + neckH * 0.4} ${l} ${top} ` +
    `A${headR} ${headR} 0 1 1 ${r} ${top} ` +
    `C${r + 0.3} ${top + neckH * 0.4} ${r + 0.4} ${SHAFT_TOP - 1.5} ${cx + GAP} ${SHAFT_TOP}`
  );
}

// the dendrite shaft: top edge broken where a spine stands, bottom edge whole
function shaftPath(spines: number[]): string {
  const xs = [-38, ...spines.flatMap((c) => [c - GAP, c + GAP]), 38];
  let d = "";
  for (let i = 0; i < xs.length; i += 2) {
    const wob = i % 4 === 0 ? 0.6 : -0.5;
    d += `M${xs[i]} ${SHAFT_TOP} Q${(xs[i] + xs[i + 1]) / 2} ${SHAFT_TOP + wob} ${xs[i + 1]} ${SHAFT_TOP} `;
  }
  d += `M-38 ${SHAFT_BOT} Q-12 ${SHAFT_BOT + 1.2} 4 ${SHAFT_BOT - 0.4} T38 ${SHAFT_BOT}`;
  return d;
}

// an elliptical outline drawn as arcs, leaving gaps (pores) at the given angle ranges (degrees)
function ringPath(cx: number, cy: number, rx: number, ry: number, gaps: [number, number][]): string {
  const pt = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return `${(cx + rx * Math.cos(r)).toFixed(2)} ${(cy + ry * Math.sin(r)).toFixed(2)}`;
  };
  const g = [...gaps].sort((a, b) => a[0] - b[0]);
  let d = "";
  for (let i = 0; i < g.length; i++) {
    const from = g[i][1];
    const to = (g[(i + 1) % g.length][0] + (i + 1 === g.length ? 360 : 0));
    d += `M${pt(from)} A${rx} ${ry} 0 ${to - from > 180 ? 1 : 0} 1 ${pt(to)} `;
  }
  return d;
}

// a gently bent strand drawn as beads (nucleotides): points along a quadratic curve
function beadsPath(p0: [number, number], p1: [number, number], p2: [number, number], n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const u = 1 - t;
    return [
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ] as [number, number];
  });
}

function GlyphShape({ kind }: { kind: Glyph }): ReactNode {
  switch (kind) {
    case "ap":
      // sub-threshold wobble, then one spike with its undershoot
      return (
        <path
          className={styles.ink}
          d="M-38 14 C-34 12.5 -31 15.5 -27 14 S-21 11.5 -17 12 C-13 12.5 -11 8 -8 -4 C-6 -16 -4 -32 -1 -32 C2 -32 3 -10 5 8 C6.5 22 8 27 11 26 C15 25 17 17 21 15 C25 14 30 14.5 38 14"
        />
      );
    case "raster": {
      const rows: [number, number[]][] = [
        [-16, [-32, -24, -21, -9, -2, 10, 14, 27, 33]],
        [2, [-28, -18, -6, -3, 8, 19, 22, 31]],
        [20, [-33, -12, -8, 0, 6, 16, 26, 29]],
      ];
      return (
        <path
          className={styles.ink}
          d={rows
            .flatMap(([y, xs]) => xs.map((x, i) => `M${x} ${y - 6} L${x + (i % 2 ? 0.5 : -0.4)} ${y + 6}`))
            .join(" ")}
        />
      );
    }
    case "nucleus": {
      // double nuclear envelope with two pores; a beaded transcript starts inside,
      // leaves through the right-hand pore and ends a short way outside
      const pores: [number, number][] = [
        [-14, 14],
        [118, 136],
      ];
      const beads = beadsPath([-13, 6], [12, 2], [38, -7], 11);
      return (
        <>
          <path className={styles.ink} d={ringPath(-10, 2, 24, 22, pores)} />
          <path className={styles.ink} d={ringPath(-10, 2, 20.5, 18.5, pores)} />
          <circle className={styles.inkSoft} cx="-19" cy="-3" r="4.5" />
          {beads.map(([x, y], i) => (
            <circle key={i} className={styles.dot} cx={x.toFixed(2)} cy={y.toFixed(2)} r={i === 0 ? 1.9 : 1.4} />
          ))}
        </>
      );
    }
    case "growth":
      return (
        <>
          <path className={styles.ink} d={shaftPath([-24, 20])} />
          <path className={styles.ink} d={spinePath(-24, 8, 4)} />
          <path className={styles.ink} d={spinePath(20, 14, 8)} />
          <path className={styles.inkSoft} d="M-14 5 H0 M-4 1.5 L0 5 L-4 8.5" />
        </>
      );
    case "held":
      // one enlarged spine, unchanged, with a ruler of ticks beneath for time passing
      return (
        <>
          <path className={styles.ink} d={shaftPath([0])} />
          <path className={styles.ink} d={spinePath(0, 14, 8)} />
          <path
            className={styles.inkSoft}
            d={`M-38 43 H37 M33 39.5 L37.5 43 L33 46.5 ${Array.from({ length: 10 }, (_, i) => `M${-36 + i * 8} 40 V46`).join(" ")}`}
          />
        </>
      );
  }
}

// ---- layouts ----------------------------------------------------------------
const GLYPH_Y = 64;
const LINE = 16;
const LABEL_Y = 128; // first label baseline (desktop)

function ariaText(bridge: boolean): string {
  return (
    "Log-scaled time axis from one millisecond to about fifty years. " +
    "(a) Single spikes occur over milliseconds. " +
    "(b) Spike trains unfold over seconds. " +
    "(c) Immediate early genes are transcribed after minutes. " +
    "(d) Synaptic remodeling takes hours to days. " +
    "(e) What is retained must last for decades, from about a year onward." +
    (bridge
      ? " A thin bracket from about ten seconds to three days marks where an RNA state might bridge the gap."
      : "")
  );
}

function Horizontal({ bridge }: { bridge: boolean }) {
  const X0 = 44;
  const X1 = 684;
  const AXIS_Y = 184;
  const x = (t: number) => X0 + frac(t) * (X1 - X0);
  const H = bridge ? AXIS_Y + 72 : AXIS_Y + 56;
  const label = ariaText(bridge);
  const bx1 = x(BRIDGE.from);
  const bx2 = x(BRIDGE.to);
  const BR_Y = AXIS_Y + 42; // bracket bar, ~12 units under the tick labels; end ticks rise toward the axis

  return (
    <svg viewBox={`0 0 720 ${H}`} className={styles.wide} role="img" aria-label={label}>
      <title>{label}</title>
      <line className={styles.axis} x1={X0} x2={X1} y1={AXIS_Y} y2={AXIS_Y} />
      {TICKS.map((k) => (
        <g key={k.label}>
          <line className={styles.axis} x1={x(k.t)} x2={x(k.t)} y1={AXIS_Y - 4} y2={AXIS_Y + 5} />
          <text className={styles.tick} x={x(k.t)} y={AXIS_Y + 24} textAnchor="middle">
            {k.label}
          </text>
        </g>
      ))}
      <text className={styles.note} x={X1} y={AXIS_Y + 46} textAnchor="end">
        time, log scale
      </text>

      {STAGES.map((s) => {
        const xa = x(s.from);
        const xb = x(s.to);
        const cx = (xa + xb) / 2;
        const labelBottom = LABEL_Y + (s.label.length - 1) * LINE + 4;
        const isSpan = s.to > s.from;
        return (
          <g key={s.id}>
            <text className={styles.letter} x={cx} y={16} textAnchor="middle">
              {s.id}
            </text>
            <g transform={`translate(${cx} ${GLYPH_Y})`}>
              <GlyphShape kind={s.glyph} />
            </g>
            <text className={styles.text} textAnchor="middle">
              {s.label.map((ln, i) => (
                <tspan key={ln} x={cx} y={LABEL_Y + i * LINE}>
                  {ln}
                </tspan>
              ))}
            </text>
            <line className={styles.dots} x1={cx} x2={cx} y1={labelBottom + 6} y2={AXIS_Y - (isSpan ? 4 : 7)} />
            {isSpan ? (
              <line className={styles.span} x1={xa} x2={xb} y1={AXIS_Y} y2={AXIS_Y} />
            ) : (
              <circle className={styles.dotHole} cx={cx} cy={AXIS_Y} r="3.6" />
            )}
          </g>
        );
      })}

      {bridge && (
        <g>
          <path className={styles.bridgeLine} d={`M${bx1} ${BR_Y - 6} V${BR_Y} H${bx2} V${BR_Y - 6}`} />
          <text className={styles.bridgeText} x={(bx1 + bx2) / 2} y={BR_Y + 17} textAnchor="middle">
            RNA state?
          </text>
        </g>
      )}
    </svg>
  );
}

// Vertical layout. The viewBox is only 316 units wide so that on a phone
// (container ~310-345 px) it renders at about 1:1 or larger, which keeps the
// 15/13 unit text at or above 14/12 px.
const V_W = 316;
const V_SCALE = 1.15; // glyphs are drawn larger here

function Vertical({ bridge }: { bridge: boolean }) {
  const Y0 = 30;
  const Y1 = 664;
  const AXIS_X = 62;
  const GLYPH_X = 134;
  const LABEL_X = 190;
  const BR_X = 290;
  const y = (t: number) => Y0 + frac(t) * (Y1 - Y0);
  const label = ariaText(bridge);
  const by1 = y(BRIDGE.from);
  const by2 = y(BRIDGE.to);

  return (
    <svg viewBox={`0 0 ${V_W} 690`} className={styles.tall} role="img" aria-label={label}>
      <title>{label}</title>
      <line className={styles.axis} x1={AXIS_X} x2={AXIS_X} y1={Y0} y2={Y1} />
      {TICKS.map((k) => (
        <g key={k.label}>
          <line className={styles.axis} x1={AXIS_X - 5} x2={AXIS_X + 4} y1={y(k.t)} y2={y(k.t)} />
          <text className={styles.tickV} x={AXIS_X - 9} y={y(k.t) + 4.5} textAnchor="end">
            {k.label}
          </text>
        </g>
      ))}
      <text className={styles.noteV} x={AXIS_X - 4} y={Y1 + 24}>
        time, log scale
      </text>

      {STAGES.map((s) => {
        const ya = y(s.from);
        const yb = y(s.to);
        const cy = (ya + yb) / 2;
        const isSpan = s.to > s.from;
        return (
          <g key={s.id}>
            <line className={styles.dots} x1={AXIS_X + (isSpan ? 4 : 7)} x2={GLYPH_X - 50} y1={cy} y2={cy} />
            <text className={styles.letterV} x={AXIS_X + 14} y={cy - 7} textAnchor="middle">
              {s.id}
            </text>
            <g transform={`translate(${GLYPH_X} ${cy}) scale(${V_SCALE})`}>
              <GlyphShape kind={s.glyph} />
            </g>
            <text className={styles.textV}>
              {s.label.map((ln, i) => (
                <tspan key={ln} x={LABEL_X} y={cy + 5 - ((s.label.length - 1) * 18) / 2 + i * 18}>
                  {ln}
                </tspan>
              ))}
            </text>
            {isSpan ? (
              <line className={styles.span} x1={AXIS_X} x2={AXIS_X} y1={ya} y2={yb} />
            ) : (
              <circle className={styles.dotHole} cx={AXIS_X} cy={cy} r="3.6" />
            )}
          </g>
        );
      })}

      {bridge && (
        <g>
          <path className={styles.bridgeLine} d={`M${BR_X - 6} ${by1} H${BR_X} V${by2} H${BR_X - 6}`} />
          <text
            className={styles.bridgeTextV}
            transform={`translate(${BR_X + 15} ${(by1 + by2) / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            RNA state?
          </text>
        </g>
      )}
    </svg>
  );
}

export function TimescaleFigure({ bridge = false }: { bridge?: boolean }) {
  return (
    <div className={styles.wrap}>
      <Horizontal bridge={bridge} />
      <Vertical bridge={bridge} />
    </div>
  );
}
