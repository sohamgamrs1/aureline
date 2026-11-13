import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Sparkline from "@/components/Sparkline";
import { deleteHistoryEntry, getHistory } from "@/lib/storage";
import { tierFor } from "@/lib/scoring";
import type { HistoryEntry } from "@/lib/types";

const METRIC_ORDER = [
  "symmetry",
  "thirds",
  "fifths",
  "canthalTilt",
  "fwhr",
  "midface",
] as const;

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    setEntries(getHistory());
    setLoaded(true);
  }, []);

  const trend = useMemo(
    () => [...entries].reverse().map((entry) => entry.overall),
    [entries]
  );

  const stats = useMemo(() => {
    if (!entries.length) return null;
    const overalls = entries.map((e) => e.overall);
    const best = Math.max(...overalls);
    const average = overalls.reduce((s, v) => s + v, 0) / overalls.length;
    const first = entries[entries.length - 1].overall;
    return { best, average, delta: entries[0].overall - first };
  }, [entries]);

  const remove = (id: string) => {
    setEntries(deleteHistoryEntry(id));
    setConfirming(null);
  };

  if (!loaded) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="h-9 w-9 animate-spin rounded-full border border-gold-400/25 border-t-gold-300" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
      <header>
        <p className="eyebrow">Archive</p>
        <h1 className="mt-4 font-display text-[2rem] leading-tight text-white sm:text-[2.6rem]">
          History
        </h1>
        <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-muted/70">
          Saved scans, newest first. Only numbers are stored — no photo is ever kept.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="card mt-10 px-6 py-14 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-gold-400/25 bg-gold-400/[0.06]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
              strokeLinecap="round"
              className="h-5 w-5 text-gold-300"
            >
              <path d="M12 7v5l3 2" />
              <circle cx="12" cy="12" r="8.5" />
            </svg>
          </div>
          <p className="mt-5 font-display text-xl text-white/90">Nothing saved yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-muted/60">
            Run a scan and press Save Result. Your entries stay on this device, and you
            can wipe them at any time.
          </p>
          <Link to="/scan" className="btn-gold mt-7">
            Start Scan
          </Link>
        </div>
      ) : (
        <>
          {/* summary */}
          <div className="card-gold mt-8 grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-muted/50">
                  Scans
                </p>
                <p className="stat-num mt-1.5 font-display text-2xl text-white/95">
                  {entries.length}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-muted/50">
                  Best
                </p>
                <p className="stat-num mt-1.5 font-display text-2xl gold-text">
                  {stats!.best.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-muted/50">
                  Average
                </p>
                <p className="stat-num mt-1.5 font-display text-2xl text-white/95">
                  {stats!.average.toFixed(1)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Sparkline values={trend} width={140} height={40} />
              <div className="text-right">
                <p
                  className={`stat-num text-[13px] ${
                    stats!.delta >= 0 ? "text-emerald-300/85" : "text-red-300/80"
                  }`}
                >
                  {stats!.delta >= 0 ? "+" : ""}
                  {stats!.delta.toFixed(1)}
                </p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-muted/45">
                  since first
                </p>
              </div>
            </div>
          </div>

          {/* rows */}
          <ul className="mt-4 space-y-2.5">
            {entries.map((entry, i) => {
              const tier = tierFor(entry.psl);
              const signature = METRIC_ORDER.map((key) =>
                Math.round((entry.metrics?.[key] ?? 0) * 100)
              );
              const isConfirming = confirming === entry.id;

              return (
                <li
                  key={entry.id}
                  className="card animate-fade-up px-5 py-4"
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-[7.5rem]">
                      <p className="text-[12px] text-white/85">
                        {new Date(entry.date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted/45">
                        {new Date(entry.date).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="stat-num font-display text-2xl text-white/95">
                        {entry.overall.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-muted/40">/10</span>
                    </div>

                    <div className="rounded-full border border-gold-400/25 bg-gold-400/[0.07] px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-gold-200/90">
                      PSL {entry.psl.toFixed(1)} · {tier.short}
                    </div>

                    <div className="ml-auto flex items-center gap-4">
                      <span className="hidden sm:block">
                        <Sparkline values={signature} width={92} height={26} />
                      </span>
                      {isConfirming ? (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => remove(entry.id)}
                            className="rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-[9px] uppercase tracking-[0.16em] text-red-200"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="text-[9px] uppercase tracking-[0.16em] text-muted/50 hover:text-white/70"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirming(entry.id)}
                          aria-label="Delete this scan"
                          className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-muted/50 transition-colors hover:border-red-400/40 hover:text-red-200/80"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.4}
                            strokeLinecap="round"
                            className="h-3.5 w-3.5"
                          >
                            <path d="M5 7h14M10 7V5.5h4V7M6.5 7l.7 11a1.5 1.5 0 0 0 1.5 1.4h6.6a1.5 1.5 0 0 0 1.5-1.4l.7-11" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted/35">
            {entries.length} of 60 saved · managed on this device
          </p>
        </>
      )}
    </div>
  );
}
