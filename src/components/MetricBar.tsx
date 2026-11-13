import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  /** 0..100 */
  value: number;
  /** Short measurement readout, e.g. "1.92". */
  readout?: string;
  delay?: number;
  emphasis?: boolean;
};

/**
 * A metric bar: hairline track, gold fill, the number set in tabular figures so
 * a column of bars lines up like a spec sheet.
 */
export default function MetricBar({
  label,
  value,
  readout,
  delay = 0,
  emphasis = false,
}: Props) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setWidth(clamped);
      setShown(Math.round(clamped));
      return;
    }
    const timeout = window.setTimeout(() => {
      const start = performance.now();
      const duration = 950;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setWidth(clamped * eased);
        setShown(Math.round(clamped * eased));
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [clamped, delay]);

  return (
    <div className="group">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span
          className={`text-[11px] uppercase tracking-[0.2em] ${
            emphasis ? "text-white/90" : "text-muted/85"
          }`}
        >
          {label}
        </span>
        <span className="flex items-baseline gap-2">
          {readout && (
            <span className="stat-num text-[10px] tracking-wide text-muted/45">
              {readout}
            </span>
          )}
          <span
            className={`stat-num font-display text-[15px] leading-none ${
              emphasis ? "text-gold-200" : "text-white/85"
            }`}
          >
            {shown}
          </span>
        </span>
      </div>
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${width}%`,
            background:
              "linear-gradient(90deg, rgba(158,123,34,0.85) 0%, #D4AF37 55%, #F4E6BF 100%)",
            boxShadow: "0 0 14px -2px rgba(212,175,55,0.7)",
          }}
        />
      </div>
    </div>
  );
}
