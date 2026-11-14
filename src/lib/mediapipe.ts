/**
 * Aureline — MediaPipe FaceLandmarker pipeline.
 *
 * Runs entirely in the browser. The photo is decoded into an <img>, drawn to an
 * offscreen canvas for pixel sampling, and never leaves the device: there is no
 * upload path in this file, and none anywhere else in the app.
 *
 * Two details matter and are easy to get wrong:
 *  1. Landmarks arrive normalised 0..1. Every distance and angle below is
 *     computed AFTER converting to pixels — normalised space is not square, so
 *     angles measured in it are wrong.
 *  2. Head roll is derived from the brow(10)→chin(152) midline, never from the
 *     eye line, otherwise the canthal-tilt measurement cancels itself out.
 */

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { Pixel, QualityIssue, QualityReport, ScanSession } from "./types";
import { analyse } from "./scoring";

// Relative on purpose. Vite's BASE_URL define is not guaranteed to exist under
// every bundler, and reading it at module scope throws before React mounts —
// which renders the whole app blank. A plain relative path resolves correctly
// from https://localhost (Capacitor), from file://, from a sub-path, and in dev,
// and it stays correct under HashRouter where the pathname never changes.
const WASM_LOCAL = "./mediapipe/wasm";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_LOCAL = "./mediapipe/face_landmarker.task";
const MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

/** True when the bundled model is present under /public/mediapipe. */
let usingBundledAssets = true;
export const isUsingBundledAssets = () => usingBundledAssets;

async function assetExists(url: string) {
  try {
    // A ranged GET, not a HEAD: some static hosts (and Next's own static file
    // handler) abort HEAD requests, which would silently push every user onto
    // the CDN even though the assets are bundled.
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
    });
    if (!res.ok && res.status !== 206) return false;
    // A server that did not find the file may still answer 200 with HTML.
    const type = res.headers.get("content-type") ?? "";
    return !type.includes("text/html");
  } catch {
    return false;
  }
}

/**
 * Load the landmarker once per session. Assets resolve in this order:
 * bundled /public/mediapipe first (fast, offline, cacheable), then the official
 * CDN so a fresh clone without `npm run fetch:models` still works.
 */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const { FaceLandmarker: FL, FilesetResolver } = vision;

    const hasLocal = await assetExists(`${WASM_LOCAL}/vision_wasm_internal.js`);
    usingBundledAssets = hasLocal;

    const fileset = await FilesetResolver.forVisionTasks(hasLocal ? WASM_LOCAL : WASM_CDN);

    // MediaPipe prints a benign "INFO: Created TensorFlow Lite XNNPACK delegate"
    // line through console.error while it initialises. Filter exactly that one
    // line so the console stays clean, then restore immediately.
    const createQuietly = async (
      filesetForRun: typeof fileset,
      modelAssetPath: string,
      delegate: "CPU" | "GPU"
    ) => {
      const original = console.error;
      console.error = (...args: unknown[]) => {
        if (typeof args[0] === "string" && args[0].startsWith("INFO: Created TensorFlow")) return;
        original.apply(console, args as []);
      };
      try {
        return await FL.createFromOptions(filesetForRun, {
          baseOptions: { modelAssetPath, delegate },
          runningMode: "IMAGE",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
      } finally {
        console.error = original;
      }
    };

    const build = createQuietly;

    // CPU first, deliberately. A single IMAGE-mode pass is ~150–400 ms on CPU,
    // while the GPU delegate costs several seconds of shader compilation before
    // the first inference — a bad trade for a one-shot scan, and it fails
    // outright on machines without a usable GPU.
    try {
      return await build(fileset, hasLocal ? MODEL_LOCAL : MODEL_CDN, "CPU");
    } catch {
      // Bundled asset unreadable — retry once against the official CDN.
      usingBundledAssets = false;
      const cdnFileset = await FilesetResolver.forVisionTasks(WASM_CDN);
      return await build(cdnFileset, MODEL_CDN, "CPU");
    }
  })();

  // Never cache a failed load — let the next attempt retry cleanly.
  landmarkerPromise.catch(() => {
    landmarkerPromise = null;
  });

  return landmarkerPromise;
}

/* ------------------------------------------------------------------ */
/* Image helpers                                                       */
/* ------------------------------------------------------------------ */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode that image."));
    img.src = src;
  });
}

