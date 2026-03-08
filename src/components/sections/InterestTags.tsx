"use client";

import { siteConfig } from "@/lib/constants";

export function InterestTags() {
  return (
    <div className="flex flex-wrap gap-3">
      {siteConfig.interests.map((interest) => (
        <span
          key={interest.label}
          className="px-3 py-1.5 text-xs font-mono rounded border"
          style={{
            color: interest.color,
            borderColor: `${interest.color}30`,
            backgroundColor: `${interest.color}08`,
            textShadow: `0 0 12px ${interest.color}25`,
          }}
        >
          {interest.label}
        </span>
      ))}
    </div>
  );
}
