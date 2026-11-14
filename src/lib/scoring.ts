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
 *
 * ── Calibration ──────────────────────────────────────────────────────────
 * Each ratio is scored with an exponential curve, fitted to real measurements:
 *
 *   closeness(deviation, scale) = clamp01(exp(-|deviation| / scale))
 *
 * See the SCALE table below for how the scales were derived. A bounded curve
 * (linear or quadratic) reaches zero at its tolerance; real deviations run 3–5×
 * larger than an idealised face suggests, so everything clamped to zero and the
 * scale stopped discriminating. Exponential decay preserves the ordering all
 * the way down. `scripts/selftest.ts` pins the distribution against the measured
 * sample in `scripts/fixtures/real-faces.json`.
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
  mouthRight: 61,
  mouthLeft: 291,
  alaRight: 129,
  alaLeft: 358,
  noseBridge: 6,
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

/**
 * Weights across the nine scored metrics. They sum to 1.0.
 *
 * Bone structure and golden-ratio proximity carry real weight because they are
 * what separates a "correct" face from a striking one: symmetry and thirds tell
 * you a face is balanced, but angularity and canon proximity are what PSL-style
 * ratings actually respond to. Skin is weighted modestly — it moves the reading
 * without letting photo quality dominate a bone-structure score.
 */
export const METRIC_WEIGHTS: Record<MetricKey, number> = {
  symmetry: 0.14,
  thirds: 0.1,
  fifths: 0.08,
  canthalTilt: 0.1,
  fwhr: 0.08,
  midface: 0.07,
  goldenRatio: 0.1,
  definition: 0.13,
  nose: 0.08,
  presentation: 0.05,
  skin: 0.07,
};

/**
 * Deviation scales, fitted to real measurements.
 *
 * These were not guessed. Nine portrait photographs were measured end to end
 * through this exact pipeline, and each scale is set so the median real
 * deviation scores 0.55 — i.e. scale = median / 0.598, from exp(-1/0.598)≈0.55.
 *
 * The numbers that came back are worth knowing, because they are far larger than
 * a synthetic "ideal" face suggests:
 *
 *   symmetry miss    median 8.7% of face width   (a perfect face is 0%)
 *   thirds CV        median 28.9%                (equal thirds are 0%)
 *   fifths CV        median 25.2%
 *
 * An earlier version used tolerances derived from a synthetic face — 4.5% and
 * 20% — so every real photo hit zero on symmetry and thirds, the failo factor
 * bottomed out, and every face landed in a narrow 2–4 band regardless of how it
 * looked. Fitting to measured data is the only thing that fixed it.
 *
 * Re-fit these if the measurement method changes. `scripts/fixtures/real-faces.json`
 * holds the raw measurements used, and `npm test` asserts the resulting spread.
 */
export const SCALE = {
  symmetry: 0.1451,
  thirds: 0.4828,
  fifths: 0.4208,
  tiltCentre: 5,
  tilt: 3.6599,
  fwhrCentre: 1.9,
  fwhr: 0.2393,
  midfaceCentre: 1.0,
  midface: 0.1256,
  goldenAspect: 0.7186,
  goldenMouthNose: 0.3929,
  goldenIntercanthal: 0.3691,
  goldenEye: 0.3462,
  jaw: 0.0509,
  gonialCentre: 130,
  gonial: 5.2,
  chin: 0.1147,
  skinEvenness: 0.1309,
  skinExposure: 0.1741,
  nose: 0.0362,
  jawVCentre: 105,
  jawV: 17.3074,
  hairCentre: 0.55,
  hair: 0.3077,
  browCentre: 0.55,
  brow: 0.383,
  beardCentre: 0.55,
  beard: 0.5531,
  lipCentre: 0.85,
  lip: 0.2508,
} as const;

/* ------------------------------------------------------------------ */
/* Small vector helpers                                                */
/* ------------------------------------------------------------------ */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Linear closeness, kept for reference and for the tolerance tests.
 * closeness = clamp01(1 - |deviation| / tolerance)
 */