/** Downscale huge phone photos — 1280px on the long edge is plenty for 478 points. */
export async function prepareImage(file: File | Blob, maxEdge = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Grab a mirrored frame from the webcam as a JPEG data URL. */
export function captureVideoFrame(video: HTMLVideoElement, mirrored = true, maxEdge = 1280) {
  const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  if (mirrored) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width, height };
}

async function drawToCanvas(dataUrl: string) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx, img };
}

/* ------------------------------------------------------------------ */
/* Pixel sampling                                                      */
/* ------------------------------------------------------------------ */

/** Mean luminance and normalised spread inside a rectangular patch. */
function patchStats(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const half = Math.max(3, Math.round(size / 2));
  const x = Math.max(0, Math.round(cx - half));
  const y = Math.max(0, Math.round(cy - half));
  const w = Math.min(ctx.canvas.width - x, half * 2);
  const h = Math.min(ctx.canvas.height - y, half * 2);
  if (w <= 0 || h <= 0) return { luminance: 0.5, variance: 0 };

  const { data } = ctx.getImageData(x, y, w, h);
  const lum: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    lum.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
  }
  const mean = lum.reduce((s, v) => s + v, 0) / lum.length;
  const variance = Math.sqrt(lum.reduce((s, v) => s + (v - mean) ** 2, 0) / lum.length);
  return { luminance: mean, variance };
}

/** Luminance, spread and edge density of a rectangular region. */
function rectStats(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) {
  const x = Math.max(0, Math.round(Math.min(x0, x1)));
  const y = Math.max(0, Math.round(Math.min(y0, y1)));
  const w = Math.min(ctx.canvas.width - x, Math.round(Math.abs(x1 - x0)));
  const h = Math.min(ctx.canvas.height - y, Math.round(Math.abs(y1 - y0)));
  if (w <= 1 || h <= 1) return null;

  const { data } = ctx.getImageData(x, y, w, h);
  const lum = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    lum[p] = v;
    sum += v;
  }
  const mean = sum / lum.length;
  let sq = 0;
  for (let i = 0; i < lum.length; i++) sq += (lum[i] - mean) ** 2;
  const sd = Math.sqrt(sq / lum.length);

  let edge = 0;
  let n = 0;
  for (let yy = 0; yy < h - 1; yy++) {
    for (let xx = 0; xx < w - 1; xx++) {
      const i = yy * w + xx;
      edge += Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + w]);
      n++;
    }
  }
  return { mean, sd, edge: n ? edge / n : 0, lum };
}

/**
 * Presentation signals — hair and grooming, read from pixels rather than
 * landmarks.
 *
 * These describe how the face is *presented in this photograph*, not the person:
 * how much of the hairline band reads as hair, how defined the brow band is, how
 * even the beard/jaw-shadow region is, and how much the lip line contrasts.
 * They are the least reliable signals in the model and are weighted accordingly.
 */
function samplePresentation(
  ctx: CanvasRenderingContext2D,
  pts: Pixel[],
  faceWidth: number,
  skinLuminance: number
) {
  const midX = (pts[10].x + pts[152].x) / 2;
  const faceHeight = Math.hypot(pts[152].x - pts[10].x, pts[152].y - pts[10].y) || 1;

  /* hairline band — just above the top of the forehead */
  const hair = rectStats(
    ctx,
    midX - faceWidth * 0.5,
    pts[10].y - faceHeight * 0.3,
    midX + faceWidth * 0.5,
    pts[10].y + faceHeight * 0.02
  );
  let hairCoverage = 0;
  if (hair) {
    const threshold = skinLuminance * 0.72;
    let dark = 0;
    for (let i = 0; i < hair.lum.length; i++) if (hair.lum[i] < threshold) dark++;
    hairCoverage = dark / hair.lum.length;
  }

  /* brow band — glabella down to the upper eyelid, between the outer corners */
  const irisY = (pts[468].y + pts[473].y) / 2;
  const browTop = pts[9].y;
  const brow = rectStats(
    ctx,
    Math.min(pts[33].x, pts[133].x),
    browTop,
    Math.max(pts[362].x, pts[263].x),
    browTop + (irisY - browTop) * 0.55
  );
  const browDefinition = brow ? Math.min(1, brow.edge / 0.1) : 0;

  /* beard / jaw-shadow region — below the mouth to the chin */
  const mouthY = (pts[61].y + pts[291].y) / 2;
  const beard = rectStats(
    ctx,
    midX - faceWidth * 0.32,
    mouthY + faceHeight * 0.1,
    midX + faceWidth * 0.32,
    pts[152].y - faceHeight * 0.03
  );
  const facialHair = beard ? Math.max(0, 1 - Math.min(1, beard.sd / 0.22)) : 0;

  /* lip line — upper lip to just below the mouth corners */
  const lip = rectStats(
    ctx,
    Math.min(pts[61].x, pts[291].x),
    pts[13].y,
    Math.max(pts[61].x, pts[291].x),
    mouthY + (pts[152].y - mouthY) * 0.08
  );
  const lipDefinition = lip ? Math.min(1, Math.abs(lip.mean - skinLuminance) / 0.25) : 0;

  return { hairCoverage, browDefinition, facialHair, lipDefinition };
}

