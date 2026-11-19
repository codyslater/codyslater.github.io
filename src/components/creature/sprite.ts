import { GRID } from "./geometry";
import { EYE_CELLS } from "./generation";
import { EYE_COLOR, PUPIL_COLOR, bodyColor } from "./palette";
import type { Grid } from "./types";

// How the resting creature is drawn: the 12x12 body, posed. Everything is cut
// on whole pixels, so a squash or a lean never blurs.
export type Pose = {
  face: -1 | 0 | 1; // eyes slide toward the side it is facing
  lookUp: boolean; // eyes slide up a row
  eyes: "open" | "shut";
  lift: 0 | 1 | 2; // a leg raised mid-step: 1 = left, 2 = right
  sit: boolean; // folded down: feet tucked, body one cell lower
  sx: number; // scale about the bottom-center
  sy: number;
  lean: number; // -1..1, upper rows shift sideways
  flip: number; // 0..1, a turn on the spot (width goes through zero)
  jx: number; // whole-body shift in cells (wiggle)
  zz: number; // 0 = none; otherwise 0..1 phase of a rising "z"
  bob: 0 | 1; // breathing: the head and shoulders sink one cell
};

export const NEUTRAL_POSE: Pose = {
  face: 0, lookUp: false, eyes: "open", lift: 0, sit: false,
  sx: 1, sy: 1, lean: 0, flip: 0, jx: 0, zz: 0, bob: 0,
};

const LEFT_EYE_COL = 4;
const RIGHT_EYE_COL = 7;
const Z_COLOR = "#8a8a8a";
const Z_GLYPH = ["XXX", ".X.", "XXX"];
// rows above this one sink a cell when the creature breathes in
const BOB_ROWS = 5;

export { bodyColor };

// Resolve eyes, a lifted leg and a fold into a plain 12x12 grid. Used to hand
// the creature as it stands, right now, to an ending, so the first frame of
// the ending is exactly the last frame of the sprite.
export function posedGrid(grid: Grid, pose: Pose): Grid {
  const lid = bodyColor(grid);
  const out: Grid = grid.map((row, r) =>
    row.map((c, i) => {
      if (EYE_CELLS.some(([er, ec]) => er === r && ec === i)) return lid;
      return c;
    }),
  );
  if (pose.eyes === "open") {
    for (const base of [LEFT_EYE_COL, RIGHT_EYE_COL]) {
      const c = base + pose.face;
      // white over a dark pupil; looking up, the pupil is the upper cell. The eye
      // slides a cell the way it looks and always stays inside the body.
      if (out[2]?.[c]) out[2][c] = pose.lookUp ? PUPIL_COLOR : EYE_COLOR;
      if (out[3]?.[c]) out[3][c] = pose.lookUp ? EYE_COLOR : PUPIL_COLOR;
    }
  }
  if (pose.lift) {
    const cols = pose.lift === 1 ? [2, 3] : [GRID - 4, GRID - 3];
    for (const c of cols) out[GRID - 1][c] = null;
  }
  return out;
}

// Draw the body with its top-left at (ox, oy) pixels, `k` pixels per cell.
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  grid: Grid,
  pose: Pose,
  ox: number,
  oy: number,
  k: number,
) {
  const posed = posedGrid(grid, { ...pose, lift: 0 });
  const sx = pose.sx * Math.max(0.12, Math.abs(Math.cos(Math.PI * pose.flip)));
  const cx = ox + (GRID / 2) * k; // center of the feet line
  const bottom = oy + (GRID + (pose.sit ? 1 : 0)) * k;
  const legCols = pose.lift === 1 ? [2, 3] : pose.lift === 2 ? [GRID - 4, GRID - 3] : [];

  for (let r = 0; r < GRID; r++) {
    if (pose.sit && r === GRID - 1) continue; // the feet are folded away
    const shift = Math.round(pose.lean * ((GRID - 1 - r) / (GRID - 1)) * 1.4) + pose.jx;
    const sink = r <= BOB_ROWS ? pose.bob : 0;
    const y0 = Math.round(bottom + (r - GRID) * pose.sy * k) + sink * k;
    const y1 = Math.round(bottom + (r + 1 - GRID) * pose.sy * k) + sink * k;
    for (let c = 0; c < GRID; c++) {
      const color = posed[r][c];
      if (!color) continue;
      if (r === GRID - 1 && legCols.includes(c)) continue; // lifted foot
      const x0 = Math.round(cx + (c - GRID / 2 + shift) * sx * k);
      const x1 = Math.round(cx + (c + 1 - GRID / 2 + shift) * sx * k);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
  }

  if (pose.zz > 0) {
    // a small "z" drifting up and to the right of the head, twice
    for (let i = 0; i < 2; i++) {
      const phase = (pose.zz + i * 0.5) % 1;
      const u = Math.max(2, Math.round(k * (0.28 + 0.14 * phase)));
      const zx = Math.round(ox + (GRID - 1.5) * k + phase * k * 1.2);
      const zy = Math.round(oy - k * 0.2 - phase * k * 2.6);
      ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.9;
      ctx.fillStyle = Z_COLOR;
      Z_GLYPH.forEach((line, gy) =>
        [...line].forEach((ch, gx) => {
          if (ch === "X") ctx.fillRect(zx + gx * u, zy + gy * u, u, u);
        }),
      );
    }
    ctx.globalAlpha = 1;
  }
}

// Stable text for "would this pose draw differently?", so the stage only
// repaints when something changed.
export function poseKey(pose: Pose, x: number, y: number, k: number): string {
  return [
    x, y, k, pose.face, pose.lookUp ? 1 : 0, pose.eyes, pose.lift, pose.sit ? 1 : 0,
    Math.round(pose.sx * k), Math.round(pose.sy * k * GRID), pose.lean.toFixed(1),
    pose.flip.toFixed(1), pose.jx, pose.zz ? Math.floor(pose.zz * 12) : 0, pose.bob,
  ].join("|");
}
