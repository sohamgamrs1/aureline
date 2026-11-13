import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import ScoreCircle from "@/components/ScoreCircle";
import MetricBar from "@/components/MetricBar";
import { drawOverlay } from "@/lib/mediapipe";
import { addHistory, clearSession, getSession } from "@/lib/storage";
import { rankLevers } from "@/lib/routine";
import type { ScanSession } from "@/lib/types";

/* ------------------------------ overlay ------------------------------- */

function OverlayPhoto({ session }: { session: ScanSession }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !session.landmarks.length) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let cancelled = false;

    const paint = (progress: number) => {
      if (cancelled) return;
      drawOverlay(canvas, session.landmarks, {
        imageWidth: session.imageWidth,
        imageHeight: session.imageHeight,
        progress,
      });
    };

    const start = () => {
      setReady(true);
      if (reduce) {
        paint(1);
        return;
      }
      const t0 = performance.now();
      const loop = (now: number) => {
        const t = Math.min(1, (now - t0) / 1400);
        paint(t);
        if (t < 1) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    // One frame of layout before measuring the canvas box.
    const id = window.setTimeout(start, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      cancelAnimationFrame(raf);
    };
  }, [session]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-[22px] border border-white/[0.08] bg-ink-950 shadow-lift"
      style={{ aspectRatio: `${session.imageWidth} / ${session.imageHeight}` }}
    >
      {session.photo ? (
        <img
          src={session.photo}
          alt="Your scanned photo with measurement lines"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-[11px] leading-relaxed text-muted/50">
            Photo not retained. The measurements below are unaffected.
          </p>
        </div>
      )}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/70 via-transparent to-transparent" />
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-x-4 gap-y-1">
        {[
          ["—", "midline"],
          ["---", "thirds"],
          ["◆", "landmarks"],
          ["⌁", "canthal tilt"],
        ].map(([mark, label]) => (
          <span
            key={label}
            className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-white/45"
          >
            <span className="text-gold-300/80">{mark}</span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- page -------------------------------- */

export default function ResultPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ScanSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="h-9 w-9 animate-spin rounded-full border border-gold-400/25 border-t-gold-300" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto grid min-h-[60vh] w-full max-w-lg place-content-center px-5 text-center">
        <p className="eyebrow">No result yet</p>
        <h1 className="mt-4 font-display text-3xl text-white">Nothing measured.</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted/70">
          Results live only in this tab, and they are cleared when you close it. Run a
          scan to see your breakdown.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/scan" className="btn-gold">
            Start Scan
          </Link>
          <Link to="/history" className="btn-ghost">
            History
          </Link>
        </div>
      </div>
    );
  }

  const pct = (v: number) => Math.round(v * 100);
  const raw = session.raw;
  const levers = rankLevers(session.metrics, raw);
  const delta = session.potential - session.overall;

  const bars = [
    { label: "Symmetry", value: pct(session.metrics.symmetry), readout: `${(raw.symmetryMiss * 100).toFixed(1)}% off` },
    { label: "Facial Thirds", value: pct(session.metrics.thirds), readout: `±${(raw.thirdsVariation * 100).toFixed(1)}%` },
    { label: "Facial Fifths", value: pct(session.metrics.fifths), readout: `±${(raw.fifthsVariation * 100).toFixed(1)}%` },
    { label: "Canthal Tilt", value: pct(session.metrics.canthalTilt), readout: `${raw.canthalTiltDeg.toFixed(1)}°` },
    { label: "Width ÷ Height", value: pct(session.metrics.fwhr), readout: raw.fwhrValue.toFixed(2) },
    { label: "Midface", value: pct(session.metrics.midface), readout: raw.midfaceValue.toFixed(2) },
    {
      label: "Jawline",
      value: pct(session.breakdown.find((c) => c.key === "jawline")!.score / 100),
      readout: raw.jawRatio.toFixed(2),
    },
    {
      label: "Skin Quality",
      value: pct(session.breakdown.find((c) => c.key === "skinQuality")!.score / 100),
      readout: `${Math.round(raw.skinLuminance * 100)}% lit`,
    },
  ];

  const save = () => {
    addHistory({
      id: session.id,
      date: session.createdAt,
      overall: session.overall,
      potential: session.potential,
      psl: session.psl,
      metrics: session.metrics,
    });
    setSaved(true);
  };

  const retake = () => {
    clearSession();
    navigate("/scan");
  };

  const tips = [
    levers[0] && `Priority one: ${levers[0].label}.`,
    levers[1] && `Priority two: ${levers[1].label}.`,
    "Shoot again in 8–12 weeks, same light, same distance. That is the only way to read real change.",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
      {/* header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Step 02 · Result</p>
          <h1 className="mt-4 font-display text-[2rem] leading-tight text-white sm:text-[2.6rem]">
            Your read, measured.
          </h1>
          <p className="mt-3 text-[12px] text-muted/60">
            {new Date(session.createdAt).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" · "}
            {session.landmarks.length || 478} landmarks
          </p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={retake} className="btn-ghost" type="button">
            Retake
          </button>
          <button onClick={save} className="btn-gold" type="button" disabled={saved}>
            {saved ? "Saved ✓" : "Save Result"}
          </button>
        </div>
      </header>

      {/* hero: photo + scores */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="animate-fade-in">
          <OverlayPhoto session={session} />
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-muted/45">
            Measurement overlay · original photo, not retouched
          </p>
        </div>

        <div className="card-gold animate-fade-up p-6 sm:p-8">
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
            <ScoreCircle
              value={session.overall / 10}
              display={session.overall.toFixed(1)}
              label="Overall"
              sublabel={`${session.tier.label}`}
              size={228}
            />

            <div className="w-full flex-1 space-y-4">
              <div className="flex items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
                <div>
                  <p className="eyebrow">PSL</p>
                  <p className="stat-num mt-2 font-display text-4xl leading-none text-white">
                    {session.psl.toFixed(1)}
                    <span className="ml-1 text-base text-muted/50">/ 8</span>
                  </p>
                </div>
                <span className="rounded-full border border-gold-400/30 bg-gold-400/[0.08] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-gold-200">
                  {session.tier.short}
                </span>
              </div>

              <div className="flex items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
                <div>
                  <p className="eyebrow">Potential</p>
                  <p className="stat-num mt-2 font-display text-4xl leading-none gold-text">
                    {session.potential.toFixed(1)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="stat-num text-[11px] text-emerald-300/80">
                    +{delta.toFixed(1)}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted/50">
                    PSL {session.potentialPsl.toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-muted/50">
                    Head roll
                  </p>
                  <p className="stat-num mt-1 text-[13px] text-white/85">
                    {Math.abs(raw.headRollDeg).toFixed(1)}°
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-muted/50">
                    Interpupillary
                  </p>
                  <p className="stat-num mt-1 text-[13px] text-white/85">
                    {Math.round(raw.interpupillary)} px
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-7 border-t border-white/[0.07] pt-4 text-[11px] leading-relaxed text-muted/55">
            Potential adds up to 1.5 points from the levers a routine can move — skin
            evenness, lighting, and definition. It is a ceiling, not a promise.
          </p>
        </div>
      </section>

      {/* metric bars */}
      <section className="mt-6 card p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl text-white/95">Measured ratios</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted/45">
            Each scaled to a 0–100 closeness band
          </p>
        </div>
        <div className="mt-7 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {bars.map((bar, i) => (
            <MetricBar
              key={bar.label}
              label={bar.label}
              value={bar.value}
              readout={bar.readout}
              delay={140 + i * 70}
              emphasis={i === 0}
            />
          ))}
        </div>
        <p className="mt-7 border-t border-white/[0.07] pt-4 text-[11px] leading-relaxed text-muted/45">
          The overall score blends symmetry 30%, thirds 25%, fifths 20%, canthal tilt 15%
          and width-to-height 10%. Midface is reported but not weighted.
        </p>
      </section>

      {/* breakdown */}
      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl text-white/95">Detailed breakdown</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted/45">
            Eight readings · one tip each
          </p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {session.breakdown.map((card, i) => (
            <article
              key={card.key}
              className="card animate-fade-up flex flex-col p-5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted/60">
                  {card.label}
                </p>
                <p className="stat-num font-display text-xl text-white/95">
                  {card.score}
                </p>
              </div>
              <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${card.score}%`,
                    background:
                      "linear-gradient(90deg, rgba(158,123,34,0.8), #D4AF37 60%, #F4E6BF)",
                  }}
                />
              </div>
              <p className="mt-4 text-[12px] leading-relaxed text-muted/75">
                {card.blurb}
              </p>
              <p className="mt-auto pt-4 text-[11px] leading-relaxed text-gold-200/75">
                {card.tip}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* retake tips + next */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-6 sm:p-7">
          <p className="eyebrow">Where to put the effort</p>
          <ul className="mt-5 space-y-4">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-3.5">
                <span className="stat-num mt-0.5 font-display text-[12px] text-gold-400/70">
                  0{i + 1}
                </span>
                <span className="text-[13px] leading-relaxed text-white/80">{tip}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/routine" className="btn-gold">
              Build my routine
            </Link>
            <Link to="/history" className="btn-ghost">
              See history
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-white/[0.06] px-6 py-6">
          <p className="eyebrow">Disclaimer</p>
          <p className="mt-4 text-[12px] leading-relaxed text-muted/65">
            This is an AI estimate for fun and self improvement, not a medical or
            psychological assessment. Aureline does not infer age, ethnicity, or any
            condition, and never suggests surgery. A photograph is a single moment in
            single lighting — treat the number as a data point, not a verdict.
          </p>
        </div>
      </section>
    </div>
  );
}
