/**
 * Aureline — shared types.
 *
 * Everything here is plain JSON-serialisable data: Aureline never sends a photo
 * anywhere, and only numbers + short strings are ever written to storage.
 */

export type Point = { x: number; y: number; z: number };

/** A landmark converted from normalised space into image pixels. */
export type Pixel = { x: number; y: number };

/** Every ratio Aureline measures, each normalised to 0..1 by a closeness curve. */
export type MetricKey =
  | "symmetry"
  | "thirds"
  | "fifths"
  | "canthalTilt"
  | "fwhr"
  | "midface"
  | "goldenRatio"
  | "definition"
  | "nose"
  | "presentation"
  | "skin";

export type MetricSet = Record<MetricKey, number>;

/** Raw geometric measurements, kept so the result screen can explain itself. */
export type RawMeasurements = {
  faceWidth: number;
  faceHeight: number;
  interpupillary: number;
  /** Degrees. Positive = outer eye corner sits higher than inner corner. */
  canthalTiltDeg: number;
  /** Degrees of head roll detected from the brow→chin midline. */
  headRollDeg: number;
  /** Normalised asymmetry miss distance (fraction of face width). */
  symmetryMiss: number;
  /** Coefficient of variation across the three facial thirds. */
  thirdsVariation: number;
  /** Coefficient of variation across the five facial fifths. */
  fifthsVariation: number;
  fwhrValue: number;
  midfaceValue: number;
  /** Bigonial width ÷ bizygomatic width. */
  jawRatio: number;
  /** Chin height ÷ total face height. */
  chinRatio: number;
  /** Share of the vertical face height taken by the lower third (0..1). */
  lowerThirdShare: number;
  /** Interior angle at the gonion, in degrees. Sharper = more angular jaw. */
  gonialAngleDeg: number;
  /** Mouth width ÷ nose width. */
  mouthNoseRatio: number;
  /** Intercanthal distance ÷ nose width. */
  intercanthalNoseRatio: number;
  /** Eye width ÷ intercanthal distance. */
  eyeIntercanthalRatio: number;
  /** Face height ÷ face width. */
  faceAspectRatio: number;
  /** Mean of the four golden-ratio closeness scores, 0..1. */
  goldenValue: number;
  /** Mean perpendicular drift of the nose axis from the facial midline, ÷ face width. */
  noseAxisDeviation: number;
  /** Left/right difference in alar distance from the midline, ÷ face width. */
  alarAsymmetry: number;
  /** Interior angle at the chin between the two jaw lines — the V of the lower face. */
  jawVAngleDeg: number;
  /** 0..1 — how much of the hairline band reads as hair rather than skin. */
  hairCoverage: number;
  /** 0..1 — edge contrast in the brow band. */
  browDefinition: number;
  /** 0..1 — evenness of the beard/jaw shadow region. */
  facialHair: number;
  /** 0..1 — contrast of the lip line against surrounding skin. */
  lipDefinition: number;
  /** Mean luminance of the sampled skin patch, 0..1. */
  skinLuminance: number;
  /** Local variance of the sampled skin patch (lower = more even). */
  skinVariance: number;
};

/** The ten cards shown in the detailed breakdown. */
export type BreakdownKey =
  | "overall"
  | "symmetry"
  | "eyeArea"
  | "midface"
  | "lowerThird"
  | "jawline"
  | "boneStructure"
  | "goldenRatio"
  | "nose"
  | "presentation"
  | "skinQuality"
  | "harmony";

export type BreakdownCard = {
  key: BreakdownKey;
  label: string;
  score: number; // 0..100
  blurb: string;
  tip: string;
};

export type Tier = {
  label: string;
  short: string;
  /** Tailwind-ish token used by the UI. */
  tone: "developing" | "low" | "mid" | "above" | "high" | "elite" | "top";
};

export type QualityIssue = {
  code: "no-face" | "too-small" | "turned" | "tilted" | "too-dark" | "too-bright" | "blurry";
  reason: string;
  fix: string;
};

export type QualityReport = {
  ok: boolean;
  faceSize: number;
  yaw: number;
  roll: number;
  brightness: number;
  sharpness: number;
  issue?: QualityIssue;
};

/** What we hand to /result via sessionStorage (photo lives in memory only). */
export type ScanSession = {
  id: string;
  createdAt: number;
  /** data: URL of the photo — session-only, never persisted to disk or network. */
  photo: string;
  imageWidth: number;
  imageHeight: number;
  overall: number; // Score10, 0..10
  potential: number; // Score10 scale, 0..10
  psl: number; // 1..8
  potentialPsl: number;
  tier: Tier;
  potentialTier: Tier;
  metrics: MetricSet;
  raw: RawMeasurements;
  breakdown: BreakdownCard[];
  /** Landmarks already converted to pixels, so /result can draw the overlay. */
  landmarks: Pixel[];
};

/** The only shape ever written to localStorage["aureline_history"]. */
export type HistoryEntry = {
  id: string;
  date: number;
  overall: number;
  potential: number;
  psl: number;
  metrics: MetricSet;
};

export type RoutineTask = {
  id: string;
  label: string;
  hint: string;
};

export type RoutineSection = {
  id: string;
  title: string;
  caption: string;
  tasks: RoutineTask[];
};

export type RoutineState = {
  /** `${dateKey}:${taskId}` */
  done: Record<string, boolean>;
  /** ISO date keys (YYYY-MM-DD) on which every task was completed. */
  streakDates: string[];
  lastOpened: string;
};

export type Profile = {
  name: string;
  goal: "presence" | "skin" | "definition" | "confidence" | "";
};
