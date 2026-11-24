// The blend field t(x, y, time) in [0, 1]: 0 = circuit board, 1 = organic.
// Composition: the board is an L along the left edge and the bottom (portrait: bottom plus the left edge below
// the top corners); the organic part sits in corner clusters on the far side. Between them is a melting band about
// a third of the screen wide. On top of the base: slow low-frequency noise and rule 1's activity, released from
// "all board" by the opening sweep. Evaluated on a coarse grid and sampled bilinearly.

import { ActivityField } from "./activity";
import { clamp, smoothstep, valueNoise } from "./rng";

const CELL = 40;
const WAVE_AT = 0.62; // typing progress at which the melt wave starts (about one second before the end)
const WAVE_U0 = 0.3; // wave front start (0 = board, 1 = organic)
const WAVE_SPEED = 0.6; // front speed, span per second
const WAVE_BAND = 0.16; // soft width of the front, in span
const ACT_MAX = 0.62; // largest t the activity term can add
const MIN_FRACTION = 0.25; // share of the screen that must stay clear board (t < 0.3)

interface Cluster {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Share of the organic nodes. */
  share: number;
}

/** How much of the board shows at (x, y): 1 on the board, 0 in the organic part. */
export function boardness(x: number, y: number, w: number, h: number): number {
  const fx = x / w;
  const fy = y / h;
  if (w >= h) {
    const left = 1 - smoothstep(0.14, 0.46, fx);
    const bottom = smoothstep(0.52, 0.84, fy) * (1 - smoothstep(0.5, 0.82, fx));
    return Math.max(left, bottom);
  }
  const left = (1 - smoothstep(0.2, 0.46, fx)) * smoothstep(0.1, 0.38, fy);
  const bottom = smoothstep(0.4, 0.7, fy);
  return Math.max(left, bottom);
}

/** The organic corner clusters: landscape top-right and bottom-right; portrait both top corners. */
function clustersFor(w: number, h: number): Cluster[] {
  if (w >= h) {
    return [
      { cx: 0.85 * w, cy: 0.2 * h, rx: 0.12 * w, ry: 0.15 * h, share: 0.4 },
      { cx: 0.85 * w, cy: 0.79 * h, rx: 0.12 * w, ry: 0.14 * h, share: 0.6 },
    ];
  }
  return [
    { cx: 0.26 * w, cy: 0.13 * h, rx: 0.2 * w, ry: 0.085 * h, share: 0.5 },
    { cx: 0.76 * w, cy: 0.13 * h, rx: 0.2 * w, ry: 0.085 * h, share: 0.5 },
  ];
}

export class BlendField {
  readonly cols: number;
  readonly rows: number;
  readonly clusters: Cluster[];
  private b: Float32Array;
  private act: Float32Array;
  private tg: Float32Array;
  private releaseAt: Float32Array;
  private scale = 1;
  private waveStart = -1;
  private settled = false;
  fracLow = 1;
  fracHigh = 0;

  constructor(readonly w: number, readonly h: number) {
    this.cols = Math.ceil(w / CELL) + 1;
    this.rows = Math.ceil(h / CELL) + 1;
    const n = this.cols * this.rows;
    this.b = new Float32Array(n);
    this.act = new Float32Array(n);
    this.tg = new Float32Array(n);
    this.releaseAt = new Float32Array(n).fill(-1);
    this.clusters = clustersFor(w, h);
  }

  /** 0 on the board .. 1 in the organic part, from the composition alone. */
  uOf(x: number, y: number): number {
    return 1 - boardness(x, y, this.w, this.h);
  }

  /** Base composition + noise, before the opening release and activity. */
  basePart(x: number, y: number, time: number): number {
    const base = this.uOf(x, y);
    const wl = 0.4 * Math.max(this.w, this.h);
    const n = valueNoise(x / wl + time * 0.045 + 3.1, y / wl - time * 0.033 + 7.7) - 0.5;
    const near = 4 * base * (1 - base);
    const breath = 0.85 + 0.15 * Math.sin(time * 0.21);
    return clamp(base + n * 0.34 * (0.35 + 0.65 * near) * breath);
  }

  /** Mark the whole field as released (reduced motion). */
  settle(): void {
    this.releaseAt.fill(0);
    this.settled = true;
  }

  update(time: number, reveal: number, activity: ActivityField): void {
    const { cols, rows } = this;
    if (this.waveStart < 0 && reveal >= WAVE_AT) this.waveStart = time;
    // The melt wave: a front travelling from the board toward the organic part; behind it
    // the base is released. Released cells stay released.
    const uf = this.waveStart < 0 ? -1 : WAVE_U0 + (time - this.waveStart) * WAVE_SPEED;
    for (let r = 0; r < rows; r++) {
      const y = r * CELL;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = c * CELL;
        let rel = 1;
        if (!this.settled) {
          const wave = uf < 0 ? 0 : smoothstep(0, 1, (uf - this.uOf(x, y)) / WAVE_BAND);
          if (wave > this.releaseAt[i]) this.releaseAt[i] = wave;
          rel = this.releaseAt[i] < 0 ? 0 : this.releaseAt[i];
        }
        this.b[i] = rel > 0 ? this.basePart(x, y, time) * rel : 0;
        this.act[i] = ACT_MAX * smoothstep(0.04, 1.1, activity.sample(x, y));
      }
    }
    // Pick the largest activity scale that still leaves enough clear board.
    const n = cols * rows;
    let target = 0;
    for (const sc of [1, 0.8, 0.6, 0.4, 0.2, 0]) {
      let low = 0;
      for (let i = 0; i < n; i++) if (this.b[i] + sc * this.act[i] < 0.3) low++;
      target = sc;
      if (low / n >= MIN_FRACTION) break;
    }
    this.scale = target < this.scale ? target : this.scale + (target - this.scale) * 0.1;
    let low = 0;
    let high = 0;
    for (let i = 0; i < n; i++) {
      const t = clamp(this.b[i] + this.scale * this.act[i]);
      this.tg[i] = t;
      if (t < 0.3) low++;
      else if (t > 0.7) high++;
    }
    this.fracLow = low / n;
    this.fracHigh = high / n;
  }

  at(x: number, y: number): number {
    const fx = clamp(x / CELL, 0, this.cols - 1.001);
    const fy = clamp(y / CELL, 0, this.rows - 1.001);
    const c = Math.floor(fx);
    const r = Math.floor(fy);
    const tx = fx - c;
    const ty = fy - r;
    const i = r * this.cols + c;
    const g = this.tg;
    return (
      (g[i] * (1 - tx) + g[i + 1] * tx) * (1 - ty) +
      (g[i + this.cols] * (1 - tx) + g[i + this.cols + 1] * tx) * ty
    );
  }
}
