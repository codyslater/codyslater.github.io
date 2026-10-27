// "The ribosome neighborhood model": one neuron, drawn simply, summarising the
// essay's conclusion. The nucleus holds pre-made, intron-retaining RNAs;
// dendrites carry a few "ribosome neighborhoods" (dashed rings holding
// ribosomes and local mRNAs, some with a visible state); a spike carries
// context down the axon, a return signal says which RNAs to release, and the
// released RNAs are spliced on demand. Nothing else is claimed.
//
// Colors come only from the .writing-literary tokens through the CSS module.
// Two SVGs share one scene builder: a horizontal neuron (dendrites left, axon
// right) from 700px up and a vertical one (nucleus on top, dendrites below,
// axon off the right side) below it, toggled by a CSS media query so a screen
// reader meets one figure.

import type { ReactNode } from "react";
import styles from "./NeighborhoodFigure.module.css";

// ---- geometry helpers --------------------------------------------------------
type P = [number, number];
type Seg = [P, P, P, P]; // cubic Bezier

const S = (a: number[]): Seg => [
  [a[0], a[1]],
  [a[2], a[3]],
  [a[4], a[5]],
  [a[6], a[7]],
];
const lineSeg = (a: P, b: P): Seg => [
  a,
  [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
  [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3],
  b,
];
const f = (x: number) => +x.toFixed(1);
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function pt(s: Seg, t: number): P {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((i) => k[0] * s[0][i] + k[1] * s[1][i] + k[2] * s[2][i] + k[3] * s[3][i]) as P;
}
function tan(s: Seg, t: number): P {
  const u = 1 - t;
  const d = [0, 1].map(
    (i) =>
      3 * u * u * (s[1][i] - s[0][i]) + 6 * u * t * (s[2][i] - s[1][i]) + 3 * t * t * (s[3][i] - s[2][i]),
  );
  const m = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / m, d[1] / m];
}
function split(s: Seg, t: number): [Seg, Seg] {
  const a = mix(s[0], s[1], t);
  const b = mix(s[1], s[2], t);
  const c = mix(s[2], s[3], t);
  const d = mix(a, b, t);
  const e = mix(b, c, t);
  const m = mix(d, e, t);
  return [
    [s[0], a, d, m],
    [m, e, c, s[3]],
  ];
}
function sub(s: Seg, t0: number, t1: number): Seg {
  const [, right] = split(s, t0);
  return split(right, (t1 - t0) / (1 - t0))[0];
}
const rev = (s: Seg): Seg => [s[3], s[2], s[1], s[0]];
const dSeg = (s: Seg, move = true) =>
  `${move ? `M${f(s[0][0])} ${f(s[0][1])} ` : ""}C${f(s[1][0])} ${f(s[1][1])} ${f(s[2][0])} ${f(s[2][1])} ${f(s[3][0])} ${f(s[3][1])}`;

function scanT(s: Seg, ok: (p: P) => boolean, from = 0, to = 1): number {
  const n = 600;
  for (let i = 0; i <= n; i++) {
    const t = from + ((to - from) * i) / n;
    if (ok(pt(s, t))) return t;
  }
  return to;
}

// a segment sampled by arc length: glyphs sit at an arc position and follow the tangent
type Curve = { seg: Seg; len: number; at: (arc: number) => { p: P; a: number; t: number } };
function curve(seg: Seg): Curve {
  const N = 240;
  const cum = [0];
  let prev = pt(seg, 0);
  for (let i = 1; i <= N; i++) {
    const q = pt(seg, i / N);
    cum.push(cum[i - 1] + dist(prev, q));
    prev = q;
  }
  const len = cum[N];
  return {
    seg,
    len,
    at: (arc) => {
      const s = Math.max(0, Math.min(len, arc));
      let lo = 0;
      let hi = N;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (cum[m] <= s) lo = m;
        else hi = m;
      }
      const t = (lo + (s - cum[lo]) / (cum[hi] - cum[lo] || 1)) / N;
      const tg = tan(seg, t);
      return { p: pt(seg, t), a: Math.atan2(tg[1], tg[0]), t };
    },
  };
}

// ---- scene model -------------------------------------------------------------
type GlyphKind = "rib" | "plain" | "edit" | "g4";
type Glyph = { k: GlyphKind; p: P; a: number }; // a in radians
type Tube = { d: string; w: number };
type Spine = { d: string; head: P; hr: number };
type Ring = { c: P; r: number };
type Label = { x: number; y: number; lines: string[]; cls: "text" | "flow"; anchor?: "start" | "middle" };
type Scene = {
  w: number;
  y0: number;
  h: number;
  gs: number; // mRNA glyph scale
  g4s: number; // G4 glyph scale
  soma: { cx: number; cy: number; rx: number; ry: number };
  nuc: { cx: number; cy: number; r: number };
  bulb: { cx: number; cy: number; rx: number; ry: number };
  tubes: Tube[];
  spines: Spine[];
  rings: Ring[];
  glyphs: Glyph[];
  arrows: Seg[][]; // each arrow: chained segments
  leaders: [P, P][];
  labels: Label[];
  lh: number;
};