/**
 * Skin sample: the two cheek patches. Averaging two regions cancels the side of
 * the face that happens to be lit better, which is what makes this stable.
 */
function sampleSkin(ctx: CanvasRenderingContext2D, pts: Pixel[], faceWidth: number) {
  const patch = Math.max(6, faceWidth * 0.13);
  const a = patchStats(ctx, pts[205].x, pts[205].y, patch);
  const b = patchStats(ctx, pts[425].x, pts[425].y, patch);
  return {
    luminance: (a.luminance + b.luminance) / 2,
    variance: (a.variance + b.variance) / 2,
  };
}

/** Laplacian variance on a 0..1 grayscale copy — a cheap, reliable blur test. */
function sharpnessScore(ctx: CanvasRenderingContext2D) {
  const w = 256;
  const h = Math.max(1, Math.round((ctx.canvas.height / ctx.canvas.width) * w));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return 1;
  sctx.drawImage(ctx.canvas, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
  }

  const responses: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      responses.push(
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      );
    }
  }
  if (!responses.length) return 1;
  const mean = responses.reduce((s, v) => s + v, 0) / responses.length;
  return responses.reduce((s, v) => s + (v - mean) ** 2, 0) / responses.length;
}

/* ------------------------------------------------------------------ */
/* Quality gate                                                        */
/* ------------------------------------------------------------------ */

export function evaluateQuality(pts: Pixel[], frame: { width: number; height: number }, pixels: {
  brightness: number;
  sharpness: number;
}): QualityReport {
  const faceWidth = Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y);
  const faceSize = faceWidth / frame.width;

  // Head roll, straight from the brow→chin midline.
  const roll =
    (Math.atan2(pts[152].x - pts[10].x, pts[152].y - pts[10].y) * 180) / Math.PI;

  // Yaw: how far the nose tip drifts from the midpoint of the two face edges.
  const edgeMid = (pts[234].x + pts[454].x) / 2;
  const yaw = faceWidth > 0 ? Math.abs(pts[1].x - edgeMid) / faceWidth : 0;

  const report: QualityReport = {
    ok: true,
    faceSize,
    yaw,
    roll,
    brightness: pixels.brightness,
    sharpness: pixels.sharpness,
  };

  const fail = (issue: QualityIssue): QualityReport => ({ ...report, ok: false, issue });

  if (faceSize < 0.24) {
    return fail({
      code: "too-small",
      reason: "Your face fills only a small part of the frame, so proportions can't be measured reliably.",
      fix: "Move closer — fill roughly half the frame height with your face, then shoot again.",
    });
  }
  if (Math.abs(roll) > 8) {
    return fail({
      code: "tilted",
      reason: `Your head is tilted about ${Math.round(Math.abs(roll))}° off vertical.`,
      fix: "Level your head so your eyes sit parallel to the floor, then retake.",
    });
  }
  if (yaw > 0.14) {
    return fail({
      code: "turned",
      reason: "Your head is turned to the side, which shortens one half of the face.",
      fix: "Face the camera dead-on, nose pointing straight at the lens.",
    });
  }
  if (pixels.brightness < 0.26) {
    return fail({
      code: "too-dark",
      reason: "The photo is too dark to read skin tone and contrast accurately.",
      fix: "Turn to face a window or lamp so light falls evenly on your face.",
    });
  }
  if (pixels.brightness > 0.94) {
    return fail({
      code: "too-bright",
      reason: "The photo is blown out, so detail in the highlights is gone.",
      fix: "Step out of direct light or turn off the flash, then retake.",
    });
  }
  if (pixels.sharpness < 0.0009) {
    return fail({
      code: "blurry",
      reason: "The photo is soft, so landmark positions would be guesswork.",
      fix: "Hold still and tap the screen to focus before taking the photo.",
    });
  }

  return report;
}

