import { useEffect, useState } from "react";
import { getConsent, setConsent } from "@/lib/storage";

type Props = {
  /** Called whenever the consent state changes. */
  onChange?: (granted: boolean) => void;
  className?: string;
};

/**
 * The 18+ / estimate-only acknowledgement. Scan is blocked until this is ticked,
 * and the tick is remembered locally so it is asked once, not every visit.
 */
export default function ConsentGate({ onChange, className = "" }: Props) {
  const [granted, setGranted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getConsent();
    setGranted(stored);
    setReady(true);
    onChange?.(stored);
    // onChange is stable in practice; re-running on it would fight the checkbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !granted;
    setGranted(next);
    setConsent(next);
    onChange?.(next);
  };

  return (
    <label
      className={`flex cursor-pointer items-start gap-3.5 rounded-card border border-white/[0.07] bg-white/[0.02] p-4 transition-colors duration-300 hover:border-gold-400/25 ${className}`}
    >
      <span className="relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={granted}
          onChange={toggle}
          className="peer absolute h-full w-full cursor-pointer appearance-none rounded-[6px] border border-white/20 bg-transparent transition-colors duration-200 checked:border-gold-400 checked:bg-gold-400"
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#07070B"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`pointer-events-none relative h-3 w-3 transition-opacity duration-150 ${
            granted ? "opacity-100" : "opacity-0"
          }`}
        >
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      </span>
      <span className="select-none">
        <span className="block text-[13px] leading-snug text-white/85">
          I am 18+ and I understand this is an estimate.
        </span>
        <span className="mt-1 block text-[11px] leading-relaxed text-muted/60">
          Aureline is for fun and self improvement only — not a medical, psychological,
          or diagnostic assessment. Your photo is processed in your browser and never
          uploaded.
        </span>
        {!ready && <span className="sr-only">Loading your saved preference</span>}
      </span>
    </label>
  );
}
