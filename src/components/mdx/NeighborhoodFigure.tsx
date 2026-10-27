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
  h: number;
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

const RING_R = 42;
const RING_BACK = 30; // ring centre sits this far (arc) behind the dendrite tip

// a ribosome neighborhood at the tip of a twig: ring, glyphs along the shaft, one spine whose head holds a ribosome
function neighborhood(cv: Curve, state: "g4" | "plain" | "edit", spineDir: P) {
  const c0 = cv.len - RING_BACK;
  const ring: Ring = { c: cv.at(c0).p, r: RING_R };
  const g = (s: number, k: GlyphKind): Glyph => {
    const q = cv.at(c0 + s);
    return { k, p: q.p, a: q.a };
  };
  const glyphs: Glyph[] = [g(-30, "rib"), g(-16, "rib"), g(13, state === "g4" ? "g4" : state === "edit" ? "edit" : "plain")];
  const sp = spine(cv, c0 - 3, spineDir, 11, 8);
  glyphs.push({ k: "rib", p: sp.head, a: Math.atan2(sp.n[0], -sp.n[1]) });
  return { ring, glyphs, spine: sp as Spine, at: (s: number) => cv.at(c0 + s) };
}

// ---- wide scene (dendrites left, axon right) ---------------------------------
function wideScene(): Scene {
  const soma = { cx: 455, cy: 224, rx: 54, ry: 46 };
  const nuc = { cx: 455, cy: 226, r: 27 };
  const nucC: P = [nuc.cx, nuc.cy];
  const P1 = S([440, 208, 405, 190, 372, 170, 338, 152]);
  const A1 = S([338, 152, 310, 136, 268, 116, 232, 92]);
  const A2 = S([338, 152, 318, 174, 280, 200, 232, 216]);
  const P2 = S([440, 240, 405, 262, 375, 285, 345, 302]);
  const B1 = S([345, 302, 318, 318, 276, 338, 232, 342]);
  const AX = S([500, 223, 550, 213, 610, 236, 664, 222]);
  const cA1 = curve(A1);
  const cA2 = curve(A2);
  const cB1 = curve(B1);
  const cAX = curve(AX);

  const n1 = neighborhood(cA1, "g4", [0, -1]);
  const n2 = neighborhood(cA2, "plain", [0, -1]);
  const n3 = neighborhood(cB1, "edit", [0, 1]);

  const spines: Spine[] = [n1.spine, n2.spine, n3.spine];
  const extra = (cv: Curve, frac: number, dir: P, len = 11, hr = 6) => spines.push(spine(cv, cv.len * frac, dir, len, hr));
  extra(cA1, 0.38, [0, -1]);
  extra(cA1, 0.55, [0, 1]);
  extra(cA2, 0.3, [0, 1]);
  extra(cB1, 0.2, [0, -1]);

  // arrows live on the dendrite centre lines
  const t0 = scanT(P1, (p) => dist(p, nucC) >= nuc.r + 7);
  const tEnd = scanT(A1, (p) => dist(p, n1.ring.c) <= n1.ring.r - 3);
  const release = [sub(P1, t0, 1), sub(A1, 0, tEnd)];
  const tS = scanT(B1, (p) => dist(p, n3.ring.c) >= n3.ring.r - 3, 1, 0);
  const tE = scanT(P2, (p) => dist(p, nucC) <= nuc.r + 7, 1, 0);
  const back = [rev(sub(B1, 0, tS)), rev(sub(P2, tE, 1))];
  const spike = [sub(AX, cAX.at(34).t, cAX.at(cAX.len - 10).t)];

  const wallOff = (s: Seg, t: number, dir: P, half: number): P => {
    const p = pt(s, t);
    const tg = tan(s, t);
    let n: P = [-tg[1], tg[0]];
    if (n[0] * dir[0] + n[1] * dir[1] < 0) n = [-n[0], -n[1]];
    return [p[0] + n[0] * (half + 3), p[1] + n[1] * (half + 3)];
  };
  const circleEdge = (from: P, c: P, r: number): P => {
    const d = dist(from, c);
    return [c[0] + ((from[0] - c[0]) / d) * r, c[1] + ((from[1] - c[1]) / d) * r];
  };

  const releaseT = scanT(P1, (p) => p[0] <= 372);
  const returnT = scanT(P2, (p) => p[0] <= 385, 1, 0);
  const spikeT = scanT(AX, (p) => p[0] >= 585);

  const g4 = n1.at(24).p;
  const ed = n3.at(24).p;

  return {
    w: 720,
    h: 408,
    soma,
    nuc,
    bulb: { cx: 676, cy: 222, rx: 16, ry: 14 },
    tubes: [
      { d: dSeg(P1), w: 24 },
      { d: dSeg(P2), w: 24 },
      { d: dSeg(A1), w: 20 },
      { d: dSeg(A2), w: 20 },
      { d: dSeg(B1), w: 20 },
      { d: dSeg(AX), w: 12 },
    ],
    spines,
    rings: [n1.ring, n2.ring, n3.ring],
    glyphs: [...n1.glyphs, ...n2.glyphs, ...n3.glyphs],
    arrows: [release, back, spike],
    lh: 18,
    labels: [
      { x: 8, y: 34, lines: ["ribosome neighborhood"], cls: "text" },
      { x: 8, y: 104, lines: ["structure gates", "translation"], cls: "text" },
      { x: 8, y: 347, lines: ["edits accumulate"], cls: "text" },
      { x: 345, y: 90, lines: ["released and spliced", "on demand"], cls: "flow" },
      { x: 585, y: 148, lines: ["spike: passes context", "to the network"], cls: "flow", anchor: "middle" },
      { x: 500, y: 318, lines: ["pre-made RNAs held", "in the nucleus"], cls: "text" },
      { x: 335, y: 366, lines: ["signals which RNAs", "to release"], cls: "flow" },
    ],
    leaders: [
      [[176, 31], circleEdge([176, 31], n1.ring.c, n1.ring.r + 2)],
      [[128, 99], [g4[0] + 4, g4[1] - 1]],
      [[124, 342], [ed[0] + 4, ed[1]]],
      [[372, 126], wallOff(P1, releaseT, [0, -1], 12)],
      [[585, 176], wallOff(AX, spikeT, [0, -1], 6)],
      [[506, 313], circleEdge([506, 313], nucC, nuc.r + 2)],
      [[385, 352], wallOff(P2, returnT, [0, 1], 12)],
    ],
  };
}

