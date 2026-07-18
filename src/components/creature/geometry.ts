export const GRID = 12; // creature body grid (12×12)
export const SCALE = 8; // canvas px per grid unit
export const PAD = 6; // empty grid units on ALL four sides — scatter room
export const UNITS = GRID + PAD * 2; // 24 — canvas size in grid units
export const CANVAS_W = UNITS * SCALE; // 192
export const CANVAS_H = UNITS * SCALE; // 192
export const CENTER = UNITS / 2; // 12 — canvas center in grid units
