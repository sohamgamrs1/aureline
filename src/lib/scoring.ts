/**
 * Aureline — scoring engine.
 *
 * Pure maths over MediaPipe FaceMesh landmarks. No network, no model, no
 * heuristics hidden behind an API: every number on the result screen is derived
 * from the 478 landmarks below.
 *
 * Coordinate contract: every landmark arriving here has ALREADY been converted
 * from MediaPipe's normalised 0..1 space into image pixels (x * width,
 * y * height). Angles are therefore only meaningful after that conversion, and
 * all angle maths in this file assumes pixel space.
 */

import type {
  BreakdownCard,
  MetricKey,
  MetricSet,
  Pixel,
  RawMeasurements,
  Tier,
} from "./types";

/* ------------------------------------------------------------------ */
/* Landmark indices (MediaPipe FaceMesh canonical topology)            */
/* ------------------------------------------------------------------ */

export const LM = {
  browMid: 10,
  glabella: 9,
  nasion: 168,
  noseTip: 1,
  subnasale: 2,
  upperLip: 13,
  chin: 152,
  faceEdgeRight: 234,
  faceEdgeLeft: 454,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftInner: 362,
  eyeLeftOuter: 263,
  irisRight: 468,
  irisLeft: 473,
  eyelidRightTop: 159,
  eyelidRightBottom: 145,
  eyelidLeftTop: 386,
  eyelidLeftBottom: 374,
  jawRight: 172,
  jawLeft: 397,
} as const;

/** Anatomically mirrored pairs used for the symmetry measurement. */
const SYMMETRY_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [33, 263],
  [133, 362],
  [159, 386],
  [145, 374],
  [70, 300],
  [63, 293],
  [105, 334],
  [66, 296],
  [61, 291],
  [58, 288],
  [93, 323],
  [234, 454],
  [127, 356],
  [132, 361],
  [172, 397],
  [136, 365],
  [150, 379],
  [149, 378],
  [176, 400],
  [205, 425],
];

/** Weights from the brief. They sum to 1.0 across the five scored metrics. */
export const METRIC_WEIGHTS: Record<Exclude<MetricKey, "midface">, number> = {
  symmetry: 0.3,
  thirds: 0.25,
  fifths: 0.2,
  canthalTilt: 0.15,
  fwhr: 0.1,
};

/* ------------------------------------------------------------------ */
/* Small vector helpers                                                */
/* ------------------------------------------------------------------ */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * closeness = clamp01(1 - |deviation| / tolerance)
 * The single scoring primitive in Aureline: deviation 0 scores 1, deviation at
 * or beyond tolerance scores 0.
 */
export const closeness = (deviation: number, tolerance: number) =>
  clamp01(1 - Math.abs(deviation) / tolerance);

const dist = (a: Pixel, b: Pixel) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Pixel, b: Pixel): Pixel => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const mean = (values: number[]) =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

const stdev = (values: number[]) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
};

const coefficientOfVariation = (values: number[]) => {
  const m = mean(values);
  return m === 0 ? 0 : stdev(values) / m;
};

/** Perpendicular distance from p to the infinite line through a and b. */
const perpendicularDistance = (p: Pixel, a: Pixel, b: Pixel) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
};

/** Mirror p across the infinite line through a and b. */
const reflect = (p: Pixel, a: Pixel, b: Pixel): Pixel => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...p };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
};

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export type SkinStats = {
  /** Mean luminance of the sampled cheek patch, 0..1. */
  luminance: number;
  /** Normalised standard deviation inside that patch, 0..1. */
  variance: number;
};

export type GeometryResult = {
  metrics: MetricSet;
  raw: RawMeasurements;
};

/**
 * Build an orthonormal basis aligned to the face, so that every ratio is
 * measured in the face's own frame rather than the camera's.
 *
 * `u` points down the brow→chin midline (the true vertical of the head),
 * `h` is the perpendicular horizontal axis. Using this basis is what makes the
 * canthal-tilt measurement roll-proof: the eye line is measured against the
 * head's horizontal, never against itself.
 */
