"use client";

import { useEffect, useRef, useState } from "react";

// A left-to-right pipeline drawn as inline SVG, styled only by the .flow-* rules in
// globals.css (site palette tokens in dark, the paper palette in light reading mode). Two layouts share one component: a horizontal
// strip from `sm` up and a vertical stack below it, so the text stays legible
// at phone width instead of shrinking or clipping. `highlight` marks the one
// step that is the point of the diagram (a 0-based index).

type FlowDiagramProps = {
  steps: string[];
  highlight?: number;
};

const BOX_H = 40;
const FONT = 13; // phone stack: its drawing is scaled up on screen
const FONT_H = 14; // desktop strip: drawn at about 1:1 so the label is 14px

function Arrowhead({ id }: { id: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path d="M1 1 L9 5 L1 9" fill="none" className="flow-line" strokeWidth="1.5" />
    </marker>
  );
}

function Box({
  x,
  y,
  w,
  label,
  on,
  font,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  on: boolean;
  font: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={BOX_H}
        rx="6"
        className={on ? "flow-box flow-box-on" : "flow-box"}
        strokeWidth={on ? 1.5 : 1}
      />
      <text
        x={x + w / 2}
        y={y + BOX_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={font}
        className={on ? "flow-text flow-text-on" : "flow-text"}
        style={{ fontFamily: "inherit" }}
      >
        {label}
      </text>
    </g>
  );
}

export function FlowDiagram({ steps, highlight }: FlowDiagramProps) {
  const label = steps.join(", then ");
  const n = steps.length;

  // horizontal strip
  // Drawn at about 1 unit = 1px across the 673px reading column. Each chip is its label's
  // measured width plus the same side padding (PAD), so no chip crowds its text; the arrows
  // take the leftover width evenly. The labels are in the page's serif, which is proportional,
  // so the widths are measured in the browser (an estimate stands in until then).
  const hw = 673;
  const PAD = 14;
  const stripRef = useRef<SVGSVGElement>(null);
  const [measured, setMeasured] = useState<number[] | null>(null);
  useEffect(() => {
    const svg = stripRef.current;
    if (!svg) return;
    const measure = () => {
      const w = [...svg.querySelectorAll("text")].map((t) => t.getBBox().width);
      // a hidden strip (phone layout) measures 0; keep the estimate until it is shown
      if (w.length === steps.length && w.every((x) => x > 0)) setMeasured(w.map((x) => Math.ceil(x)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    document.fonts?.ready.then(measure);
    measure();
    return () => ro.disconnect();
  }, [steps.length]);
  const widths = steps.map((s, i) => (measured ? measured[i] : Math.ceil(s.length * FONT_H * 0.48)) + 2 * PAD);
  const gap = (hw - widths.reduce((a, b) => a + b, 0)) / Math.max(n - 1, 1);
  const xs = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0) + i * gap);
  const hh = BOX_H + 4;

  // vertical stack
  const vw = 200;
  const vgap = 30;
  const vh = n * BOX_H + (n - 1) * vgap;
  const vpadX = 20;

  return (
    <figure className="my-8" role="img" aria-label={label}>
      <svg
        ref={stripRef}
        viewBox={`-2 -2 ${hw + 4} ${hh}`}
        className="hidden sm:block w-full h-auto"
        aria-hidden="true"
      >
        <defs>
          <Arrowhead id="fd-h" />
        </defs>
        {steps.map((s, i) => (
          <g key={i}>
            <Box x={xs[i]} y={0} w={widths[i]} label={s} on={i === highlight} font={FONT_H} />
            {i < n - 1 && (
              <line
                x1={xs[i] + widths[i] + 3}
                y1={BOX_H / 2}
                x2={xs[i + 1] - 1}
                y2={BOX_H / 2}
                className="flow-line"
                strokeWidth="1.5"
                markerEnd="url(#fd-h)"
              />
            )}
          </g>
        ))}
      </svg>
      <svg
        viewBox={`-2 -2 ${vw + vpadX * 2 + 4} ${vh + 4}`}
        className="block sm:hidden w-full h-auto max-w-xs mx-auto"
        aria-hidden="true"
      >
        <defs>
          <Arrowhead id="fd-v" />
        </defs>
        {steps.map((s, i) => (
          <g key={i}>
            <Box
              x={vpadX}
              y={i * (BOX_H + vgap)}
              w={vw}
              label={s}
              on={i === highlight}
              font={FONT}
            />
            {i < n - 1 && (
              <line
                x1={vpadX + vw / 2}
                y1={i * (BOX_H + vgap) + BOX_H + 4}
                x2={vpadX + vw / 2}
                y2={(i + 1) * (BOX_H + vgap) - 2}
                className="flow-line"
                strokeWidth="1.5"
                markerEnd="url(#fd-v)"
              />
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
