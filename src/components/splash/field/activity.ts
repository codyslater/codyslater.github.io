// Rule 1's coarse scalar field: deposits from firing nodes, arriving signals and the pointer,
// slight diffusion, half-life decay. Pure.

const ACTIVITY_CELL = 32;
const ACTIVITY_HALF_LIFE = 10; // seconds

export class ActivityField {
  readonly cols: number;
  readonly rows: number;
  private a: Float32Array;
  private tmp: Float32Array;

  constructor(readonly w: number, readonly h: number) {
    this.cols = Math.ceil(w / ACTIVITY_CELL) + 2;
    this.rows = Math.ceil(h / ACTIVITY_CELL) + 2;
    this.a = new Float32Array(this.cols * this.rows);
    this.tmp = new Float32Array(this.cols * this.rows);
  }

  /** Add `amount` with a smooth compact kernel of the given radius. */
  deposit(x: number, y: number, amount: number, radius: number): void {
    const c0 = Math.max(0, Math.floor((x - radius) / ACTIVITY_CELL));
    const c1 = Math.min(this.cols - 1, Math.ceil((x + radius) / ACTIVITY_CELL));
    const r0 = Math.max(0, Math.floor((y - radius) / ACTIVITY_CELL));
    const r1 = Math.min(this.rows - 1, Math.ceil((y + radius) / ACTIVITY_CELL));
    const r2 = radius * radius;
    for (let r = r0; r <= r1; r++) {
      const py = r * ACTIVITY_CELL - y;
      for (let c = c0; c <= c1; c++) {
        const px = c * ACTIVITY_CELL - x;
        const d2 = px * px + py * py;
        if (d2 >= r2) continue;
        const k = 1 - d2 / r2;
        this.a[r * this.cols + c] += amount * k * k;
      }
    }
  }

  step(dt: number): void {
    const decay = Math.pow(0.5, dt / ACTIVITY_HALF_LIFE);
    const k = Math.min(0.25, 0.35 * dt);
    const { cols, rows, a, tmp } = this;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const v = a[i];
        const l = c > 0 ? a[i - 1] : v;
        const rr = c < cols - 1 ? a[i + 1] : v;
        const u = r > 0 ? a[i - cols] : v;
        const d = r < rows - 1 ? a[i + cols] : v;
        tmp[i] = (v + k * ((l + rr + u + d) * 0.25 - v)) * decay;
      }
    }
    this.a = tmp;
    this.tmp = a;
  }

  sample(x: number, y: number): number {
    const fx = Math.min(this.cols - 1.001, Math.max(0, x / ACTIVITY_CELL));
    const fy = Math.min(this.rows - 1.001, Math.max(0, y / ACTIVITY_CELL));
    const c = Math.floor(fx);
    const r = Math.floor(fy);
    const tx = fx - c;
    const ty = fy - r;
    const i = r * this.cols + c;
    const a = this.a;
    return (
      (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) +
      (a[i + this.cols] * (1 - tx) + a[i + this.cols + 1] * tx) * ty
    );
  }

  total(): number {
    let s = 0;
    for (let i = 0; i < this.a.length; i++) s += this.a[i];
    return s;
  }
}