/* ------------------------------------------------------------------ */
/* Overlay                                                             */
/* ------------------------------------------------------------------ */

export type OverlayOptions = {
  /** Photo pixel dimensions — the canvas bitmap is mapped from these. */
  imageWidth: number;
  imageHeight: number;
  /** 0..1 draw-on progress, used for the reveal animation. */
  progress?: number;
  showPoints?: boolean;
};

const GOLD = "rgba(212,175,55,";
const lerpPt = (a: Pixel, b: Pixel, t: number): Pixel => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/**
 * Draw Aureline's measurement diagram over the photo: the brow→chin midline,
 * the facial-thirds horizontals, the eye line, and the two canthal-tilt vectors.
 *
 * The canvas bitmap is sized to the CSS box at devicePixelRatio, and photo pixel
 * coordinates are mapped in with `sx`/`sy`. The <img> underneath uses
 * object-fit: cover with the same aspect ratio, so the two stay locked together.
 */
export function drawOverlay(canvas: HTMLCanvasElement, pts: Pixel[], options: OverlayOptions) {
  const { imageWidth, imageHeight, progress = 1, showPoints = true } = options;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.clientWidth || imageWidth;
  const cssHeight = canvas.clientHeight || imageHeight;

  const bmpWidth = Math.round(cssWidth * dpr);
  const bmpHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== bmpWidth) canvas.width = bmpWidth;
  if (canvas.height !== bmpHeight) canvas.height = bmpHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, bmpWidth, bmpHeight);

  const sx = bmpWidth / imageWidth;
  const sy = bmpHeight / imageHeight;
  const P = (p: Pixel): Pixel => ({ x: p.x * sx, y: p.y * sy });
  const line = (a: Pixel, b: Pixel) => Math.hypot(b.x - a.x, b.y - a.y);

  const brow = P(pts[10]);
  const chin = P(pts[152]);
  const faceWidth = line(P(pts[234]), P(pts[454]));

  // Unit vectors of the head's own frame, in canvas space.
  const vlen = line(brow, chin) || 1;
  const u = { x: (chin.x - brow.x) / vlen, y: (chin.y - brow.y) / vlen };
  const h = { x: u.y, y: -u.x };

  const strokeLine = (
    a: Pixel,
    b: Pixel,
    { color = `${GOLD}0.9)`, width = 1.8, dash = [] as number[], t = 1 } = {}
  ) => {
    if (t <= 0) return;
    const end = lerpPt(a, b, t);

    // Dark underlay first: gold on a pale cheek is unreadable without it, and
    // the photo underneath is always unknown, so the diagram carries its own
    // contrast.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = "rgba(4,4,8,0.42)";
    ctx.lineWidth = width + 2.6 * dpr;
    ctx.lineCap = "round";
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr;
    ctx.lineCap = "round";
    ctx.setLineDash(dash);
    ctx.shadowColor = "rgba(212,175,55,0.6)";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.restore();
  };

  /* --- Facial thirds: perpendiculars through brow, subnasale, chin --- */
  const halfSpan = faceWidth * 0.52;
  const level = (p: Pixel, t: number, dashed: boolean) => {
    const a = { x: p.x - h.x * halfSpan, y: p.y - h.y * halfSpan };
    const b = { x: p.x + h.x * halfSpan, y: p.y + h.y * halfSpan };
    strokeLine(a, b, {
      color: `${GOLD}${dashed ? 0.62 : 0.92})`,
      width: dashed ? 1.4 : 1.8,
      dash: dashed ? [5, 6] : [],
      t,
    });
  };

  level(P(pts[9]), Math.min(1, progress / 0.35), true); // brow line
  level(P(pts[2]), Math.min(1, (progress - 0.3) / 0.35), false); // subnasale line
  level(chin, Math.min(1, (progress - 0.55) / 0.3), true); // menton line

  /* --- Midline: brow → chin, the axis everything else is measured on --- */
  const top = { x: brow.x - u.x * vlen * 0.18, y: brow.y - u.y * vlen * 0.18 };
  const bottom = { x: chin.x + u.x * vlen * 0.1, y: chin.y + u.y * vlen * 0.1 };
  strokeLine(top, bottom, {
    color: "rgba(255,255,255,0.72)",
    width: 1.5,
    dash: [3, 7],
    t: Math.min(1, progress / 0.5),
  });

  /* --- Eye line: the real interpupillary line (it leans with head roll) --- */
  const irisR = P(pts[468]);
  const irisL = P(pts[473]);
  strokeLine(irisR, irisL, {
    color: `${GOLD}0.7)`,
    width: 1.4,
    t: Math.min(1, Math.max(0, (progress - 0.25) / 0.4)),
  });

  /* --- Canthal tilt vectors: inner → outer, per eye --- */
  const tiltT = Math.min(1, Math.max(0, (progress - 0.45) / 0.45));
  strokeLine(P(pts[133]), P(pts[33]), { color: "rgba(244,230,191,1)", width: 2.6, t: tiltT });
  strokeLine(P(pts[362]), P(pts[263]), { color: "rgba(244,230,191,1)", width: 2.6, t: tiltT });

  /* --- Landmark dots --- */
  if (showPoints) {
    const key = [10, 9, 168, 2, 152, 234, 454, 33, 133, 362, 263, 468, 473, 1, 172, 397, 13];
    ctx.save();
    ctx.globalAlpha = Math.max(0, (progress - 0.6) / 0.4);
    for (const index of key) {
      const p = P(pts[index]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(4,4,8,0.5)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(212,175,55,0.98)";
      ctx.shadowColor = "rgba(212,175,55,0.9)";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.6 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = `${GOLD}0.35)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Full scan pipeline                                                  */
/* ------------------------------------------------------------------ */

export type ScanOutcome =
  | { status: "ok"; session: ScanSession }
  | { status: "quality"; report: QualityReport }
  | { status: "error"; message: string };

/**
 * The whole scan, start to finish:
 * decode → landmark → quality gate → pixels → measure → score.
 * A photo that fails the quality gate is never scored.
 */
export async function scanPhoto(dataUrl: string): Promise<ScanOutcome> {
  try {
    const landmarker = await loadFaceLandmarker();
    const { canvas, ctx } = await drawToCanvas(dataUrl);

    const result = landmarker.detect(canvas);
    const face = result.faceLandmarks?.[0];
    if (!face || face.length < 400) {
      return {
        status: "quality",
        report: {
          ok: false,
          faceSize: 0,
          yaw: 0,
          roll: 0,
          brightness: 0,
          sharpness: 0,
          issue: {
            code: "no-face",
            reason: "No face was detected in that photo.",
            fix: "Use a clear, well-lit photo where your whole face is visible and unobstructed.",
          },
        },
      };
    }

    // Normalised 0..1 → image pixels. Angles need square-ish units.
    const width = canvas.width;
    const height = canvas.height;
    const pts: Pixel[] = face.map((p) => ({ x: p.x * width, y: p.y * height }));

    const faceWidthPx = Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y);
    const skin = sampleSkin(ctx, pts, faceWidthPx);
    const presentation = samplePresentation(ctx, pts, faceWidthPx, skin.luminance);
    const sharpness = sharpnessScore(ctx);
    const report = evaluateQuality(pts, { width, height }, {
      brightness: skin.luminance,
      sharpness,
    });
    if (!report.ok) return { status: "quality", report };

    const analysis = analyse(pts, width, height, { ...skin, ...presentation });

    return {
      status: "ok",
      session: {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        photo: dataUrl,
        imageWidth: width,
        imageHeight: height,
        overall: analysis.overall,
        potential: analysis.potential,
        psl: analysis.psl,
        potentialPsl: analysis.potentialPsl,
        tier: analysis.tier,
        potentialTier: analysis.potentialTier,
        metrics: analysis.metrics,
        raw: analysis.raw,
        breakdown: analysis.breakdown,
        landmarks: pts,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Something went wrong while analysing that photo.",
    };
  }
}
