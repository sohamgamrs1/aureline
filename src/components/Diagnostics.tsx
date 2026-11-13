import { useState } from "react";
import { explain } from "@/lib/scoring";
import type { MetricSet, RawMeasurements } from "@/lib/types";

type Props = {
  metrics: MetricSet;
  raw: RawMeasurements;
  overall: number;
  psl: number;
};

const fmt = (row: ReturnType<typeof explain>[number]) => {
  if (row.unit === "percent") return `${(row.value * 100).toFixed(1)}%`;
  if (row.unit === "degrees") return `${row.value.toFixed(1)}°`;
  return row.value.toFixed(3);
};

const fmtIdeal = (row: ReturnType<typeof explain>[number]) => {
  if (row.unit === "percent") return `${(row.ideal * 100).toFixed(1)}%`;
  if (row.unit === "degrees") return `${row.ideal.toFixed(1)}°`;
  return row.ideal.toFixed(3);
};

/**
 * Diagnostics panel.
 *
 * Shows every measurement with its ideal, its deviation, the tolerance it is
 * judged against, and how much of that tolerance was used. Built so calibration
 * can be done from real numbers: when a strong face and an average one score the
 * same, this table shows which metric is pinned and by how much.
 */
export default function Diagnostics({ metrics, raw, overall, psl }: Props) {
  const rows = explain(metrics, raw);
  const [copied, setCopied] = useState(false);

  const dump = [
    `aureline diagnostics — overall ${overall.toFixed(2)} · PSL ${psl.toFixed(1)}`,
    ...rows.map(
      (r) =>
        `${r.label.padEnd(16)} value ${fmt(r).padStart(7)}  ideal ${fmtIdeal(r).padStart(7)}  ` +
        `dev ${r.ratio.toFixed(2)}×tol  score ${r.score.toFixed(2)}`
    ),
    `raw: ${JSON.stringify(raw)}`,
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dump);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="card group mt-6 px-6 py-5 sm:px-8">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted/60">
            Every measurement, its ideal, and how much of its tolerance it used. Send
            this table to calibrate the scale.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-[9px] uppercase tracking-[0.18em] text-muted/60 transition-colors group-open:border-gold-400/40 group-open:text-gold-200">
          Open
        </span>
      </summary>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/[0.08]">
              {["Metric", "Measured", "Ideal", "Deviation", "Score"].map((h) => (
                <th
                  key={h}
                  className="pb-2 text-[9px] uppercase tracking-[0.2em] text-muted/45"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const used = Math.min(1, row.ratio);
              return (
                <tr key={row.key} className="border-b border-white/[0.04]">
                  <td className="py-2.5 pr-4 text-[12px] text-white/80">{row.label}</td>
                  <td className="stat-num py-2.5 pr-4 text-[12px] text-white/90">
                    {fmt(row)}
                  </td>
                  <td className="stat-num py-2.5 pr-4 text-[12px] text-muted/55">
                    {fmtIdeal(row)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2">
                      <span className="relative h-[3px] w-16 overflow-hidden rounded-full bg-white/[0.07]">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{
                            width: `${used * 100}%`,
                            background:
                              used > 0.85
                                ? "linear-gradient(90deg,#9E7B22,#D4AF37)"
                                : "linear-gradient(90deg,#9E7B22,#F4E6BF)",
                          }}
                        />
                      </span>
                      <span className="stat-num text-[11px] text-muted/60">
                        {row.ratio.toFixed(2)}×
                      </span>
                    </span>
                  </td>
                  <td className="stat-num py-2.5 text-[12px] text-gold-200/90">
                    {Math.round(row.score * 100)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={copy} className="btn-ghost">
          {copied ? "Copied" : "Copy as text"}
        </button>
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted/35">
          Deviation is shown as a multiple of tolerance · 1.00× scores zero
        </p>
      </div>

      <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-white/[0.06] bg-ink-950/60 p-4 text-[10px] leading-relaxed text-muted/50">
        {dump}
      </pre>
    </details>
  );
}
