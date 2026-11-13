import { useCallback, useEffect, useRef, useState } from "react";
import { captureVideoFrame, prepareImage } from "@/lib/mediapipe";

type Props = {
  /** Parent-owned preview of the chosen photo. */
  preview: string | null;
  onPick: (dataUrl: string) => void;
  onRetake: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Shown under the frame, e.g. the quality-gate fix. */
  note?: React.ReactNode;
};

type Mode = "idle" | "camera";

/**
 * The scan frame. An oval guide, a live camera with the same guide burned in,
 * and an upload path for people who would rather not use the camera.
 */
export default function CameraGuide({
  preview,
  onPick,
  onRetake,
  busy = false,
  disabled = false,
  note,
}: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    setStarting(true);
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1707 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setCameraError(
        "Camera access was blocked. You can still upload a photo from your library."
      );
      setMode("idle");
    } finally {
      setStarting(false);
    }
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const { dataUrl } = captureVideoFrame(video, true);
    stopCamera();
    setMode("idle");
    onPick(dataUrl);
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCameraError("That file is not an image. Use a JPG, PNG or HEIC export.");
      return;
    }
    setCameraError(null);
    try {
      const { dataUrl } = await prepareImage(file);
      onPick(dataUrl);
    } catch {
      setCameraError("That image could not be read. Try a different photo.");
    }
  };

  const showPreview = Boolean(preview) && mode === "idle";

  return (
    <div className="w-full">
      <div className="relative mx-auto w-full max-w-md">
        {/* Gold hairline frame with corner marks */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[26px] border border-white/[0.08] bg-ink-950 shadow-lift">
          {/* Live camera */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-500 ${
              mode === "camera" ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />

          {/* Preview */}
          {showPreview && (
                <img
              src={preview as string}
              alt="Your selected photo"
              className="absolute inset-0 h-full w-full animate-fade-in object-cover"
            />
          )}

          {/* Idle state: invitation, not an empty box */}
          {!showPreview && mode === "idle" && (
            <div className="absolute inset-0 grid place-content-center px-8 text-center">
              <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-full border border-gold-400/30 bg-gold-400/[0.06]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.2}
                  className="h-6 w-6 text-gold-300"
                >
                  <path d="M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                  <path d="M3 9.5 4.6 7h3.2L9.4 5h5.2l1.6 2h3.2L21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8Z" />
                </svg>
              </div>
              <p className="font-display text-xl text-white/90">Frame your face</p>
              <p className="mx-auto mt-2 max-w-[16rem] text-[12px] leading-relaxed text-muted/70">
                Fill the oval, look straight into the lens, and keep your expression
                relaxed.
              </p>
            </div>
          )}

          {/* Oval guide + dimming mask */}
          {!showPreview && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div
                className="absolute inset-0 bg-ink-950/55"
                style={{
                  maskImage:
                    "radial-gradient(ellipse 31% 40% at 50% 46%, transparent 97%, black 100%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 31% 40% at 50% 46%, transparent 97%, black 100%)",
                }}
              />
              <svg
                viewBox="0 0 300 400"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
              >
                <ellipse
                  cx="150"
                  cy="184"
                  rx="93"
                  ry="160"
                  fill="none"
                  stroke="rgba(212,175,55,0.55)"
                  strokeWidth="1"
                  strokeDasharray="3 7"
                  className="animate-fade-in"
                />
                <ellipse
                  cx="150"
                  cy="184"
                  rx="99"
                  ry="166"
                  fill="none"
                  stroke="rgba(212,175,55,0.16)"
                  strokeWidth="0.6"
                />
                {/* third lines inside the guide */}
                <line x1="70" y1="140" x2="230" y2="140" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" strokeDasharray="2 8" />
                <line x1="60" y1="184" x2="240" y2="184" stroke="rgba(255,255,255,0.16)" strokeWidth="0.6" strokeDasharray="2 8" />
                <line x1="70" y1="252" x2="230" y2="252" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" strokeDasharray="2 8" />
              </svg>
              {mode === "camera" && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="h-[70%] w-[58%] animate-pulse-ring rounded-[50%] border border-gold-300/25" />
                </div>
              )}
            </div>
          )}

          {/* Corner brackets */}
          <div aria-hidden className="pointer-events-none absolute inset-4">
            {(
              [
                "left-0 top-0 border-l border-t",
                "right-0 top-0 border-r border-t",
                "left-0 bottom-0 border-l border-b",
                "right-0 bottom-0 border-r border-b",
              ] as const
            ).map((cls) => (
              <span
                key={cls}
                className={`absolute h-5 w-5 border-gold-400/45 ${cls}`}
              />
            ))}
          </div>

          {busy && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
              <div className="text-center">
                <div className="mx-auto h-9 w-9 animate-spin rounded-full border border-gold-400/25 border-t-gold-300" />
                <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-gold-200/80">
                  Measuring
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-col gap-2.5">
          {showPreview ? (
            <div className="flex gap-2.5">
              <button type="button" onClick={onRetake} className="btn-ghost flex-1" disabled={busy}>
                Retake
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="btn-ghost flex-1"
                disabled={busy}
              >
                Upload another
              </button>
            </div>
          ) : mode === "camera" ? (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode("idle");
                }}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={shoot}
                className="btn-gold flex-1"
                disabled={starting}
              >
                Capture
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="btn-ghost flex-1"
                disabled={disabled || busy}
              >
                Upload Photo
              </button>
              <button
                type="button"
                onClick={startCamera}
                className="btn-gold flex-1"
                disabled={disabled || busy}
              >
                Take Photo
              </button>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>

      {(cameraError || note) && (
        <div className="mx-auto mt-4 max-w-md">
          {cameraError ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-[12px] leading-relaxed text-red-200/85">
              {cameraError}
            </p>
          ) : (
            note
          )}
        </div>
      )}
    </div>
  );
}