const buildBasis = (landmarks: Pixel[]) => {
  const brow = landmarks[LM.browMid];
  const chin = landmarks[LM.chin];
  const dx = chin.x - brow.x;
  const dy = chin.y - brow.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len }; // vertical, pointing down
  const h = { x: u.y, y: -u.x }; // horizontal, pointing to image-right
  return { u, h, brow, chin, rollRad: Math.atan2(dx, dy) };
};

const project = (p: Pixel, origin: Pixel, axis: Pixel) =>
  (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y;

/**
 * Measure every ratio Aureline scores. `skin` comes from the pixel sampler in
 * lib/mediapipe.ts (Aureline never guesses skin quality from geometry alone).
 */
export function measure(
  landmarks: Pixel[],
  imageWidth: number,
  imageHeight: number,
  skin: SkinStats
): GeometryResult {
  const { u, h, brow, chin, rollRad } = buildBasis(landmarks);
  const L = (i: number) => landmarks[i];

  const faceWidth = dist(L(LM.faceEdgeRight), L(LM.faceEdgeLeft));
  const faceHeight = dist(brow, chin);
  const headRollDeg = (rollRad * 180) / Math.PI;

  /* --- 1. Symmetry ------------------------------------------------- */
  // Reflect every left-side landmark across the brow→chin midline and measure
  // how far it lands from its right-side partner.
  const misses = SYMMETRY_PAIRS.filter(
    ([a, b]) => landmarks[a] && landmarks[b]
  ).map(([a, b]) => {
    const mirrored = reflect(landmarks[a], brow, chin);
    return dist(mirrored, landmarks[b]);
  });
  const symmetryMiss = faceWidth > 0 ? mean(misses) / faceWidth : 0;
  // Real faces never hit 0; 5.5% of face width is the tolerance band.
  const symmetry = closeness(symmetryMiss, 0.055);

  /* --- 2. Facial thirds -------------------------------------------- */
  // Hairline → brow → subnasale → chin, projected on the face's vertical axis.
  const t1 = Math.abs(project(L(LM.glabella), brow, u) - project(brow, brow, u));
  const t2 = Math.abs(project(L(LM.subnasale), brow, u) - project(L(LM.glabella), brow, u));
  const t3 = Math.abs(project(chin, brow, u) - project(L(LM.subnasale), brow, u));
  const thirdsVariation = coefficientOfVariation([t1, t2, t3]);
  const thirds = closeness(thirdsVariation, 0.11);
  const lowerThirdShare = t1 + t2 + t3 > 0 ? t3 / (t1 + t2 + t3) : 1 / 3;

  /* --- 3. Facial fifths -------------------------------------------- */
  // Five horizontal segments, each ideally one fifth of the face width.
  const fifthPoints = [
    L(LM.faceEdgeRight),
    L(LM.eyeRightOuter),
    L(LM.eyeRightInner),
    L(LM.eyeLeftInner),
    L(LM.eyeLeftOuter),
    L(LM.faceEdgeLeft),
  ];
  const projected = fifthPoints.map((p) => project(p, brow, h));
  const fifths = projected.slice(1).map((v, i) => Math.abs(v - projected[i]));
  const fifthsVariation = coefficientOfVariation(fifths);
  const fifthsScore = closeness(fifthsVariation, 0.17);

  /* --- 4. Canthal tilt (roll-corrected) ---------------------------- */
  // Angle of the inner→outer corner vector against the head's horizontal axis.
  // Because `h` is derived from brow(10)→chin(152), head roll is already
  // removed — measuring against the eye line itself would cancel the tilt out.
  const eyeTilt = (inner: Pixel, outer: Pixel) => {
    const v = { x: outer.x - inner.x, y: outer.y - inner.y };
    const along = v.x * h.x + v.y * h.y;
    const down = v.x * u.x + v.y * u.y;
    // The outer corner points along -h on one side and +h on the other, so the
    // horizontal component is taken as a magnitude: without this, one eye reads
    // ~0° and the other ~180°, and the mean is meaningless.
    return (Math.atan2(-down, Math.abs(along)) * 180) / Math.PI;
  };
  const tiltRight = eyeTilt(L(LM.eyeRightInner), L(LM.eyeRightOuter));
  const tiltLeft = eyeTilt(L(LM.eyeLeftInner), L(LM.eyeLeftOuter));
  let canthalTiltDeg = (tiltRight + tiltLeft) / 2;
  // Sub-degree values are measurement noise, not a feature: snap them to neutral.
  if (Math.abs(canthalTiltDeg) < 1) canthalTiltDeg = 0;
  // A gently positive tilt (~5.5°) reads as the most harmonious in the aesthetic
  // literature; ±9° is the tolerance band.
  const canthalTilt = closeness(canthalTiltDeg - 5.5, 9);

  /* --- 5. FWHR ----------------------------------------------------- */
  // Bizygomatic width / upper face height (nasion → upper lip).
  const upperFaceHeight = dist(L(LM.nasion), L(LM.upperLip));
  const fwhrValue = upperFaceHeight > 0 ? faceWidth / upperFaceHeight : 0;
  const fwhr = closeness(fwhrValue - 1.9, 0.45);

  /* --- 6. Midface ratio (measured, not weighted) ------------------- */
  const pupilMid = midpoint(L(LM.irisRight), L(LM.irisLeft));
  const interpupillary = dist(L(LM.irisRight), L(LM.irisLeft));
  const midfaceHeight = dist(pupilMid, L(LM.upperLip));
  const midfaceValue = midfaceHeight > 0 ? interpupillary / midfaceHeight : 0;
  const midface = closeness(midfaceValue - 1.0, 0.28);

  /* --- Extra geometry for the breakdown cards --------------------- */
  const jawRatio = faceWidth > 0 ? dist(L(LM.jawRight), L(LM.jawLeft)) / faceWidth : 0;
  const chinRatio = faceHeight > 0 ? dist(L(LM.subnasale), chin) / faceHeight : 0;

  return {
    metrics: {
      symmetry,
      thirds,
      fifths: fifthsScore,
      canthalTilt,
      fwhr,
      midface,
    },
    raw: {
      faceWidth,
      faceHeight,
      interpupillary,
      canthalTiltDeg,
      headRollDeg,
      symmetryMiss,
      thirdsVariation,
      fifthsVariation,
      fwhrValue,
      midfaceValue,
      jawRatio,
      chinRatio,
      lowerThirdShare,
      skinLuminance: skin.luminance,
      skinVariance: skin.variance,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Scores                                                              */
/* ------------------------------------------------------------------ */

export type ScoreBundle = {
  overall: number; // 0..10
  potential: number; // 0..10
  psl: number; // 1..8
  potentialPsl: number;
  tier: Tier;
  potentialTier: Tier;
};

/** Score10 = Σ(metric × weight) × 10, over the five weighted metrics. */
export function scoreFromMetrics(metrics: MetricSet, raw: RawMeasurements): ScoreBundle {
  const weighted =
    metrics.symmetry * METRIC_WEIGHTS.symmetry +
    metrics.thirds * METRIC_WEIGHTS.thirds +
    metrics.fifths * METRIC_WEIGHTS.fifths +
    metrics.canthalTilt * METRIC_WEIGHTS.canthalTilt +
    metrics.fwhr * METRIC_WEIGHTS.fwhr;

  const overall = clamp(weighted * 10, 0, 10);
  const psl = toPsl(overall);

  // Potential: what a consistent routine could add. Skin evenness, lighting and
  // definition are the three levers a person actually controls, so the uplift is
  // capped at 1.5 points and scaled by how much headroom each lever has.
  const skin = skinQualityScore(raw);
  const lighting = closeness(raw.skinLuminance - 0.6, 0.32);
  const definition = closeness(raw.jawRatio - 0.78, 0.2);
  const uplift = clamp(
    1.5 * (0.5 * (1 - skin) + 0.3 * (1 - lighting) + 0.2 * (1 - definition)),
    0.15,
    1.5
  );
  const potential = clamp(overall + uplift, 0, 10);

  return {
    overall,
    potential,
    psl,
    potentialPsl: toPsl(potential),
    tier: tierFor(psl),
    potentialTier: tierFor(toPsl(potential)),
  };
}

/** PSL = 1 + (Score10 / 10) × 7, to one decimal. */
export const toPsl = (score10: number) =>
  Math.round((1 + (clamp(score10, 0, 10) / 10) * 7) * 10) / 10;

export function tierFor(psl: number): Tier {
  if (psl < 3) return { label: "Developing", short: "Developing", tone: "developing" };
  if (psl < 4) return { label: "Low Average", short: "LTN", tone: "low" };
  if (psl < 5) return { label: "Average", short: "MTN", tone: "mid" };
  if (psl < 6) return { label: "Above Average", short: "HTN", tone: "above" };
  if (psl < 7) return { label: "High", short: "Chadlite", tone: "high" };
  if (psl < 8) return { label: "Elite", short: "Chad", tone: "elite" };
  return { label: "Top Tier", short: "Top Tier", tone: "top" };
}

/* ------------------------------------------------------------------ */
/* Rule-based extras                                                   */
/* ------------------------------------------------------------------ */

/** Skin quality = evenness of tone + healthy exposure. Purely from the pixels. */
export function skinQualityScore(raw: RawMeasurements) {
  const evenness = closeness(raw.skinVariance, 0.11);
  const exposure = closeness(raw.skinLuminance - 0.6, 0.34);
  return clamp01(0.55 * evenness + 0.45 * exposure);
}

/** Jawline = gonial width relative to bizygomatic width. Geometry only. */
export function jawlineScore(raw: RawMeasurements) {
  return closeness(raw.jawRatio - 0.78, 0.2);
}

/** Eye area = canthal tilt + intercanthal spacing + eyelid aperture. */
function eyeAreaScore(metrics: MetricSet, landmarks: Pixel[]) {
  const L = (i: number) => landmarks[i];
  const rightWidth = dist(L(LM.eyeRightOuter), L(LM.eyeRightInner));
  const leftWidth = dist(L(LM.eyeLeftOuter), L(LM.eyeLeftInner));
  const eyeWidth = (rightWidth + leftWidth) / 2;
  const intercanthal = dist(L(LM.eyeRightInner), L(LM.eyeLeftInner));
  const spacing = eyeWidth > 0 ? intercanthal / eyeWidth : 1; // ideal ≈ 1.0
  const aperture =
    eyeWidth > 0
      ? ((dist(L(LM.eyelidRightTop), L(LM.eyelidRightBottom)) +
          dist(L(LM.eyelidLeftTop), L(LM.eyelidLeftBottom))) /
          2) /
        eyeWidth
      : 0.3; // ideal ≈ 0.30

  return clamp01(
    0.5 * metrics.canthalTilt +
      0.3 * closeness(spacing - 1.0, 0.28) +
      0.2 * closeness(aperture - 0.3, 0.14)
  );
}

/* ------------------------------------------------------------------ */
/* Breakdown cards                                                     */
/* ------------------------------------------------------------------ */

const band = (score: number): "high" | "mid" | "low" =>
  score >= 78 ? "high" : score >= 58 ? "mid" : "low";

type Copy = { high: string; mid: string; low: string };

const copy = (c: Copy, score: number) => c[band(score)];

export function buildBreakdown(
  metrics: MetricSet,
  raw: RawMeasurements,
  bundle: ScoreBundle,
  landmarks: Pixel[]
): BreakdownCard[] {
  const pct = (v: number) => Math.round(clamp01(v) * 100);
  const symmetry = pct(metrics.symmetry);
  const thirdsScore = pct(metrics.thirds);
  const harmony = pct((metrics.symmetry + metrics.thirds + metrics.fifths) / 3);
  const eye = pct(eyeAreaScore(metrics, landmarks));
  const midface = pct(metrics.midface);
  const jaw = pct(jawlineScore(raw));
  const skin = pct(skinQualityScore(raw));
  const lowerThird = pct(
    0.65 * closeness(raw.lowerThirdShare - 1 / 3, 0.11) + 0.35 * closeness(raw.chinRatio - 0.36, 0.12)
  );

  return [
    {
      key: "overall",
      label: "Overall",
      score: Math.round(bundle.overall * 10),
      blurb: copy(
        {
          high: "Your proportions land in a strong, cohesive band.",
          mid: "A balanced face with clear room to sharpen a few angles.",
          low: "An honest starting point — and the easiest one to improve.",
        },
        bundle.overall * 10
      ),
      tip: "Re-scan in three months with the same lighting to track real change.",
    },
    {
      key: "symmetry",
      label: "Symmetry",
      score: symmetry,
      blurb: copy(
        {
          high: "Left and right sit almost on top of each other.",
          mid: "Small natural differences — every face has them.",
          low: "A visible left/right offset, usually camera angle rather than anatomy.",
        },
        symmetry
      ),
      tip: "Sleep on your back, chew evenly, and shoot dead-on for a cleaner read.",
    },
    {
      key: "eyeArea",
      label: "Eye Area",
      score: eye,
      blurb: copy(
        {
          high: "A gently positive canthal tilt with well-set spacing.",
          mid: "Neutral tilt and spacing — calm and balanced.",
          low: "Tilt or spacing sits outside the typical band.",
        },
        eye
      ),
      tip: "Sleep, hydration and screen breaks do more for the eye area than anything else.",
    },
    {
      key: "midface",
      label: "Midface",
      score: midface,
      blurb: copy(
        {
          high: "Compact midface — strong width-to-height balance.",
          mid: "A midface length right in the middle of the typical range.",
          low: "A slightly longer midface than the reference ratio.",
        },
        midface
      ),
      tip: "Good posture and a relaxed jaw keep the midface reading compact in photos.",
    },
    {
      key: "lowerThird",
      label: "Lower Third",
      score: lowerThird,
      blurb: copy(
        {
          high: "Chin and jaw share the lower third in a clean proportion.",
          mid: "The lower third is close to an even split.",
          low: "The lower third is off an even split by a visible margin.",
        },
        lowerThird
      ),
      tip: "Keep body fat in a healthy range — it's the biggest lever on lower-third definition.",
    },
    {
      key: "jawline",
      label: "Jawline",
      score: jaw,
      blurb: copy(
        {
          high: "Wide, well-defined gonial angles against the cheekbones.",
          mid: "A defined jaw with a little width left on the table.",
          low: "The jaw is narrower than the cheekbones in this frame.",
        },
        jaw
      ),
      tip: "Fix forward head posture and reduce salt — puffiness hides the jaw first.",
    },
    {
      key: "skinQuality",
      label: "Skin Quality",
      score: skin,
      blurb: copy(
        {
          high: "Even tone and healthy exposure across the sampled area.",
          mid: "Mostly even, with some variation the camera picks up.",
          low: "Uneven tone or low light is flattening the read.",
        },
        skin
      ),
      tip: "Cleanser, moisturiser and daily SPF are the whole routine. Add nothing else first.",
    },
    {
      key: "harmony",
      label: "Facial Harmony",
      score: harmony,
      blurb: copy(
        {
          high: "Thirds, fifths and symmetry agree with each other.",
          mid: "A coherent face with one proportion pulling slightly.",
          low: "The three big proportions disagree — usually a lens or angle artefact.",
        },
        harmony
      ),
      tip: "Shoot at 2× zoom from a step back. Wide lenses distort harmony the most.",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Aggregate entry point                                               */
/* ------------------------------------------------------------------ */

export type Analysis = GeometryResult & ScoreBundle & { breakdown: BreakdownCard[] };

export function analyse(
  landmarks: Pixel[],
  imageWidth: number,
  imageHeight: number,
  skin: SkinStats
): Analysis {
  const geometry = measure(landmarks, imageWidth, imageHeight, skin);
  const bundle = scoreFromMetrics(geometry.metrics, geometry.raw);
  const breakdown = buildBreakdown(geometry.metrics, geometry.raw, bundle, landmarks);
  return { ...geometry, ...bundle, breakdown };
}
