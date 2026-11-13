import { useEffect, useRef, useState } from "react";

type Props = {
  /** 0..1 — the arc fills proportionally. */
  value: number;
  /** Large centre number. */
  display: string;
  label?: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
  /** Delay before the arc draws, in ms. */
  delay?: number;
  muted?: boolean;
};

/**
 * The house score ring: a single gold arc on a hairline track, with a soft
 * radial glow behind the number. Draws itself once on mount.
 */
export default function ScoreCircle({
  value,
  display,
  label,
  sublabel,
  size = 260,
  stroke = 6,
  delay = 120,
  muted = false,
}: Props) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const [progress, setProgress] = useState(0);
  const [counted, setCounted] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setProgress(clamped);
      setCounted(true);
      return;
    }
    const timeout = window.setTimeout(() => {
      const start = performance.now();
      const duration = 1150;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // easeOutExpo — fast out of the gate, long settle.
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -9 * t);
        setProgress(clamped * eased);
        if (t < 1) raf.current = requestAnimationFrame(tick);
        else setCounted(true);
      };
      raf.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [clamped, delay]);

  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `ring-${Math.round(size)}-${stroke}`;

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <div
        aria-hidden
        className="absolute inset-6 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.04) 45%, transparent 72%)",
        }}
      />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${label ?? "Score"}: ${display}`}
      >
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FBF5E4" />
            <stop offset="45%" stopColor="#E0C576" />
            <stop offset="100%" stopColor="#9E7B22" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          filter={muted ? undefined : `url(#${id}-glow)`}
          opacity={muted ? 0.5 : 1}
        />
        {/* Cardinal ticks — quiet detail that reads as "instrument". */}
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const inner = r - stroke - 8;
          const outer = r - stroke - 3;
          return (
            <line
              key={deg}
              x1={size / 2 + Math.cos(rad) * inner}
              y1={size / 2 + Math.sin(rad) * inner}
              x2={size / 2 + Math.cos(rad) * outer}
              y2={size / 2 + Math.sin(rad) * outer}
              stroke="rgba(212,175,55,0.28)"
              strokeWidth={1}
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 grid place-content-center text-center">
        {label && <p className="eyebrow mb-2">{label}</p>}
        <p
          className="stat-num font-display leading-none text-white"
          style={{ fontSize: size * 0.3 }}
        >
          {display}
        </p>
        {sublabel && (
          <p
            className={`mt-2 text-[11px] uppercase tracking-[0.2em] text-muted transition-opacity duration-500 ${
              counted ? "opacity-100" : "opacity-0"
            }`}
          >
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
}
