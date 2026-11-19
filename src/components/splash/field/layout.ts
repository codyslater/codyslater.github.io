// Rule 4: slow layout drift. Short-range repulsion, a weak pull along strong wires toward a rest
// length, a tiny pull back home; speed clamped to 3 px/s; screen margins and the quiet zone are
// constraints applied every step. Pure.

import { pushOut } from "./quiet";
import { NODE_QUIET } from "./types";
import type { Sim } from "./sim";

const MAX_SPEED = 3; // px/s
const REPEL_RANGE = 70;
const REPEL_GAIN = 5; // px/s at contact
const SPRING_GAIN = 0.045; // 1/s on (length - rest)
const HOME_GAIN = 0.012; // 1/s
const MARGIN = 28;

const out = { x: 0, y: 0 };

function constrainNode(sim: Sim, i: number): void {
  const n = sim.nodes[i];
  n.x = Math.max(MARGIN, Math.min(sim.w - MARGIN, n.x));
  n.y = Math.max(MARGIN, Math.min(sim.h - MARGIN, n.y));
  pushOut(sim.quiet, n.x, n.y, NODE_QUIET, out);
  n.x = Math.max(MARGIN, Math.min(sim.w - MARGIN, out.x));
  n.y = Math.max(MARGIN, Math.min(sim.h - MARGIN, out.y));
}

export function layoutStep(sim: Sim, dt: number): void {
  const nodes = sim.nodes;
  const n = nodes.length;
  const vx = sim.vx;
  const vy = sim.vy;
  vx.fill(0);
  vy.fill(0);
  const rest = 0.18 * Math.min(sim.w, sim.h);
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      if (!b.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= REPEL_RANGE || d < 0.01) continue;
      const f = (REPEL_GAIN * (1 - d / REPEL_RANGE)) / d;
      vx[i] -= dx * f;
      vy[i] -= dy * f;
      vx[j] += dx * f;
      vy[j] += dy * f;
    }
  }
  for (const w of sim.wires) {
    if (w.dying >= 0) continue;
    const a = nodes[w.a];
    const b = nodes[w.b];
    if (a.board || b.board) continue; // a hairline to the board does not tug the cells
    const weight = Math.max(0, Math.min(1, (w.strength - 0.25) / 0.5));
    if (weight <= 0) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const f = ((d - rest) * SPRING_GAIN * weight) / d;
    vx[w.a] += dx * f;
    vy[w.a] += dy * f;
    vx[w.b] -= dx * f;
    vy[w.b] -= dy * f;
  }
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    if (!a.alive || a.dragging || a.board || a.pin) continue; // the board is a board: only the cells drift
    let x = vx[i] + (a.hx - a.x) * HOME_GAIN;
    let y = vy[i] + (a.hy - a.y) * HOME_GAIN;
    const s = Math.hypot(x, y);
    if (s > MAX_SPEED) {
      x = (x / s) * MAX_SPEED;
      y = (y / s) * MAX_SPEED;
    }
    a.x += x * dt;
    a.y += y * dt;
  }


  for (let i = 0; i < n; i++) if (nodes[i].alive && !nodes[i].dragging) constrainNode(sim, i);
}
