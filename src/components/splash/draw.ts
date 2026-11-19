// Canvas drawing for the splash field. Reads the simulation's per-frame geometry; owns sprites
// and the board texture. Not part of the pure logic (it creates canvases).

import { clamp, lerp, smoothstep } from "./field/rng";
import { quietAlpha } from "./field/quiet";
import type { Sim } from "./field/sim";
import { FADE_OUT, FIELD_RGB, MAX_SAMPLES, type FNode, type Signal, type Wire } from "./field/types";

// The look: a board trace is rgb 58 at full alpha, 1.5 px; toward the cells it goes to rgb 136 at alpha 0.22 and
// tapers 1.5 -> 0.6 px along its length; one 2.2 px ring "via" at the elbow of a trace (rgb 96, gone by t = 0.35);
// pads are 10 px squares and chips 22x14 with 1x3 pin ticks, both in the field color at alpha 0.85 with a darker inset;
// cells are discs of radius ~6 at alpha 0.6 with a soft highlight, and a soft glow on hub cells.
const BOARD_G = 58;
const STRAND_G = 136;
const STRAND_A = 0.22;
const TRACE_W = 1.5;
const VIA_R = 2.2;
const CHIP_W = 22;
const CHIP_H = 14;
const PAD_HALF = 5;
const STEP = 16;
const TILE = 64;

interface DrawView {
  w: number;
  h: number;
  dpr: number;
  mouse: { x: number; y: number };
  /** Reduced motion: no size changes, no rings; pulses only brighten. */
  calm?: boolean;
}

interface Leaver {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  field: number;
  delay: number;
}

