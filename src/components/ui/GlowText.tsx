interface GlowTextProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
}

export function GlowText({
  children,
  color = "#39ff14",
  className = "",
}: GlowTextProps) {
  return (
    <span
      className={className}
      style={{
        color,
        textShadow: `0 0 10px ${color}40, 0 0 20px ${color}20`,
      }}
    >
      {children}
    </span>
  );
}
