/** A quiet gold sparkline for the history list. Values are 0..10. */
export default function Sparkline({
  values,
  width = 96,
  height = 28,
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length === 0) return null;

  const series = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = 3;

  const points = series.map((v, i) => {
    const x = (i / (series.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const last = points[points.length - 1].split(",");
  const gid = `spark-${Math.round(min * 100)}-${Math.round(max * 100)}-${series.length}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(212,175,55,0.30)" />
          <stop offset="100%" stopColor="rgba(212,175,55,0)" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${height} ${points.join(" ")} ${width - pad},${height}`}
        fill={`url(#${gid})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#D4AF37"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill="#F4E6BF" />
    </svg>
  );
}