const px = new Float32Array(MAX_SAMPLES + 2);
const py = new Float32Array(MAX_SAMPLES + 2);
const sw = new Float32Array(MAX_SAMPLES);
const sa = new Float32Array(MAX_SAMPLES);
const sr = new Float32Array(MAX_SAMPLES);
const sg = new Float32Array(MAX_SAMPLES);
const sb = new Float32Array(MAX_SAMPLES);
const sc = new Uint8Array(MAX_SAMPLES);
const ok = new Uint8Array(MAX_SAMPLES);

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export class Renderer {
  private hl: HTMLCanvasElement;
  private glows: HTMLCanvasElement[] = [];
  private texture: HTMLCanvasElement | null = null;
  private textureKey = "";
  private layer: HTMLCanvasElement | null = null;
  private layerAt = -1;
  private leavers: Leaver[] = [];
  private leaveAt = -1;

  constructor(private ctx: CanvasRenderingContext2D) {
    // the soft off-center highlight of a cell (white, fading out)
    this.hl = mkCanvas(64, 64);
    const hx = this.hl.getContext("2d");
    if (hx) {
      const grad = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      hx.fillStyle = grad;
      hx.fillRect(0, 0, 64, 64);
    }
    for (const [r, g, b] of FIELD_RGB) {
      const g2 = mkCanvas(64, 64);
      const y = g2.getContext("2d");
      if (y) {
        const grad = y.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},0.3)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        y.fillStyle = grad;
        y.fillRect(0, 0, 64, 64);
      }
      this.glows.push(g2);
    }
  }

  /** Board texture: a 16 px dot grid at ~4% alpha, absent near the quiet zone. Cached per layout. */
  private ensureTexture(sim: Sim): void {
    const key = `${sim.w}x${sim.h}|` + sim.quiet.map((r) => `${Math.round(r.x0)},${Math.round(r.y0)},${Math.round(r.x1)},${Math.round(r.y1)}`).join(";");
    if (key === this.textureKey && this.texture) return;
    this.textureKey = key;
    const c = mkCanvas(sim.w, sim.h);
    const x = c.getContext("2d");
    if (x) {
      for (let gx = 0; gx <= sim.w; gx += STEP) {
        for (let gy = 0; gy <= sim.h; gy += STEP) {
          const qa = quietAlpha(sim.quiet, gx, gy);
          if (qa < 0.03) continue;
          x.fillStyle = `rgba(255,255,255,${(0.045 * qa).toFixed(4)})`;
          x.fillRect(gx - 0.5, gy - 0.5, 1, 1);
        }
      }
    }
    this.texture = c;
  }

  startLeave(sim: Sim): void {
    const alive = sim.nodes.filter((n) => n.alive);
    this.leavers = [];
    const tx = sim.w / 2;
    const ty = Math.max(60, sim.h / 2 - 150);
    const count = Math.min(40, alive.length * 2);
    for (let i = 0; i < count; i++) {
      const n = alive[i % alive.length];
      this.leavers.push({
        x0: n.dx + (Math.random() - 0.5) * 10,
        y0: n.dy + (Math.random() - 0.5) * 10,
        x1: tx + (Math.random() - 0.5) * 70,
        y1: ty + (Math.random() - 0.5) * 70,
        field: n.field,
        delay: Math.random() * 0.25,
      });
    }
    this.leaveAt = performance.now();
  }

  draw(sim: Sim, v: DrawView): void {
    const ctx = this.ctx;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    const power = sim.score.powerOn(sim);
    ctx.lineJoin = "round";

    // board texture: tiles fade with t; the composite is rebuilt about 8 times a second, not every frame
    this.ensureTexture(sim);
    if (this.texture) {
      if (!this.layer || this.layer.width !== this.texture.width || this.layer.height !== this.texture.height) {
        this.layer = mkCanvas(this.texture.width, this.texture.height);
        this.layerAt = -1;
      }
      if (this.layerAt < 0 || sim.time - this.layerAt > 0.12 || sim.time < this.layerAt) {
        this.layerAt = sim.time;
        const lc = this.layer.getContext("2d");
        if (lc) {
          lc.clearRect(0, 0, this.layer.width, this.layer.height);
          for (let ty = 0; ty < sim.h; ty += TILE) {
            for (let tx = 0; tx < sim.w; tx += TILE) {
              const a = (1 - sim.field.at(tx + TILE / 2, ty + TILE / 2)) * power;
              if (a < 0.02) continue;
              lc.globalAlpha = a;
              const tw = Math.min(TILE, sim.w - tx);
              const th = Math.min(TILE, sim.h - ty);
              lc.drawImage(this.texture, tx, ty, tw, th, tx, ty, tw, th);
            }
          }
        }
      }
      ctx.drawImage(this.layer, 0, 0);
    }

    // traces that run off the screen edge
    for (const s of sim.stubs) {
      const a = power * (1 - smoothstep(0.2, 0.6, s.node.t)) * quietAlpha(sim.quiet, s.x0, s.y0, 0, "wire");
      if (a < 0.02 || !s.node.alive) continue;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.lineWidth = TRACE_W;
      ctx.lineCap = "butt";
      ctx.strokeStyle = `rgba(${BOARD_G},${BOARD_G},${BOARD_G},${a.toFixed(3)})`;
      ctx.stroke();
    }
    for (const w of sim.wires) this.wire(sim, w, power);
    for (const s of sim.signals) this.signal(sim, s, power);
    for (const n of sim.nodes) if (n.alive) this.node(sim, n, v, power);

    if (this.leaveAt >= 0) this.drawLeave();
  }

  private drawLeave(): void {
    const ctx = this.ctx;
    const el = (performance.now() - this.leaveAt) / 1000;
    for (const p of this.leavers) {
      const k = clamp((el - p.delay) / 0.38);
      const e = k * k * (3 - 2 * k);
      const x = p.x0 + (p.x1 - p.x0) * e;
      const y = p.y0 + (p.y1 - p.y0) * e - Math.sin(k * Math.PI) * 18;
      const [r, g, b] = FIELD_RGB[p.field];
      ctx.fillStyle = `rgba(${r},${g},${b},${(0.9 * (1 - k * 0.3)).toFixed(3)})`;
      ctx.fillRect(Math.round(x - 1.5), Math.round(y - 1.5), 3, 3);
    }
  }

  // ---------------------------------------------------------------- wires
  private wire(sim: Sim, w: Wire, power: number): void {
    const n = w.n;
    if (n < 2) return;
    const ctx = this.ctx;
    let fade = power * clamp((sim.time - w.born) / 0.8);
    if (w.dying >= 0) fade *= clamp(1 - (sim.time - w.dying) / FADE_OUT);
    if (fade < 0.01) return;

    // clip to the draw-in head
    let m = n;
    const head = w.grow < 1 ? w.grow * w.len : Infinity;
    for (let k = 0; k < n; k++) {
      px[k] = w.x[k];
      py[k] = w.y[k];
    }
    if (head < w.len) {
      m = 1;
      while (m < n && w.cum[m] <= head) m++;
      if (m < n) {
        const f = (head - w.cum[m - 1]) / Math.max(1e-6, w.cum[m] - w.cum[m - 1]);
        px[m] = px[m - 1] + (w.x[m] - px[m - 1]) * f;
        py[m] = py[m - 1] + (w.y[m] - py[m - 1]) * f;
        m++;
      }
    }

    for (let k = 0; k < m - 1; k++) {
      const t = (w.t[k] + w.t[k + 1]) * 0.5;
      const q = Math.min(w.qa[k], w.qa[k + 1]);
      // grey rgb 58 -> 136, alpha 1 -> 0.22, width 1.5 -> a taper from 1.5 down to 0.6 along the wire
      const step = Math.min(4, Math.floor(((k + 0.5) / (n - 1)) * 5));
      const taper = 1.6 - (1.0 * (step + 0.5)) / 5;
      const g = lerp(BOARD_G, STRAND_G, t);
      const a = lerp(1, STRAND_A, t) * q * fade;
      ok[k] = a > 0.012 ? 1 : 0;
      sw[k] = lerp(TRACE_W, taper, t);
      sa[k] = a;
      sr[k] = g;
      sg[k] = g;
      sb[k] = g;
      sc[k] = t < 0.5 ? 0 : 1;
    }

    // merge neighbouring segments of similar style into one stroke
    let k = 0;
    while (k < m - 1) {
      if (!ok[k]) {
        k++;
        continue;
      }
      let e = k;
      while (
        e + 1 < m - 1 &&
        ok[e + 1] &&
        sc[e + 1] === sc[k] &&
        Math.abs(sw[e + 1] - sw[k]) < 0.22 &&
        Math.abs(sa[e + 1] - sa[k]) < 0.035 &&
        Math.abs(sr[e + 1] - sr[k]) < 8
      )
        e++;
      ctx.beginPath();
      ctx.moveTo(px[k], py[k]);
      for (let i = k + 1; i <= e + 1; i++) ctx.lineTo(px[i], py[i]);
      ctx.lineWidth = sw[k];
      ctx.lineCap = sc[k] ? "round" : "butt";
      ctx.strokeStyle = `rgba(${sr[k] | 0},${sg[k] | 0},${sb[k] | 0},${sa[k].toFixed(3)})`;
      ctx.stroke();
      k = e + 1;
    }

    // one tiny ring "via" where the trace takes its 45 degree elbow (one per wire). It belongs to a real
    // elbow, so it is gone by t = 0.35: once the trace has melted into a curve a ring would float on the strand alone.
    if (w.nVias > 0) {
      const idx = w.vias[0];
      if (idx >= 0 && idx + 1 < m) {
        const t = (w.t[idx] + w.t[idx + 1]) * 0.5;
        const reach = w.grow < 1 ? clamp((head - w.cum[idx + 1]) / 14 + 0.2) : 1;
        if (t < 0.35) {
          const a = (1 - t / 0.35) * Math.min(w.qa[idx], w.qa[idx + 1]) * fade * reach;
          if (a > 0.03) {
            ctx.beginPath();
            ctx.arc((w.x[idx] + w.x[idx + 1]) * 0.5, (w.y[idx] + w.y[idx + 1]) * 0.5, VIA_R, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(96,96,96,${a.toFixed(3)})`;
            ctx.stroke();
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- signals
  private signal(sim: Sim, s: Signal, power: number): void {
    const w = s.wire;
    const n = w.n;
    if (n < 2 || w.len < 1) return;
    const ctx = this.ctx;
    const L = w.len;
    const dim = sim.heroActive && !s.hero ? 0.35 : 1;
    const p = clamp(s.progress);
    const pe = lerp(p, p * p * (3 - 2 * p), w.tAvg);
    const travel = pe * L; // arc length travelled, in travel direction
    const pos = s.rev ? L - travel : travel;
    // point and local blend at pos
    let k = 0;
    while (k < n - 2 && w.cum[k + 1] < pos) k++;
    const seg = w.cum[k + 1] - w.cum[k];
    const f = seg > 0 ? clamp((pos - w.cum[k]) / seg) : 0;
    const x = w.x[k] + (w.x[k + 1] - w.x[k]) * f;
    const y = w.y[k] + (w.y[k + 1] - w.y[k]) * f;
    const t = w.t[k] + (w.t[k + 1] - w.t[k]) * f;
    // a bead rides only the part of its wire that is drawn: not one still drawing in, nor one fading out
    if (w.grow < 1 && pos > w.grow * w.len + 4) return;
    let wireFade = clamp((sim.time - w.born) / 0.8);
    if (w.dying >= 0) wireFade *= clamp(1 - (sim.time - w.dying) / FADE_OUT);
    const q = (w.qa[k] + (w.qa[k + 1] - w.qa[k]) * f) * power * dim * wireFade;
    if (q < 0.02) return;
    const [r, g, b] = FIELD_RGB[s.field];
    const crisp = 1 - smoothstep(0.15, 0.65, t);
    const soft = smoothstep(0.2, 0.8, t);

    if (crisp > 0.03) {
      // a bright segment that advances in whole grid steps
      const head = Math.min(L, (Math.floor(travel / STEP) + 1) * STEP);
      const tail = Math.max(0, head - STEP * 1.5);
      const a0 = s.rev ? L - head : tail;
      const a1 = s.rev ? L - tail : head;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n - 1; i++) {
        const c0 = w.cum[i];
        const c1 = w.cum[i + 1];
        if (c1 < a0 || c0 > a1) continue;
        const lo = Math.max(a0, c0);
        const hi = Math.min(a1, c1);
        const sl = c1 - c0 || 1;
        const xa = w.x[i] + ((w.x[i + 1] - w.x[i]) * (lo - c0)) / sl;
        const ya = w.y[i] + ((w.y[i + 1] - w.y[i]) * (lo - c0)) / sl;
        const xb = w.x[i] + ((w.x[i + 1] - w.x[i]) * (hi - c0)) / sl;
        const yb = w.y[i] + ((w.y[i + 1] - w.y[i]) * (hi - c0)) / sl;
        if (!started) {
          ctx.moveTo(xa, ya);
          started = true;
        }
        ctx.lineTo(xa, ya);
        ctx.lineTo(xb, yb);
      }
      ctx.lineWidth = 2.4;
      ctx.lineCap = "butt";
      ctx.strokeStyle = `rgba(${r},${g},${b},${(0.95 * crisp * q).toFixed(3)})`;
      ctx.stroke();
    }
    if (soft > 0.03) {
      const gl = this.glows[s.field];
      ctx.globalAlpha = 0.9 * soft * q;
      ctx.drawImage(gl, x - 11, y - 11, 22, 22);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.min(255, r + 90)},${Math.min(255, g + 90)},${Math.min(255, b + 90)},${(0.95 * soft * q).toFixed(3)})`;
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- nodes
  // One shape that morphs with the local melt value t: a square pad (a chip when `ic`) at
  // t = 0, a rounded square in the middle, a disc with a soft highlight at t = 1. Same field color throughout.
  private node(sim: Sim, n: FNode, v: DrawView, power: number): void {
    const ctx = this.ctx;
    // everything a node draws is held out of the quiet zone: the body reaches ~14 px
    const qBody = quietAlpha(sim.quiet, n.dx, n.dy, 14);
    const fade = power * clamp((sim.time - n.born) / 0.5) * qBody;
    if (fade < 0.01) return;
    const [r, g, b] = FIELD_RGB[n.field];
    const t = n.t;
    const x = n.dx;
    const y = n.dy;
    const calm = !!v.calm;
    const dist = Math.hypot(v.mouse.x - x, v.mouse.y - y);
    const hover = calm ? 0 : dist < 80 ? 1 - dist / 80 : 0;
    const p = n.pulse;
    const breath = calm ? 1 : 1 + 0.12 * Math.sin(sim.time * 0.9 + n.phB) * t;
    const R = n.r * breath + (calm ? 0 : hover * 4 + p * 3);
    const hw = lerp(n.ic ? CHIP_W / 2 : PAD_HALF, R, t) + hover * 2 * (1 - t);
    const hh = lerp(n.ic ? CHIP_H / 2 : PAD_HALF, R, t) + hover * 2 * (1 - t);
    const corner = lerp(1, Math.min(hw, hh), t);
    const white = (calm ? 0.45 : 0.85) * p;
    const cr = Math.round(r + (255 - r) * white);
    const cg = Math.round(g + (255 - g) * white);
    const cb = Math.round(b + (255 - b) * white);
    const alpha = lerp(0.85, Math.min(1, 0.6 + hover * 0.4 + p * 0.4), t) * fade;

    // soft glow: on hub cells at rest, on any node while a signal passes or the pointer is near (no glow on a resting pad)
    const haloA = (n.halo ? 0.3 : 0) * smoothstep(0.3, 0.7, t) + 0.5 * p * (0.4 + 0.6 * t) + 0.35 * hover;
    if (haloA > 0.02) {
      ctx.globalAlpha = Math.min(0.85, haloA) * fade;
      const gr = R + 15;
      ctx.drawImage(this.glows[n.field], x - gr, y - gr, gr * 2, gr * 2);
    }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.beginPath();
    ctx.roundRect(x - hw, y - hh, hw * 2, hh * 2, corner);
    ctx.fill();
    if (t > 0.15) {
      ctx.globalAlpha = 0.4 * t * fade;
      ctx.drawImage(this.hl, x - 1.15 * R, y - 1.15 * R, 1.8 * R, 1.8 * R);
    }

    if (t < 0.95) {
      // 1 px darker inset and, on a chip, the pin ticks
      ctx.globalAlpha = (1 - t) * 0.8 * fade;
      ctx.strokeStyle = `rgb(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x - hw + 1.5, y - hh + 1.5, hw * 2 - 3, hh * 2 - 3, Math.max(0, corner - 1));
      ctx.stroke();
      if (n.ic) {
        ctx.globalAlpha = (1 - t) * 0.85 * fade;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        for (let k = 0; k < 4; k++) {
          const px0 = x - hw + 3 + (k * (hw * 2 - 6)) / 3 - 0.5;
          ctx.fillRect(px0, y - hh - 3, 1, 3);
          ctx.fillRect(px0, y + hh, 1, 3);
        }
      }
    }

    if (n.glow > 0.02) {
      ctx.globalAlpha = clamp(n.glow) * fade;
      ctx.drawImage(this.glows[n.field], x - 26, y - 26, 52, 52);
    }
    if (p > 0.02 && !calm) {
      const pt = 1 - p;
      const ringR = Math.max(hw, hh) + 6 + pt * 20;
      ctx.globalAlpha = 0.5 * (1 - pt) * (0.4 + 0.6 * t) * fade;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = 1.5 * (1 - pt);
      ctx.beginPath();
      ctx.roundRect(x - ringR, y - ringR, ringR * 2, ringR * 2, lerp(2, ringR, t));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
