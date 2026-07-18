"use client";

import type { CreatureDebugOverrides } from "@/components/ui/PixelCreature";
import { TEMPERAMENTS } from "@/components/creature/temperaments";
import { BIRTHS, DEATHS } from "@/components/creature/styles";

interface ZooDebugPanelProps {
  value: CreatureDebugOverrides;
  onChange: (v: CreatureDebugOverrides) => void;
  onReroll: () => void;
}

// Dev-only art-direction controls. The NODE_ENV guard at the call site
// makes this dead code in production bundles.
export function ZooDebugPanel({ value, onChange, onReroll }: ZooDebugPanelProps) {
  const select = (
    label: string,
    key: keyof CreatureDebugOverrides,
    options: string[],
  ) => (
    <label className="flex items-center gap-2">
      <span className="text-muted">{label}</span>
      <select
        value={value[key] ?? ""}
        onChange={(e) =>
          onChange({ ...value, [key]: e.target.value || undefined })
        }
        className="bg-surface border border-border rounded px-1 py-0.5"
      >
        <option value="">rolled</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mb-8 p-4 border border-dashed border-border rounded font-mono text-xs flex flex-wrap items-center gap-4">
      <span className="text-accent-green">[debug]</span>
      {select("temperament", "temperament", Object.keys(TEMPERAMENTS))}
      {select("birth", "birth", Object.keys(BIRTHS))}
      {select("death", "death", Object.keys(DEATHS))}
      <button type="button" onClick={onReroll} className="border border-border rounded px-2 py-0.5 hover:text-foreground">
        reroll all
      </button>
      <span className="text-muted">click a specimen to run death → birth</span>
    </div>
  );
}
