import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ImageSize = { width: number; height: number };

// Pixel size of a file under public/, read from its header at build time so an <img>
// can reserve its box before it loads. Handles webp (the covers) and png; any other
// type, or a missing file, returns null and the caller simply omits the attributes.
export function publicImageSize(src: string): ImageSize | null {
  let b: Buffer;
  try {
    b = readFileSync(path.join(process.cwd(), "public", src));
  } catch {
    return null;
  }
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (b.length > 24 && b.toString("ascii", 1, 4) === "PNG") {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  return null;
}

export type IndexCover = { src: string; width?: number; height?: number };

// The image an index card shows for a cover: thumb.webp beside it when scripts/make-og-images.py
// wrote one, the cover itself otherwise. Whether the thumbnail exists is decided here at build
// time; the size is read from the chosen file so the card reserves its box before it loads.
export function indexCover(cover: string): IndexCover {
  const thumb = path.posix.join(path.posix.dirname(cover), "thumb.webp");
  const src = existsSync(path.join(process.cwd(), "public", thumb)) ? thumb : cover;
  const size = publicImageSize(src);
  return { src, width: size?.width, height: size?.height };
}
