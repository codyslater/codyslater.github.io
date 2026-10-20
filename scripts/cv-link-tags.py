#!/usr/bin/env python3
"""Prepare content/cv.yaml for RenderCV: give each publication a short link tag.

cv.yaml stays the only source. This writes a copy with a `link_tag` field on every
publication that has a doi or url, e.g. [\\[DOI\\]](https://doi.org/...). The
publication_entry template in cv.yaml places LINK_TAG at the end of the venue line,
so the link sits inline instead of on its own line.

Usage: cv-link-tags.py IN.yaml OUT.yaml
"""
import re
import sys
from urllib.parse import urlparse

from ruamel.yaml import YAML

SECTION = "Publications & Papers"


def label(url: str, journal: str) -> str:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    venue = journal.lower()
    if "biorxiv" in host or "biorxiv" in venue:
        return "bioRxiv"
    if "medrxiv" in host or "medrxiv" in venue:
        return "medRxiv"
    if "arxiv" in host or "arxiv" in venue:
        return "arXiv"
    if host == "doi.org" or host.endswith(".doi.org"):
        return "DOI"
    if urlparse(url).path.lower().endswith(".pdf"):
        return "PDF"
    return re.sub(r"\.[a-z]{2,}$", "", host).split(".")[-1].capitalize() or "Link"


def main(src: str, dst: str) -> None:
    yaml = YAML()
    yaml.width = 4096
    with open(src, encoding="utf8") as f:
        doc = yaml.load(f)
    for entry in doc["cv"]["sections"][SECTION]:
        doi, url = entry.get("doi"), entry.get("url")
        href = f"https://doi.org/{doi}" if doi else (str(url) if url else None)
        if href:
            tag = label(href, str(entry.get("journal", "")))
            entry["link_tag"] = f"[\\[{tag}\\]]({href})"
        # Explain the dagger on the paper that uses it, not in the page footer.
        if any("†" in str(a) for a in entry.get("authors", [])):
            entry["dagger_note"] = "*† equal contribution*"
    with open(dst, "w", encoding="utf8") as f:
        yaml.dump(doc, f)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