const SPINE_W = 4.6;
const WALL = 1.2;

// a spine on a curve: thin neck rising to a round head, on whichever side faces `dir`
function spine(cv: Curve, arc: number, dir: P, len: number, hr: number): Spine & { n: P } {
  const { p, a } = cv.at(arc);
  let n: P = [Math.sin(a), -Math.cos(a)];
  if (n[0] * dir[0] + n[1] * dir[1] < 0) n = [-n[0], -n[1]];
  const head: P = [p[0] + n[0] * (len + hr - 2), p[1] + n[1] * (len + hr - 2)];
  const mid: P = [(p[0] + head[0]) / 2 + Math.cos(a) * 2, (p[1] + head[1]) / 2 + Math.sin(a) * 2];
  return { d: `M${f(p[0])} ${f(p[1])} Q${f(mid[0])} ${f(mid[1])} ${f(head[0])} ${f(head[1])}`, head, hr, n };
}

// a ribosome neighborhood at the tip of a twig: a dashed ring, three ribosomes and one mRNA along the shaft, and a spine
// (its head is left empty so no ribosome sits inside a second circle)
function neighborhood(
  cv: Curve,
  state: "g4" | "plain" | "edit",
  spineDir: P,
  o: { r: number; back: number; rib: number[]; spineAt: number },
) {
  const c0 = cv.len - o.back;
  const ring: Ring = { c: cv.at(c0).p, r: o.r };
  const g = (s: number, k: GlyphKind): Glyph => {
    const q = cv.at(c0 + s);
    return { k, p: q.p, a: q.a };
  };
  const glyphs: Glyph[] = [...o.rib.map((s) => g(s, "rib")), g(14, state)];
  const sp = spine(cv, c0 + o.spineAt, spineDir, 11, 8);
  return { ring, glyphs, spine: sp as Spine, at: (s: number) => cv.at(c0 + s) };
}

// shared helpers for leaders
const wallOff = (s: Seg, t: number, dir: P, half: number): P => {
  const p = pt(s, t);
  const tg = tan(s, t);
  let n: P = [-tg[1], tg[0]];
  if (n[0] * dir[0] + n[1] * dir[1] < 0) n = [-n[0], -n[1]];
  return [p[0] + n[0] * (half + 3), p[1] + n[1] * (half + 3)];
};
const toward = (c: P, from: P, r: number): P => {
  const d = dist(from, c);
  return [c[0] + ((from[0] - c[0]) / d) * r, c[1] + ((from[1] - c[1]) / d) * r];
};

