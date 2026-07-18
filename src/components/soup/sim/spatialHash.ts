import type { FreePixel } from "./types";

// BUCKET must be >= FORCE_RADIUS so a 3×3 bucket scan always covers the
// full interaction radius (worst case: pixel at a bucket edge).
const BUCKET = 6;

export class SpatialHash {
  private map = new Map<number, number[]>();
  private cols = 0;

  build(pixels: FreePixel[], width: number) {
    this.map.clear();
    this.cols = Math.ceil(width / BUCKET) + 2;
    for (let i = 0; i < pixels.length; i++) {
      const k = this.bucketKey(pixels[i].x, pixels[i].y);
      const arr = this.map.get(k);
      if (arr) arr.push(i);
      else this.map.set(k, [i]);
    }
  }

  private bucketKey(x: number, y: number) {
    return Math.floor(y / BUCKET) * this.cols + Math.floor(x / BUCKET);
  }

  // Fills `out` with indices from the 3×3 buckets around (x, y). Reuses the
  // caller's array to avoid per-call allocation.
  neighbors(x: number, y: number, out: number[]): number[] {
    out.length = 0;
    const bx = Math.floor(x / BUCKET);
    const by = Math.floor(y / BUCKET);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.map.get((by + dy) * this.cols + (bx + dx));
        if (arr) for (const i of arr) out.push(i);
      }
    }
    return out;
  }
}
