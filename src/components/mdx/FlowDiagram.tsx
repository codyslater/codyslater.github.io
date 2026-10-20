// A left-to-right pipeline drawn as inline SVG, styled only with the site's
// palette tokens (globals.css). Two layouts share one component: a horizontal
// strip from `sm` up and a vertical stack below it, so the text stays legible
// at phone width instead of shrinking or clipping. `highlight` marks the one
// step that is the point of the diagram (a 0-based index).

type FlowDiagramProps = {
  steps: string[];
  highlight?: number;
};

const BOX_H = 40;
const FONT = 13;

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
      <path d="M1 1 L9 5 L1 9" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
    </marker>
  );
}

function Box({
  x,
  y,
  w,
  label,
  on,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  on: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={BOX_H}
        rx="6"
        fill="var(--bg-secondary)"
        stroke={on ? "var(--accent-green)" : "var(--border)"}
        strokeWidth={on ? 1.5 : 1}
      />
      <text
        x={x + w / 2}
        y={y + BOX_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={FONT}
        fill={on ? "var(--accent-green)" : "var(--text-primary)"}
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
  const bw = 120;
  const gap = 28;
  const hw = n * bw + (n - 1) * gap;
  const hh = BOX_H + 4;

  // vertical stack
  const vw = 200;
  const vgap = 30;
  const vh = n * BOX_H + (n - 1) * vgap;
  const vpadX = 20;

  return (
    <figure className="my-8" role="img" aria-label={label}>
      <svg
        viewBox={`-2 -2 ${hw + 4} ${hh}`}
        className="hidden sm:block w-full h-auto"
        aria-hidden="true"
      >
        <defs>
          <Arrowhead id="fd-h" />
        </defs>
        {steps.map((s, i) => (
          <g key={i}>
            <Box x={i * (bw + gap)} y={0} w={bw} label={s} on={i === highlight} />
            {i < n - 1 && (
              <line
                x1={i * (bw + gap) + bw + 4}
                y1={BOX_H / 2}
                x2={(i + 1) * (bw + gap) - 2}
                y2={BOX_H / 2}
                stroke="var(--text-secondary)"
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
            />
            {i < n - 1 && (
              <line
                x1={vpadX + vw / 2}
                y1={i * (BOX_H + vgap) + BOX_H + 4}
                x2={vpadX + vw / 2}
                y2={(i + 1) * (BOX_H + vgap) - 2}
                stroke="var(--text-secondary)"
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