export const closeness = (deviation: number, tolerance: number) =>
  clamp01(1 - Math.abs(deviation) / tolerance);

/**
 * Quadratic closeness — retained for comparison and for the curve tests.
 * Not used by the scorer any more.
 */
export const closeness2 = (deviation: number, tolerance: number) => {
  const t = Math.abs(deviation) / tolerance;
  return clamp01(1 - t * t);
};

/**
 * The curve the scorer actually uses: exponential decay, `exp(-|dev| / scale)`.
 *
 * A bounded curve (linear or quadratic) reaches exactly zero at the tolerance,
 * which is fatal once real deviations are 3–5× larger than an idealised face
 * suggests: everything clamps to zero and the scale stops discriminating. An
 * exponential never reaches zero, so a weak face still separates from a worse
 * one, and the ordering is preserved all the way down.
 */
export const closenessExp = (deviation: number, scale: number) =>
  clamp01(Math.exp(-Math.abs(deviation) / scale));

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

/** Perpendicular distance from p to the infinite line through a and b. */
const perpDistance = (p: Pixel, a: Pixel, b: Pixel) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
};

/** Interior angle at `b` in the triangle a-b-c, in degrees. */
const angleAt = (a: Pixel, b: Pixel, c: Pixel) => {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const n1 = Math.hypot(v1.x, v1.y);
  const n2 = Math.hypot(v2.x, v2.y);
  if (!n1 || !n2) return 180;
  const cos = clamp((v1.x * v2.x + v1.y * v2.y) / (n1 * n2), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
};

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export type SkinStats = {
  /** Mean luminance of the sampled cheek patch, 0..1. */
  luminance: number;
  /** Normalised standard deviation inside that patch, 0..1. */
  variance: number;
  /** Fraction of the hairline band that reads as hair, 0..1. */
  hairCoverage?: number;
  /** Edge contrast across the brow band, 0..1. */
  browDefinition?: number;
  /** Evenness of the beard/jaw-shadow region, 0..1. */
  facialHair?: number;
  /** Contrast of the lip line against the surrounding skin, 0..1. */
  lipDefinition?: number;
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
  const misses = SYMMETRY_PAIRS.filter(([a, b]) => landmarks[a] && landmarks[b]).map(
    ([a, b]) => dist(reflect(landmarks[a], brow, chin), landmarks[b])
  );
  const symmetryMiss = faceWidth > 0 ? mean(misses) / faceWidth : 0;
  const symmetry = closenessExp(symmetryMiss, SCALE.symmetry);

  /* --- 2. Facial thirds -------------------------------------------- */
  // Landmark 10 approximates the trichion (hairline), which MediaPipe estimates
  // from face shape rather than detecting hair. On a high hairline, a receding
  // one, or hair falling over the forehead it can sit well above the real
  // hairline and inflate the top third. We cannot tell that apart from a
  // genuinely long forehead, so the top third is capped rather than allowed to
  // dominate: better to under-penalise a real forehead than to crush a score on
  // a landmark we do not trust.
  const t1Raw = Math.abs(project(L(LM.glabella), brow, u) - project(brow, brow, u));
  const t2 = Math.abs(project(L(LM.subnasale), brow, u) - project(L(LM.glabella), brow, u));
  const t3 = Math.abs(project(chin, brow, u) - project(L(LM.subnasale), brow, u));
  const t1 = Math.min(t1Raw, 1.5 * ((t2 + t3) / 2));
  const thirdsVariation = coefficientOfVariation([t1, t2, t3]);
  const thirds = closenessExp(thirdsVariation, SCALE.thirds);
  const lowerThirdShare = t1 + t2 + t3 > 0 ? t3 / (t1 + t2 + t3) : 1 / 3;

  /* --- 3. Facial fifths -------------------------------------------- */
  const fifthPoints = [
    L(LM.faceEdgeRight),
    L(LM.eyeRightOuter),
    L(LM.eyeRightInner),
    L(LM.eyeLeftInner),
    L(LM.eyeLeftOuter),
    L(LM.faceEdgeLeft),
  ];
  const projected = fifthPoints.map((p) => project(p, brow, h));
  const fifthsSegments = projected.slice(1).map((v, i) => Math.abs(v - projected[i]));
  const fifthsVariation = coefficientOfVariation(fifthsSegments);
  const fifths = closenessExp(fifthsVariation, SCALE.fifths);

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
  // A gently positive tilt reads as the most harmonious; ±12° is the tolerance.
  const canthalTilt = closenessExp(canthalTiltDeg - SCALE.tiltCentre, SCALE.tilt);

  /* --- 5. FWHR ----------------------------------------------------- */
  const upperFaceHeight = dist(L(LM.nasion), L(LM.upperLip));
  const fwhrValue = upperFaceHeight > 0 ? faceWidth / upperFaceHeight : 0;
  const fwhr = closenessExp(fwhrValue - SCALE.fwhrCentre, SCALE.fwhr);

  /* --- 6. Midface ratio -------------------------------------------- */
  const pupilMid = midpoint(L(LM.irisRight), L(LM.irisLeft));
  const interpupillary = dist(L(LM.irisRight), L(LM.irisLeft));
  const midfaceHeight = dist(pupilMid, L(LM.upperLip));
  const midfaceValue = midfaceHeight > 0 ? interpupillary / midfaceHeight : 0;
  const midface = closenessExp(midfaceValue - SCALE.midfaceCentre, SCALE.midface);

  /* --- 7. Golden-ratio proximity ----------------------------------- */
  // Four classic canons, each scored on its own tolerance, then averaged. No
  // single ratio decides the score, which is what keeps this stable across
  // different face shapes.
  const mouthWidth = dist(L(LM.mouthRight), L(LM.mouthLeft));
  const noseWidth = dist(L(LM.alaRight), L(LM.alaLeft));
  const intercanthal = dist(L(LM.eyeRightInner), L(LM.eyeLeftInner));
  const eyeWidth =
    (dist(L(LM.eyeRightOuter), L(LM.eyeRightInner)) +
      dist(L(LM.eyeLeftOuter), L(LM.eyeLeftInner))) /
    2;

  const mouthNoseRatio = noseWidth > 0 ? mouthWidth / noseWidth : 0;
  const intercanthalNoseRatio = noseWidth > 0 ? intercanthal / noseWidth : 0;
  const eyeIntercanthalRatio = intercanthal > 0 ? eyeWidth / intercanthal : 0;
  const faceAspectRatio = faceWidth > 0 ? faceHeight / faceWidth : 0;

  const goldenParts = [
    closenessExp(faceAspectRatio - 1.62, SCALE.goldenAspect),
    closenessExp(mouthNoseRatio - 1.618, SCALE.goldenMouthNose),
    closenessExp(intercanthalNoseRatio - 1.0, SCALE.goldenIntercanthal),
    closenessExp(eyeIntercanthalRatio - 1.0, SCALE.goldenEye),
  ];
  const goldenValue = mean(goldenParts);
  const goldenRatio = clamp01(goldenValue);

  /* --- 8. Bone structure (definition) ------------------------------ */
  // Three measurements that a frontal photo genuinely supports:
  //   • bigonial width relative to bizygomatic width — jaw breadth
  //   • the interior angle at the gonion — how sharply the jaw turns
  //   • chin height relative to total face height
  // Brow-ridge projection is depth, not width, and a 2D landmark set cannot
  // read it honestly — so it is deliberately not scored here.
  const jawWidth = dist(L(LM.jawRight), L(LM.jawLeft));
  const jawRatio = faceWidth > 0 ? jawWidth / faceWidth : 0;
  const chinRatio = faceHeight > 0 ? dist(L(LM.subnasale), chin) / faceHeight : 0;
  const gonialAngleDeg = angleAt(L(LM.faceEdgeRight), L(LM.jawRight), chin);

  // The V of the lower face, straight from the canonical proportion diagram:
  // the interior angle at the chin between the two jaw lines. A sharper V is a
  // more tapered, more defined jaw.
  const jawVAngleDeg = angleAt(L(LM.jawRight), chin, L(LM.jawLeft));

  const definition = clamp01(
    0.4 * closenessExp(jawRatio - 0.8, SCALE.jaw) +
      0.25 * closenessExp(gonialAngleDeg - SCALE.gonialCentre, SCALE.gonial) +
      0.2 * closenessExp(jawVAngleDeg - SCALE.jawVCentre, SCALE.jawV) +
      0.15 * closenessExp(chinRatio - 0.33, SCALE.chin)
  );

  /* --- 9. Nose asymmetry ------------------------------------------- */
  // Global symmetry averages twenty landmark pairs, so a crooked nose barely
  // moves it. This measures the nose on its own: how far the nasal axis (nasion,
  // bridge, tip, subnasale) drifts from the brow→chin midline, plus how unevenly
  // the two alae sit either side of it.
  const noseDrift = mean(
    [LM.nasion, LM.noseBridge, LM.noseTip, LM.subnasale].map((i) =>
      perpDistance(L(i), brow, chin)
    )
  );
  const noseAxisDeviation = faceWidth > 0 ? noseDrift / faceWidth : 0;
  const alarAsymmetry =
    faceWidth > 0
      ? Math.abs(perpDistance(L(LM.alaRight), brow, chin) - perpDistance(L(LM.alaLeft), brow, chin)) /
        faceWidth
      : 0;
  const nose = closenessExp(
    0.65 * noseAxisDeviation + 0.35 * alarAsymmetry,
    SCALE.nose
  );

  /* --- 10. Presentation (hair + grooming) --------------------------- */
  // These come from the pixels, not the landmarks, so they describe how the face
  // is *presented* in this photograph — hairline coverage, brow definition,
  // evenness of facial hair, lip line. They are the weakest signals in the
  // model and carry the smallest weight for that reason.
  const presentation = clamp01(
    0.35 * closenessExp((skin.hairCoverage ?? 0) - SCALE.hairCentre, SCALE.hair) +
      0.25 * closenessExp((skin.browDefinition ?? 0) - SCALE.browCentre, SCALE.brow) +
      0.25 * closenessExp((skin.facialHair ?? 0) - SCALE.beardCentre, SCALE.beard) +
      0.15 * closenessExp((skin.lipDefinition ?? 0) - SCALE.lipCentre, SCALE.lip)
  );

  /* --- 9. Skin quality --------------------------------------------- */
  const skinScore = clamp01(
    0.55 * closenessExp(skin.variance, SCALE.skinEvenness) +
      0.45 * closenessExp(skin.luminance - 0.6, SCALE.skinExposure)
  );

  return {
    metrics: {
      symmetry,
      thirds,
      fifths,
      canthalTilt,
      fwhr,
      midface,
      goldenRatio,
      definition,
      nose,
      presentation,
      skin: skinScore,
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
      gonialAngleDeg,
      mouthNoseRatio,
      intercanthalNoseRatio,
      eyeIntercanthalRatio,
      faceAspectRatio,
      goldenValue,
      noseAxisDeviation,
      alarAsymmetry,
      jawVAngleDeg,
      hairCoverage: skin.hairCoverage ?? 0,
      browDefinition: skin.browDefinition ?? 0,
      facialHair: skin.facialHair ?? 0,
      lipDefinition: skin.lipDefinition ?? 0,
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

/** Score10 = Σ(metric × weight) × 10 across the nine scored metrics. */
export function scoreFromMetrics(metrics: MetricSet, raw: RawMeasurements): ScoreBundle {
  const keys = Object.keys(METRIC_WEIGHTS) as MetricKey[];
  const values = keys.map((key) => clamp01(metrics[key] ?? 0));

  const weighted = keys.reduce((sum, key, i) => sum + values[i] * METRIC_WEIGHTS[key], 0);

  // A plain weighted mean hides a weak feature: five metrics at 0.95 and four at
  // 0.45 still average to 0.72, which is why a face with obvious problems could
  // read like a model. Two corrections:
  //
  //  1. Blend in the weighted harmonic mean, which is pulled toward the low end
  //     instead of letting strong metrics carry weak ones.
  //  2. Apply a "failo" factor — a face is limited by its worst feature, so a
  //     metric well below the pack drags the whole read down.
  const harmonic =
    1 / keys.reduce((sum, key, i) => sum + METRIC_WEIGHTS[key] / Math.max(values[i], 0.04), 0);
  const blended = 0.7 * weighted + 0.3 * harmonic;

  const weakest = Math.min(...values);
  const failoFactor = 0.72 + 0.28 * Math.min(1, weakest / 0.4);

  const overall = clamp(blended * failoFactor * 10, 0, 10);
  const psl = toPsl(overall);

  // Potential: what a consistent routine could add. Skin evenness, lighting and
  // definition are the three levers a person actually controls, so the uplift is
  // capped at 1.5 points and scaled by how much headroom each lever has.
  const skin = clamp01(metrics.skin ?? 0);
  const lighting = closeness2(raw.skinLuminance - 0.6, 0.34);
  const definition = clamp01(metrics.definition ?? 0);
  const uplift = clamp(
    1.5 * (0.45 * (1 - skin) + 0.3 * (1 - lighting) + 0.25 * (1 - definition)),
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
/* Derived card scores                                                 */
/* ------------------------------------------------------------------ */

/** Eye area = canthal tilt + intercanthal spacing + eyelid aperture. */
export function eyeAreaScore(metrics: MetricSet, raw: RawMeasurements) {
  return clamp01(
    0.5 * metrics.canthalTilt +
      0.3 * closeness2(raw.intercanthalNoseRatio - 1.0, 0.35) +
      0.2 * metrics.fifths
  );
}

/** Jawline = gonial width relative to bizygomatic width. Geometry only. */
export function jawlineScore(raw: RawMeasurements) {
  return closeness2(raw.jawRatio - 0.8, 0.16);
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
  bundle: ScoreBundle
): BreakdownCard[] {
  const pct = (v: number) => Math.round(clamp01(v) * 100);

  const symmetry = pct(metrics.symmetry);
  const eye = pct(eyeAreaScore(metrics, raw));
  const midface = pct(metrics.midface);
  const jaw = pct(jawlineScore(raw));
  const bone = pct(metrics.definition);
  const golden = pct(metrics.goldenRatio);
  const skin = pct(metrics.skin);
  const nose = pct(metrics.nose);
  const presentation = pct(metrics.presentation);
  const harmony = pct(
    (metrics.symmetry + metrics.thirds + metrics.fifths + metrics.goldenRatio + metrics.nose) / 5
  );
  const lowerThird = pct(
    0.65 * closeness2(raw.lowerThirdShare - 1 / 3, 0.11) +
      0.35 * closeness2(raw.chinRatio - 0.36, 0.12)
  );

  return [
    {
      key: "overall",
      label: "Overall",
      score: Math.round(bundle.overall * 10),
      blurb: copy(
        {
          high: "A cohesive, well-proportioned face with strong structure.",
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
      key: "boneStructure",
      label: "Bone Structure",
      score: bone,
      blurb: copy(
        {
          high: "Broad jaw, sharp gonial angle, proportionate chin — a strong frame.",
          mid: "Solid underlying structure with some softness at the jaw.",
          low: "A softer frame: the jaw is narrow relative to the cheekbones.",
        },
        bone
      ),
      tip: "Body composition and posture change how much of this structure reads in a photo.",
    },
    {
      key: "goldenRatio",
      label: "Golden Ratio",
      score: golden,
      blurb: copy(
        {
          high: "Face length, mouth-to-nose and eye spacing all sit near the canons.",
          mid: "Most canons are close; one dimension runs long or short.",
          low: "Several classic ratios sit outside their reference band.",
        },
        golden
      ),
      tip: "Focal length matters here — a 2× lens from a step back reads truest.",
    },
    {
      key: "nose",
      label: "Nose",
      score: nose,
      blurb: copy(
        {
          high: "The nasal axis sits on the midline and the alae balance either side.",
          mid: "A slight drift off the midline — common, and usually invisible in real life.",
          low: "The nose reads off-centre relative to the rest of the face.",
        },
        nose
      ),
      tip: "Shoot dead-on: a few degrees of head turn fakes nasal drift in any 2D photo.",
    },
    {
      key: "presentation",
      label: "Hair & Grooming",
      score: presentation,
      blurb: copy(
        {
          high: "Hairline coverage, brow definition and facial hair all read deliberate.",
          mid: "Mostly tidy, with one area the camera catches as unfinished.",
          low: "Hair or facial hair is reading uneven in this frame.",
        },
        presentation
      ),
      tip: "A clean hairline and an even beard line are the two fastest changes available.",
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
          high: "Proportions and canons agree — no feature pulls out of the frame.",
          mid: "A coherent face with one proportion pulling slightly.",
          low: "The big proportions disagree — usually a lens or angle artefact.",
        },
        harmony
      ),
      tip: "Shoot at 2× zoom from a step back. Wide lenses distort harmony the most.",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Explanation                                                         */
/* ------------------------------------------------------------------ */

export type MetricExplanation = {
  key: MetricKey;
  label: string;
  /** The measured value, in its own units. */
  value: number;
  /** What the ideal value would be, in the same units. */
  ideal: number;
  /** value - ideal, in the same units. */
  deviation: number;
  /** The tolerance this deviation is judged against. */
  tolerance: number;
  /** deviation / tolerance — how much of the budget was used. */
  ratio: number;
  /** 0..1 after the closeness curve. */
  score: number;
  unit: "ratio" | "percent" | "degrees";
};

/**
 * Every metric with the numbers behind it, for the diagnostics panel.
 *
 * This exists so calibration can be done from real measurements instead of
 * guesswork: if a model and an average face both land near 4, the panel shows
 * which metric is pinned and by how much.
 */
export function explain(metrics: MetricSet, raw: RawMeasurements): MetricExplanation[] {
  const row = (
    key: MetricKey,
    label: string,
    value: number,
    ideal: number,
    tolerance: number,
    unit: MetricExplanation["unit"]
  ): MetricExplanation => {
    const deviation = value - ideal;
    return {
      key,
      label,
      value,
      ideal,
      deviation,
      tolerance,
      ratio: tolerance === 0 ? 0 : Math.abs(deviation) / tolerance,
      score: clamp01(metrics[key] ?? 0),
      unit,
    };
  };

  return [
    row("symmetry", "Symmetry", raw.symmetryMiss, 0, SCALE.symmetry, "percent"),
    row("thirds", "Facial thirds", raw.thirdsVariation, 0, SCALE.thirds, "percent"),
    row("fifths", "Facial fifths", raw.fifthsVariation, 0, SCALE.fifths, "percent"),
    row("canthalTilt", "Canthal tilt", raw.canthalTiltDeg, SCALE.tiltCentre, SCALE.tilt, "degrees"),
    row("fwhr", "Width ÷ height", raw.fwhrValue, SCALE.fwhrCentre, SCALE.fwhr, "ratio"),
    row("midface", "Midface", raw.midfaceValue, SCALE.midfaceCentre, SCALE.midface, "ratio"),
    row("goldenRatio", "Golden ratio", raw.goldenValue, 1, 1, "ratio"),
    row("definition", "Bone structure", raw.jawRatio, 0.8, SCALE.jaw, "ratio"),
    row("nose", "Nose axis", raw.noseAxisDeviation, 0, SCALE.nose, "percent"),
    row("presentation", "Hair & grooming", raw.hairCoverage, SCALE.hairCentre, SCALE.hair, "ratio"),
    row("skin", "Skin evenness", raw.skinVariance, 0, SCALE.skinEvenness, "percent"),
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
  const breakdown = buildBreakdown(geometry.metrics, geometry.raw, bundle);
  return { ...geometry, ...bundle, breakdown };
}