// ---- tall scene (nucleus on top, dendrites below, axon off the right) --------
function tallScene(): Scene {
  const soma = { cx: 76, cy: 76, rx: 52, ry: 44 };
  const nuc = { cx: 76, cy: 78, r: 26 };
  const nucC: P = [nuc.cx, nuc.cy];
  const TR = S([76, 100, 70, 200, 82, 330, 76, 470]);
  const A = S([82, 240, 90, 262, 116, 278, 152, 326]);
  const B = S([70, 404, 78, 426, 104, 442, 150, 490]);
  const AX = S([126, 68, 170, 56, 230, 70, 282, 52]);
  const cTR = curve(TR);
  const cA = curve(A);
  const cB = curve(B);
  const cAX = curve(AX);

  const nA = neighborhood(cA, "g4", [1, 0]);
  const nB = neighborhood(cB, "edit", [1, 0]);

  const spines: Spine[] = [nA.spine, nB.spine];
  for (const fr of [0.2, 0.31, 0.5, 0.64, 0.8, 0.93]) spines.push(spine(cTR, cTR.len * fr, [-1, 0], 11, 6));

  const tEnd = scanT(A, (p) => dist(p, nA.ring.c) <= nA.ring.r - 3);
  const release = [lineSeg([82, 112], [82, 240]), sub(A, 0, tEnd)];
  const tS = scanT(B, (p) => dist(p, nB.ring.c) >= nB.ring.r - 3, 1, 0);
  const back = [rev(sub(B, 0, tS)), lineSeg([70, 404], [70, 112])];
  const spike = [sub(AX, cAX.at(30).t, cAX.at(cAX.len - 10).t)];

  const wallOff = (s: Seg, t: number, dir: P, half: number): P => {
    const p = pt(s, t);
    const tg = tan(s, t);
    let n: P = [-tg[1], tg[0]];
    if (n[0] * dir[0] + n[1] * dir[1] < 0) n = [-n[0], -n[1]];
    return [p[0] + n[0] * (half + 3), p[1] + n[1] * (half + 3)];
  };
  const circleEdge = (from: P, c: P, r: number): P => {
    const d = dist(from, c);
    return [c[0] + ((from[0] - c[0]) / d) * r, c[1] + ((from[1] - c[1]) / d) * r];
  };
  const g4 = nA.at(24).p;
  const ed = nB.at(24).p;
  const spikeT = scanT(AX, (p) => p[0] >= 236);

  return {
    w: 316,
    h: 530,
    soma,
    nuc,
    bulb: { cx: 296, cy: 50, rx: 15, ry: 13 },
    tubes: [
      { d: dSeg(TR), w: 26 },
      { d: dSeg(A), w: 20 },
      { d: dSeg(B), w: 20 },
      { d: dSeg(AX), w: 12 },
    ],
    spines,
    rings: [nA.ring, nB.ring],
    glyphs: [...nA.glyphs, ...nB.glyphs],
    arrows: [release, back, spike],
    lh: 17,
    labels: [
      { x: 188, y: 104, lines: ["spike: passes", "context to", "the network"], cls: "flow" },
      { x: 188, y: 158, lines: ["pre-made RNAs", "held in the", "nucleus"], cls: "text" },
      { x: 188, y: 212, lines: ["released and", "spliced on", "demand"], cls: "flow" },
      { x: 196, y: 292, lines: ["ribosome", "neighborhood"], cls: "text" },
      { x: 196, y: 330, lines: ["structure gates", "translation"], cls: "text" },
      { x: 188, y: 378, lines: ["signals which", "RNAs to release"], cls: "flow" },
      { x: 196, y: 472, lines: ["edits", "accumulate"], cls: "text" },
    ],
    leaders: [
      [[236, 92], wallOff(AX, spikeT, [0, 1], 6)],
      [[178, 152], circleEdge([178, 152], nucC, nuc.r + 2)],
      [[182, 228], wallOff(A, 0.3, [1, -1], 10)],
      [[190, 284], circleEdge([190, 284], nA.ring.c, nA.ring.r + 2)],
      [[190, 324], [g4[0] + 3, g4[1] - 1]],
      [[182, 392], wallOff(B, 0.25, [1, -1], 10)],
      [[190, 462], [ed[0] + 3, ed[1]]],
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
  const L = 7.5;
  const p1: P = [tip[0] - L * Math.cos(a + 0.5), tip[1] - L * Math.sin(a + 0.5)];
  const p2: P = [tip[0] - L * Math.cos(a - 0.5), tip[1] - L * Math.sin(a - 0.5)];
  return `M${f(p1[0])} ${f(p1[1])} L${f(tip[0])} ${f(tip[1])} L${f(p2[0])} ${f(p2[1])}`;
}
const arrowD = (segs: Seg[]) =>
  `M${f(segs[0][0][0])} ${f(segs[0][0][1])} ${segs.map((s) => dSeg(s, false)).join(" ")}`;

function GlyphShape({ g }: { g: Glyph }): ReactNode {
  const tf = `translate(${f(g.p[0])} ${f(g.p[1])}) rotate(${f((g.a * 180) / Math.PI)})`;
  switch (g.k) {
    case "rib":
      // small subunit riding on the large one
      return (
        <g transform={tf}>
          <ellipse className={styles.ribL} cx="0" cy="1.2" rx="5.4" ry="3.8" />
          <ellipse className={styles.ribS} cx="0.4" cy="-3.5" rx="3.7" ry="2.5" />
        </g>
      );
    case "plain":
      return (
        <g transform={tf}>
          <path className={styles.strand} d="M-10 0 q2.5 -3.4 5 0 t5 0 t5 0 t5 0" />
        </g>
      );
    case "edit":
      // the same strand, carrying accumulated marks
      return (
        <g transform={tf}>
          <path className={styles.strand} d="M-11 0 q2.75 -3.4 5.5 0 t5.5 0 t5.5 0 t5.5 0" />
          {[-8.25, -2.75, 2.75, 8.25].map((x, i) => (
            <circle key={x} className={styles.mark} cx={x} cy={i % 2 ? 1.7 : -1.7} r="2.1" />
          ))}
        </g>
      );
    case "g4":
      // a guanine quadruplex: stacked tetrads with the strand looping between them
      return (
        <g transform={tf}>
          <path
            className={styles.strand}
            d="M-11 5 q1.9 -2.8 3.8 0 t3.6 0 M3.6 5 q4.5 -2.5 0 -5 M-3.6 0 q-4.5 -2.5 0 -5 M3.6 -5 q1.9 -2.8 3.8 0 t3.6 0"
          />
          {[-5, 0, 5].map((y) => (
            <rect key={y} className={styles.quad} x="-3.6" y={y - 1.5} width="7.2" height="3" rx="0.7" />
          ))}
        </g>
      );
  }
}

function SceneSvg({ sc, className, tall, aria }: { sc: Scene; className: string; tall: boolean; aria: string }) {
  const sfx = tall ? "V" : "";
  const outerW = (w: number) => w + 2 * WALL;
  return (
    <svg viewBox={`0 0 ${sc.w} ${sc.h}`} className={className} role="img" aria-label={aria}>
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
        <GlyphShape key={i} g={g} />
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
  "A return signal from the dendrites to the nucleus says which RNAs to release. " +
  "Those RNAs are released and spliced on demand.";

export function NeighborhoodFigure() {
  return (
    <div className={styles.wrap}>
      <SceneSvg sc={WIDE} className={styles.wide} tall={false} aria={ARIA} />
      <SceneSvg sc={TALL} className={styles.tall} tall aria={ARIA} />
    </div>
  );
}