// ---- wide scene (dendrites left, axon right) ---------------------------------
function wideScene(): Scene {
  const soma = { cx: 471, cy: 224, rx: 62, ry: 48 };
  const nuc = { cx: 454, cy: 226, r: 27 };
  const nucC: P = [nuc.cx, nuc.cy];
  // one shared trunk leaves the soma and splits at J into three twigs
  const TR = S([456, 226, 426, 228, 394, 222, 330, 224]);
  const A1 = S([330, 224, 318, 190, 288, 120, 226, 70]);
  const A2 = S([330, 224, 306, 224, 270, 224, 218, 224]);
  const B1 = S([330, 224, 318, 258, 288, 328, 226, 378]);
  const AX = S([531, 224, 570, 214, 625, 236, 666, 222]);
  const cA1 = curve(A1);
  const cA2 = curve(A2);
  const cB1 = curve(B1);
  const cAX = curve(AX);
  const o = { r: 56, back: 36, rib: [-46, -33, -20], spineAt: -26 };

  const n1 = neighborhood(cA1, "g4", [1, -0.5], o);
  const n2 = neighborhood(cA2, "plain", [0, -1], o);
  const n3 = neighborhood(cB1, "edit", [1, 0.5], o);

  const spines: Spine[] = [n1.spine, n2.spine, n3.spine];
  spines.push(spine(cA1, cA1.len * 0.3, [1, 0], 11, 6));
  spines.push(spine(cB1, cB1.len * 0.3, [1, 0], 11, 6));

  // release: nucleus ring -> partway along the shared trunk, well before the fork and pointing along its axis
  const t0 = scanT(TR, (p) => dist(p, nucC) >= nuc.r + 3);
  const t1 = scanT(TR, (p) => p[0] <= 372);
  const release = [sub(TR, t0, t1)];
  // return: from the axon hillock, where the spike starts, to the nucleus ring
  const back = [lineSeg([526, 231], [nuc.cx + nuc.r + 3, 230])];
  const spike = [sub(AX, cAX.at(26).t, cAX.at(cAX.len - 10).t)];

  const spikeT = scanT(AX, (p) => p[0] >= 608);
  const g4 = n1.at(14).p;
  const ed = n3.at(14).p;
  const releaseT = scanT(TR, (p) => p[0] <= 392);
  const relP = pt(TR, releaseT);

  return {
    w: 720,
    y0: 2,
    h: 426,
    gs: 1.7,
    g4s: 1.95,
    soma,
    nuc,
    bulb: { cx: 678, cy: 222, rx: 16, ry: 14 },
    tubes: [
      { d: dSeg(TR), w: 34 },
      { d: dSeg(A1), w: 30 },
      { d: dSeg(A2), w: 30 },
      { d: dSeg(B1), w: 30 },
      { d: dSeg(AX), w: 14 },
    ],
    spines,
    rings: [n1.ring, n2.ring, n3.ring],
    glyphs: [...n1.glyphs, ...n2.glyphs, ...n3.glyphs],
    arrows: [release, back, spike],
    lh: 18,
    labels: [
      { x: 24, y: 30, lines: ["ribosome neighborhood"], cls: "text" },
      { x: 24, y: 88, lines: ["structure gates", "translation"], cls: "text" },
      { x: 24, y: 361, lines: ["edits accumulate"], cls: "text" },
      { x: 365, y: 120, lines: ["released and spliced", "on demand"], cls: "flow" },
      { x: 608, y: 142, lines: ["spike: passes context", "to the network"], cls: "flow", anchor: "middle" },
      { x: 360, y: 322, lines: ["pre-made RNAs held", "in the nucleus"], cls: "text" },
      { x: 520, y: 322, lines: ["spike also signals", "which RNAs to replenish"], cls: "flow" },
    ],
    leaders: [
      [[184, 27], toward(n1.ring.c, [184, 27], n1.ring.r + 2)],
      [[130, 84], toward(g4, [130, 84], 12)],
      [[134, 356], toward(ed, [134, 356], 14)],
      [[392, 152], [relP[0], relP[1] - 6]],
      [[608, 166], wallOff(AX, spikeT, [0, -1], 7)],
      [[424, 306], toward(nucC, [424, 306], nuc.r + 2)],
      [[528, 306], [508, 238]],
    ],
  };
}

// ---- tall scene (nucleus on top, dendrites below, axon off the right) --------
function tallScene(): Scene {
  const soma = { cx: 66, cy: 76, rx: 46, ry: 46 };
  const nuc = { cx: 52, cy: 80, r: 24 };
  const nucC: P = [nuc.cx, nuc.cy];
  const TR = S([64, 100, 60, 230, 68, 370, 64, 500]);
  const A = S([70, 250, 82, 276, 108, 296, 150, 348]);
  const B = S([66, 400, 78, 428, 106, 450, 148, 500]);
  const AX = S([112, 66, 150, 54, 205, 68, 266, 50]);
  const cTR = curve(TR);
  const cA = curve(A);
  const cB = curve(B);
  const cAX = curve(AX);
  const o = { r: 46, back: 30, rib: [-36, -24, -12], spineAt: -20 };

  const nA = neighborhood(cA, "g4", [1, 0], o);
  const nB = neighborhood(cB, "edit", [1, 0], o);

  const spines: Spine[] = [nA.spine, nB.spine];
  for (const fr of [0.2, 0.31, 0.5, 0.64, 0.8, 0.93]) spines.push(spine(cTR, cTR.len * fr, [-1, 0], 11, 6));

  const release = [lineSeg([62, 110], [64, 172])];
  const back = [lineSeg([106, 73], [78, 73])];
  const spike = [sub(AX, cAX.at(30).t, cAX.at(cAX.len - 10).t)];
  const g4 = nA.at(14).p;
  const ed = nB.at(14).p;
  const spikeT = scanT(AX, (p) => p[0] >= 222);

  return {
    w: 316,
    y0: -6,
    h: 546,
    gs: 1.35,
    g4s: 1.3,
    soma,
    nuc,
    bulb: { cx: 280, cy: 48, rx: 14, ry: 13 },
    tubes: [
      { d: dSeg(TR), w: 26 },
      { d: dSeg(A), w: 24 },
      { d: dSeg(B), w: 24 },
      { d: dSeg(AX), w: 14 },
    ],
    spines,
    rings: [nA.ring, nB.ring],
    glyphs: [...nA.glyphs, ...nB.glyphs],
    arrows: [release, back, spike],
    lh: 17,
    labels: [
      { x: 132, y: 18, lines: ["spike: passes context", "to the network"], cls: "flow" },
      { x: 188, y: 124, lines: ["spike also", "signals which", "RNAs to", "replenish"], cls: "flow" },
      { x: 188, y: 209, lines: ["pre-made RNAs", "held in the", "nucleus"], cls: "text" },
      { x: 188, y: 277, lines: ["released and", "spliced on", "demand"], cls: "flow" },
      { x: 196, y: 345, lines: ["ribosome", "neighborhood"], cls: "text" },
      { x: 196, y: 396, lines: ["structure gates", "translation"], cls: "text" },
      { x: 196, y: 472, lines: ["edits", "accumulate"], cls: "text" },
    ],
    leaders: [
      [[222, 44], wallOff(AX, spikeT, [0, -1], 7)],
      [[184, 118], [94, 81]],
      [[182, 204], toward(nucC, [182, 204], nuc.r + 2)],
      [[184, 272], [70, 146]],
      [[192, 340], toward(nA.ring.c, [192, 340], nA.ring.r + 2)],
      [[192, 392], toward(g4, [192, 392], 9)],
      [[192, 468], toward(ed, [192, 468], 10)],
    ],
  };
}

