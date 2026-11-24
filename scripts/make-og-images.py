#!/usr/bin/env python3
"""Render a 1200x630 share card (og.jpg) and an 800 px-wide thumbnail (thumb.webp)
beside each cover under public/.

    python3 scripts/make-og-images.py

Requires Pillow (`pip install Pillow`); it is not part of scripts/cv-requirements.txt,
which lists the CV renderer's dependencies.

For public/writing/<slug>/ and public/projects/<slug>/, reads cover.webp (the dark
cover, also for essays with a cover-light.webp), center-crops it to 1200x630 and
writes og.jpg next to it. Folders with no cover.webp are skipped. Re-run after a
cover changes; the pages pick og.jpg up on the next build.
"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SIZE = (1200, 630)
QUALITY = 85
THUMB_WIDTH = 800
THUMB_QUALITY = 80


def main() -> None:
    made = 0
    thumbs = 0
    for section in ("writing", "projects"):
        for folder in sorted((ROOT / "public" / section).glob("*/")):
            cover = folder / "cover.webp"
            if not cover.is_file():
                print(f"skip {folder.relative_to(ROOT)} (no cover.webp)")
                continue
            with Image.open(cover) as im:
                card = ImageOps.fit(im.convert("RGB"), SIZE, Image.LANCZOS, centering=(0.5, 0.5))
                thumb = None
                if im.width > THUMB_WIDTH:
                    height = round(im.height * THUMB_WIDTH / im.width)
                    thumb = im.convert("RGB").resize((THUMB_WIDTH, height), Image.LANCZOS)
            out = folder / "og.jpg"
            card.save(out, "JPEG", quality=QUALITY, optimize=True)
            print(f"{out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")
            made += 1
            thumb_out = folder / "thumb.webp"
            if thumb is not None:
                thumb.save(thumb_out, "WEBP", quality=THUMB_QUALITY, method=6)
                print(f"{thumb_out.relative_to(ROOT)}  {thumb_out.stat().st_size // 1024} KB")
                thumbs += 1
            else:
                thumb_out.unlink(missing_ok=True)
    print(f"{made} share cards, {thumbs} thumbnails written")


if __name__ == "__main__":
    main()
