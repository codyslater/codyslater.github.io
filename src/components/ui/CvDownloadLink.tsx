"use client";

import type { ReactNode } from "react";
import { siteConfig } from "@/lib/constants";

// The analytics beacon can't see a PDF, so a click also loads a counted page in a hidden iframe.
// The download itself starts at once, as a plain link.
function countDownload() {
  const frame = document.createElement("iframe");
  frame.src = "/cv/download/";
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 15000);
}

export function CvDownloadLink(props: { className?: string; title?: string; "aria-label"?: string; children: ReactNode }) {
  return (
    <a href={siteConfig.links.cvPdf} download onClick={countDownload} {...props} />
  );
}
