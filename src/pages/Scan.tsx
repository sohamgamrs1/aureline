import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import CameraGuide from "@/components/CameraGuide";
import ConsentGate from "@/components/ConsentGate";
import { loadFaceLandmarker, scanPhoto } from "@/lib/mediapipe";
import { saveSession } from "@/lib/storage";
import type { QualityReport } from "@/lib/types";

const PREP = [
  ["Light", "Face a window or a lamp so light lands evenly. No backlight."],
  ["Frame", "Face fills the oval. Hair pulled back from the jaw and forehead."],
  ["Expression", "Neutral and relaxed — no smile, no squint, eyes open."],
  ["Lens", "Back camera or a step back at 2× zoom. No wide-angle selfies."],
  ["Extras", "No filters, no glasses, no hat. Bare face reads truest."],
];

const CHECKS = [
  ["Face size", "At least 24% of the frame width"],
  ["Head angle", "Under 8° roll, 14% yaw"],
  ["Lighting", "Between 26% and 94% mean brightness"],
  ["Sharpness", "Laplacian variance above the blur floor"],
];

export default function ScanPage() {
  const navigate = useNavigate();
  const [consented, setConsented] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"loading" | "ready" | "failed">("loading");

  // Warm the model while the person is still framing their shot. By the time a
  // photo arrives, the wasm has compiled and the scan is a single inference.
  useEffect(() => {
    let alive = true;
    loadFaceLandmarker()
      .then(() => alive && setEngine("ready"))
      .catch(() => alive && setEngine("failed"));
    return () => {
      alive = false;
    };
  }, []);

  const handlePick = useCallback(
    async (dataUrl: string) => {
      setPreview(dataUrl);
      setReport(null);
      setError(null);
      setBusy(true);
      const outcome = await scanPhoto(dataUrl);
      setBusy(false);

      if (outcome.status === "ok") {
        saveSession(outcome.session);
        navigate("/result");
        return;
      }
      if (outcome.status === "quality") {
        setReport(outcome.report);
        return;
      }
      setError(outcome.message);
    },
    [navigate]
  );

  const retake = () => {
    setPreview(null);
    setReport(null);
    setError(null);
  };

  const note = report?.issue ? (
    <div className="card-gold p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold-400/40 bg-gold-400/10">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            className="h-3.5 w-3.5 text-gold-300"
          >
            <path d="M12 8v5M12 16.5h.01" />
            <circle cx="12" cy="12" r="8.5" />
          </svg>
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.26em] text-gold-400/80">
            Retake needed
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/85">
            {report.issue.reason}
          </p>
          <p className="mt-2.5 border-t border-white/[0.07] pt-2.5 text-[12px] leading-relaxed text-muted/80">
            <span className="text-gold-200/90">Fix: </span>
            {report.issue.fix}
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-10 pt-10 sm:px-8 sm:pt-14">
      <header className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Step 01 · Capture</p>
        <h1 className="mt-4 font-display text-[2.1rem] leading-tight text-white sm:text-[2.7rem]">
          Give the lens a clean frame.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed text-muted/75">
          Aureline checks the photo before it scores anything. A bad photo gets a
          retake, never a made-up number.
        </p>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="order-1">
          <CameraGuide
            preview={preview}
            onPick={handlePick}
            onRetake={retake}
            busy={busy}
            disabled={!consented}
            note={note}
          />

          {error && (
            <p className="mx-auto mt-4 max-w-md rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-[12px] leading-relaxed text-red-200/85">
              {error}
            </p>
          )}

          <p className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted/45">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                engine === "ready"
                  ? "bg-emerald-400/80"
                  : engine === "failed"
                    ? "bg-red-400/80"
                    : "animate-pulse bg-gold-400/80"
              }`}
            />
            {engine === "ready"
              ? "Face model ready · measured on this device"
              : engine === "failed"
                ? "Model unavailable — check your connection and reload"
                : "Preparing the face model"}
          </p>

          {!consented && (
            <p className="mx-auto mt-2 max-w-md text-center text-[11px] uppercase tracking-[0.2em] text-muted/50">
              Confirm the acknowledgement to enable capture
            </p>
          )}
        </div>

        <aside className="order-2 flex flex-col gap-4">
          <div className="card p-5">
            <p className="eyebrow">Photo quality check</p>
            <p className="mt-3 text-[12px] leading-relaxed text-muted/70">
              Four gates run before scoring. Fail one and you get a single reason and a
              single fix — never a partial score.
            </p>
            <ul className="mt-4 space-y-3">
              {CHECKS.map(([title, detail]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold-400/70" />
                  <span>
                    <span className="block text-[12px] text-white/80">{title}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted/55">
                      {detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Before you shoot</p>
            <ul className="mt-4 space-y-3.5">
              {PREP.map(([title, detail]) => (
                <li key={title}>
                  <span className="block text-[12px] text-white/80">{title}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted/55">
                    {detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ConsentGate onChange={setConsented} />

          <div className="rounded-card border border-white/[0.06] px-5 py-4">
            <p className="text-[11px] leading-relaxed text-muted/55">
              Your photo stays in this tab. Aureline saves only the numbers — never the
              image — and only when you press Save Result.{" "}
              <Link to="/profile" className="text-gold-300/90 underline-offset-4 hover:underline">
                Data controls
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