const WIDE = wideScene();
const TALL = tallScene();

// ---- drawing ---------------------------------------------------------------
function arrowHead(seg: Seg): string {
  const tip = seg[3];
  const tg = tan(seg, 1);
  const a = Math.atan2(tg[1], tg[0]);
  const L = 11.25;
  const p1: P = [tip[0] - L * Math.cos(a + 0.5), tip[1] - L * Math.sin(a + 0.5)];
  const p2: P = [tip[0] - L * Math.cos(a - 0.5), tip[1] - L * Math.sin(a - 0.5)];
  return `M${f(p1[0])} ${f(p1[1])} L${f(tip[0])} ${f(tip[1])} L${f(p2[0])} ${f(p2[1])}`;
}
const arrowD = (segs: Seg[]) =>
  `M${f(segs[0][0][0])} ${f(segs[0][0][1])} ${segs.map((s) => dSeg(s, false)).join(" ")}`;

function GlyphShape({ g, gs, g4s }: { g: Glyph; gs: number; g4s: number }): ReactNode {
  const base = `translate(${f(g.p[0])} ${f(g.p[1])}) rotate(${f((g.a * 180) / Math.PI)})`;
  switch (g.k) {
    case "rib":
      // small subunit riding on the large one
      return (
        <g transform={base}>
          <ellipse className={styles.ribL} cx="0" cy="1.2" rx="5.4" ry="3.8" />
          <ellipse className={styles.ribS} cx="0.4" cy="-3.5" rx="3.7" ry="2.5" />
        </g>
      );
    case "plain":
      return (
        <g transform={`${base} scale(${gs})`}>
          <path className={styles.strand} d="M-10 0 q2.5 -3.4 5 0 t5 0 t5 0 t5 0" />
        </g>
      );
    case "edit":
      // the same strand, carrying accumulated marks
      return (
        <g transform={`${base} scale(${gs})`}>
          <path className={styles.strand} d="M-11 0 q2.75 -3.4 5.5 0 t5.5 0 t5.5 0 t5.5 0" />
          {[-8.25, -2.75, 2.75, 8.25].map((x, i) => (
            <circle key={x} className={styles.mark} cx={x} cy={i % 2 ? 1.7 : -1.7} r="1.8" />
          ))}
        </g>
      );
    case "g4":
      // a guanine quadruplex: three stacked tetrads with the strand looping between them
      return (
        <g transform={`${base} scale(${g4s})`}>
          <path
            className={styles.strand}
            d="M-12 5.6 q2 -3 4 0 t4 0 M4 5.6 q5 -2.8 0 -5.6 M-4 0 q-5 -2.8 0 -5.6 M4 -5.6 q2 -3 4 0 t4 0"
          />
          {[-5.6, 0, 5.6].map((y) => (
            <rect key={y} className={styles.quad} x="-4" y={y - 1.7} width="8" height="3.4" rx="0.7" />
          ))}
        </g>
      );
  }
}

function SceneSvg({ sc, className, tall, aria }: { sc: Scene; className: string; tall: boolean; aria: string }) {
  const sfx = tall ? "V" : "";
  const outerW = (w: number) => w + 2 * WALL;
  return (
    <svg viewBox={`0 ${sc.y0} ${sc.w} ${sc.h}`} className={className} role="img" aria-label={aria}>
      <title>{aria}</title>

      {/* cell walls: every process is stroked wide in the wall color, then again narrower in the page color */}
      <g className={styles.wall}>
        {sc.tubes.map((t, i) => (
          <path key={i} d={t.d} strokeWidth={outerW(t.w)} />
        ))}
        {sc.spines.map((s, i) => (
          <g key={i}>
            <path d={s.d} strokeWidth={outerW(SPINE_W)} />
            <circle className={styles.wallFill} cx={s.head[0]} cy={s.head[1]} r={s.hr + WALL} />
          </g>
        ))}
        <ellipse className={styles.wallFill} cx={sc.bulb.cx} cy={sc.bulb.cy} rx={sc.bulb.rx + WALL} ry={sc.bulb.ry + WALL} />
        <ellipse className={styles.wallFill} cx={sc.soma.cx} cy={sc.soma.cy} rx={sc.soma.rx + WALL} ry={sc.soma.ry + WALL} />
      </g>
      <g className={styles.cyto}>
        {sc.tubes.map((t, i) => (
          <path key={i} d={t.d} strokeWidth={t.w} />
        ))}
        {sc.spines.map((s, i) => (
          <g key={i}>
            <path d={s.d} strokeWidth={SPINE_W} />
            <circle className={styles.cytoFill} cx={s.head[0]} cy={s.head[1]} r={s.hr} />
          </g>
        ))}
        <ellipse className={styles.cytoFill} cx={sc.bulb.cx} cy={sc.bulb.cy} rx={sc.bulb.rx} ry={sc.bulb.ry} />
        <ellipse className={styles.cytoFill} cx={sc.soma.cx} cy={sc.soma.cy} rx={sc.soma.rx} ry={sc.soma.ry} />
      </g>

      {sc.rings.map((r, i) => (
        <circle key={i} className={styles.ring} cx={f(r.c[0])} cy={f(r.c[1])} r={r.r} />
      ))}

      {/* nucleus: pre-made RNAs, each a short strand with a retained-intron loop */}
      <g transform={`translate(${sc.nuc.cx} ${sc.nuc.cy})`}>
        <circle className={styles.nucleus} r={sc.nuc.r} />
        <path
          className={styles.strand}
          d="M-10 -12 h7 a3.4 3.4 0 1 1 4.6 0 h7 M-6 0 h7 a3.4 3.4 0 1 1 4.6 0 h7 M-12 12 h7 a3.4 3.4 0 1 1 4.6 0 h7"
        />
      </g>

      {sc.glyphs.map((g, i) => (
        <GlyphShape key={i} g={g} gs={sc.gs} g4s={sc.g4s} />
      ))}

      {sc.arrows.map((a, i) => (
        <g key={i}>
          <path className={styles.arrow} d={arrowD(a)} />
          <path className={styles.arrow} d={arrowHead(a[a.length - 1])} />
        </g>
      ))}

      {sc.leaders.map(([a, b], i) => (
        <line key={i} className={styles.leader} x1={f(a[0])} y1={f(a[1])} x2={f(b[0])} y2={f(b[1])} />
      ))}

      {sc.labels.map((l) => (
        <text key={l.lines[0]} className={styles[`${l.cls}${sfx}`]} textAnchor={l.anchor ?? "start"}>
          {l.lines.map((ln, i) => (
            <tspan key={ln} x={l.x} y={l.y + i * sc.lh}>
              {ln}
            </tspan>
          ))}
        </text>
      ))}
    </svg>
  );
}

const ARIA =
  "Schematic of the ribosome neighborhood model on one neuron, with a soma, nucleus, branching dendrites with spines, and an axon to a terminal. " +
  "The nucleus holds pre-made RNAs, short strands that keep an intron. " +
  "Along the dendrites, dashed rings mark ribosome neighborhoods, each holding ribosomes and local mRNAs. In one, an mRNA's structure gates its own translation; in another, an mRNA accumulates edits. " +
  "A spike runs down the axon and passes context to the network. " +
  "The spike also signals back from the axon hillock to the nucleus which RNAs to replenish. " +
  "Those RNAs are released from the nucleus to the shared dendritic trunk and spliced on demand.";

export function NeighborhoodFigure() {
  return (
    <div className={styles.wrap}>
      <SceneSvg sc={WIDE} className={styles.wide} tall={false} aria={ARIA} />
      <SceneSvg sc={TALL} className={styles.tall} tall aria={ARIA} />
    </div>
  );
}
