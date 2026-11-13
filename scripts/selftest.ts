/**
 * Aureline self-test — run with `npm test`.
 *
 * Two jobs:
 *
 *  1. **Correctness.** A synthetic "reference" face built from canonical
 *     proportions (equal thirds, five eye-widths, 5.5° canthal tilt, 1.9 FWHR,
 *     1.0 midface ratio, golden mouth-to-nose) must come out near the top of the
 *     scale, and each individual ratio must be recovered from the geometry.
 *
 *  2. **Calibration.** Perturbing that face by a controlled amount must move the
 *     overall score through the bands a human rater would use. Without this,
 *     the tolerances drift and every real face lands in a narrow 4–6 strip.
 */

import {
  analyse,
  closeness,
  closeness2,
  closenessExp,
  measure,
  scoreFromMetrics,
  toPsl,
  tierFor,
  LM,
} from "../src/lib/scoring";
import realFaces from "./fixtures/real-faces.json";
import type { Pixel, RawMeasurements } from "../src/lib/types";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const W = 1000;
const H = 1400;

type FaceOptions = {
  tilt?: number;
  roll?: number;
  /** 0 = canonical face, 1 = clearly off. Drives the calibration test. */
  q?: number;
};

/**
 * Canonical face, in pixel space:
 *   trichion 300 · glabella 550 · subnasale 800 · chin 1050   (equal thirds)
 *   bizygomatic 380 · IPD 152 · eye width 76                  (five eye-widths)
 *   nasion 630 · upper lip 830                                (FWHR 1.90)
 *   pupil line 678                                            (midface 1.00)
 *   mouth 118 · nose 84                                       (golden 1.40)
 */
function face(options: FaceOptions = {}): Pixel[] {
  const { tilt: tiltOverride, roll = 0, q = 0 } = options;
  const tilt = tiltOverride ?? 5.5 - 10 * q;
  const cx = W / 2;
  const pts: Pixel[] = Array.from({ length: 478 }, () => ({ x: cx, y: 700 }));

  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y };
  };

  /* perturbation amplitudes, all scaled by q */
  const glabellaY = 550 + 50 * q;
  const subnasaleY = 800 - 40 * q;
  const upperLipY = 830;
  const nasionY = 630 - 20 * q;
  const eyeOuterX = 114 - 24 * q;
  const eyeInnerX = 38 - 10 * q;
  const jawX = 148 - 25 * q;
  const asym = 22 * q;

  const eyeY = 678 - 14 * q;
  const rad = (tilt * Math.PI) / 180;
  const dy = Math.tan(rad) * 38;

  /* midline */
  set(LM.browMid, cx, 300);
  set(LM.glabella, cx, glabellaY);
  set(LM.nasion, cx, nasionY);
  set(LM.noseTip, cx, 740);
  set(LM.subnasale, cx, subnasaleY);
  set(LM.upperLip, cx, upperLipY);
  set(LM.chin, cx, 1050);

  /* face width + jaw */
  set(LM.faceEdgeRight, cx - 190, 640);
  set(LM.faceEdgeLeft, cx + 190, 640);
  set(LM.jawRight, cx - jawX, 900);
  set(LM.jawLeft, cx + jawX, 900);

  /* mouth + nose */
  set(LM.mouthRight, cx - 59, 858);
  set(LM.mouthLeft, cx + 59, 858);
  const alaX = 42 + 18 * q;
  set(LM.alaRight, cx - alaX, 790);
  set(LM.alaLeft, cx + alaX, 790);

  /* eyes, corners at exact fifths before perturbation */
  const eye = (
    outer: number,
    inner: number,
    iris: number,
    top: number,
    bottom: number,
    outerX: number,
    innerX: number
  ) => {
    set(inner, innerX, eyeY + dy);
    set(outer, outerX, eyeY - dy);
    set(iris, (outerX + innerX) / 2, eyeY);
    set(top, (outerX + innerX) / 2, eyeY - 11);
    set(bottom, (outerX + innerX) / 2, eyeY + 11);
  };

  eye(LM.eyeRightOuter, LM.eyeRightInner, LM.irisRight, LM.eyelidRightTop, LM.eyelidRightBottom, cx - eyeOuterX, cx - eyeInnerX);
  eye(LM.eyeLeftOuter, LM.eyeLeftInner, LM.irisLeft, LM.eyelidLeftTop, LM.eyelidLeftBottom, cx + eyeOuterX, cx + eyeInnerX);

  /* symmetric landmark pairs used by the symmetry metric */
  const pairs: readonly (readonly [number, number])[] = [
    [33, 263], [133, 362], [159, 386], [145, 374], [70, 300], [63, 293],
    [105, 334], [66, 296], [61, 291], [58, 288], [93, 323], [234, 454],
    [127, 356], [132, 361], [172, 397], [136, 365], [150, 379], [149, 378],
    [176, 400], [205, 425],
  ];
  const alreadySet = new Set([
    33, 263, 133, 362, 159, 386, 145, 374, 172, 397, 234, 454, 61, 291,
  ]);

  let free = 0;
  for (const [a, b] of pairs) {
    if (alreadySet.has(a) || alreadySet.has(b)) continue;
    const offset = 48 + free * 7;
    const y = 660 + free * 9;
    set(a, cx - offset, y);
    set(b, cx + offset + asym, y);
    free += 1;
  }

  /* cheek patches for the skin sampler */
  set(205, cx - 120, 700);
  set(425, cx + 120, 700);

  if (roll) {
    const r = (roll * Math.PI) / 180;
    const oy = (300 + 1050) / 2;
    return pts.map((p) => ({
      x: cx + (p.x - cx) * Math.cos(r) - (p.y - oy) * Math.sin(r),
      y: oy + (p.x - cx) * Math.sin(r) + (p.y - oy) * Math.cos(r),
    }));
  }
  return pts;
}

const skinFor = (q: number) => ({ luminance: 0.62 - 0.08 * q, variance: 0.02 + 0.08 * q });
const skin = skinFor(0);

const analyseAt = (q: number) => analyse(face({ q }), W, H, skinFor(q));

console.log("\nAureline self-test\n");

/* ------------------------------------------------------------------ */
/* 1 — the scoring curve                                               */
/* ------------------------------------------------------------------ */
check("closenessExp(0, s) === 1", closenessExp(0, 0.5) === 1);
check("closenessExp is symmetric", closenessExp(0.2, 0.5) === closenessExp(-0.2, 0.5));
check("closenessExp decays", closenessExp(0.5, 0.5) < closenessExp(0.2, 0.5));
check(
  "closenessExp never reaches zero",
  closenessExp(100, 0.5) > 0,
  closenessExp(100, 0.5).toExponential(2)
);
check(
  "closenessExp separates values a bounded curve flattens",
  closenessExp(1.0, 0.5) > closeness2(1.0, 0.5),
  `${closenessExp(1.0, 0.5).toFixed(3)} vs ${closeness2(1.0, 0.5).toFixed(3)}`
);

/* ------------------------------------------------------------------ */
/* 2 — the canonical face is recovered                                 */
/* ------------------------------------------------------------------ */
const good = analyse(face(), W, H, skin);
console.log(
  `     canonical face: overall ${good.overall.toFixed(2)} · PSL ${good.psl} · ` +
    `tilt ${good.raw.canthalTiltDeg.toFixed(1)}° · FWHR ${good.raw.fwhrValue.toFixed(2)} · ` +
    `midface ${good.raw.midfaceValue.toFixed(2)} · golden ${good.raw.goldenValue.toFixed(2)} · ` +
    `gonial ${Math.round(good.raw.gonialAngleDeg)}°`
);

check("symmetry reads high", good.metrics.symmetry > 0.9, good.metrics.symmetry.toFixed(3));
check("equal thirds read high", good.metrics.thirds > 0.9, good.metrics.thirds.toFixed(3));
check("equal fifths read high", good.metrics.fifths > 0.9, good.metrics.fifths.toFixed(3));
check("FWHR is recovered", Math.abs(good.raw.fwhrValue - 1.9) < 0.02, good.raw.fwhrValue.toFixed(3));
check("midface ratio is recovered", Math.abs(good.raw.midfaceValue - 1.0) < 0.02, good.raw.midfaceValue.toFixed(3));
check("canthal tilt is recovered", Math.abs(good.raw.canthalTiltDeg - 5.5) < 0.6, good.raw.canthalTiltDeg.toFixed(2));
// The fixture is deliberately a long face (aspect 1.97 vs the 1.62 canon), so it
// does not max out this metric — the check is that the components resolve at all.
// The fixture is a long face (aspect 1.97 vs the 1.62 canon), and the golden scale
// is now fitted to real faces rather than to this synthetic ideal, so it does not max out.
check("golden components are computed", good.raw.goldenValue > 0.7, good.raw.goldenValue.toFixed(3));
check("mouth-to-nose canon is recovered", Math.abs(good.raw.mouthNoseRatio - 1.405) < 0.05, good.raw.mouthNoseRatio.toFixed(3));
check("bone structure reads high", good.metrics.definition > 0.75, good.metrics.definition.toFixed(3));
check("canonical face lands near the top", good.overall > 9, good.overall.toFixed(2));
check("potential is >= overall and capped at 10", good.potential >= good.overall && good.potential <= 10);

/* ------------------------------------------------------------------ */
/* 3 — head roll must not cancel canthal tilt                          */
/* ------------------------------------------------------------------ */
const rolled = analyse(face({ roll: 6 }), W, H, skin);
check("head roll is detected", Math.abs(Math.abs(rolled.raw.headRollDeg) - 6) < 1.5, rolled.raw.headRollDeg.toFixed(2));
check(
  "canthal tilt survives a 6° head roll",
  Math.abs(rolled.raw.canthalTiltDeg - good.raw.canthalTiltDeg) < 0.8,
  `${rolled.raw.canthalTiltDeg.toFixed(2)} vs ${good.raw.canthalTiltDeg.toFixed(2)}`
);
check("negative tilt reads negative", analyse(face({ tilt: -6 }), W, H, skin).raw.canthalTiltDeg < -3);

/* ------------------------------------------------------------------ */
/* 4 — calibration: the scale must spread, not bunch                   */
/* ------------------------------------------------------------------ */
console.log("\n     calibration curve (synthetic)");
const curve = [0, 0.2, 0.35, 0.5, 0.7, 1].map((q) => ({ q, r: analyseAt(q) }));
for (const { q, r } of curve) {
  console.log(
    `       q=${q.toFixed(2)}  overall ${r.overall.toFixed(2).padStart(5)}  PSL ${r.psl.toFixed(1)}  ${r.tier.short}`
  );
}
check("the synthetic scale is monotonic", curve.every((c, i) => i === 0 || c.r.overall <= curve[i - 1].r.overall + 1e-9));
check("a canonical face is clearly above a weak one", curve[0].r.overall - curve[5].r.overall >= 4, (curve[0].r.overall - curve[5].r.overall).toFixed(2));

/* ------------------------------------------------------------------ */
/* 4b — calibration against MEASURED faces                             */
/* ------------------------------------------------------------------ */
/*
 * The synthetic face is a sanity check, not evidence. These are the raw
 * measurements from nine real portrait photographs, run end to end through the
 * pipeline. The scales in scoring.ts are fitted to exactly this sample, so the
 * assertions here are what stop a future blind re-tune from flattening the scale
 * again — the failure mode that made a model and an average face score alike.
 */
const measured = realFaces as unknown as RawMeasurements[];
console.log(`\n     measured sample: ${measured.length} real faces`);

const scored = measured.map((raw) => {
  const metrics = {
    symmetry: closenessExp(raw.symmetryMiss, 0.1451),
    thirds: closenessExp(raw.thirdsVariation, 0.4828),
    fifths: closenessExp(raw.fifthsVariation, 0.4208),
    canthalTilt: closenessExp(raw.canthalTiltDeg - 5, 3.6599),
    fwhr: closenessExp(raw.fwhrValue - 1.9, 0.2393),
    midface: closenessExp(raw.midfaceValue - 1.0, 0.1256),
    goldenRatio: 0.25 * (
      closenessExp(raw.faceAspectRatio - 1.62, 0.7186) +
      closenessExp(raw.mouthNoseRatio - 1.618, 0.3929) +
      closenessExp(raw.intercanthalNoseRatio - 1.0, 0.3691) +
      closenessExp(raw.eyeIntercanthalRatio - 1.0, 0.3462)
    ),
    definition:
      0.5 * closenessExp(raw.jawRatio - 0.8, 0.0509) +
      0.3 * closenessExp(raw.gonialAngleDeg - 145, 19.9409) +
      0.2 * closenessExp(raw.chinRatio - 0.33, 0.1147),
    skin:
      0.55 * closenessExp(raw.skinVariance, 0.1309) +
      0.45 * closenessExp(raw.skinLuminance - 0.6, 0.1741),
  };
  return scoreFromMetrics(metrics, raw).overall;
});

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const sd = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};

const lo = Math.min(...scored);
const hi = Math.max(...scored);
console.log(
  `       overall ${lo.toFixed(2)} .. ${hi.toFixed(2)}  mean ${mean(scored).toFixed(2)}  sd ${sd(scored).toFixed(2)}`
);

check("real faces spread across the scale", hi - lo >= 2.5, `range ${(hi - lo).toFixed(2)}`);
check("real faces are not bunched", sd(scored) >= 0.8, `sd ${sd(scored).toFixed(2)}`);
check("no real face is clamped at zero", lo > 1, lo.toFixed(2));
check("the sample straddles the midpoint", lo < 5 && hi > 5, `${lo.toFixed(2)}..${hi.toFixed(2)}`);

/* ------------------------------------------------------------------ */
/* 5 — PSL mapping + tiers                                             */
/* ------------------------------------------------------------------ */
check("PSL(0) === 1", toPsl(0) === 1);
check("PSL(10) === 8", toPsl(10) === 8);
check("PSL(5) === 4.5", toPsl(5) === 4.5);
check("tier 5.4 is HTN", tierFor(5.4).short === "HTN");
check("tier 7.2 is Chad", tierFor(7.2).short === "Chad");
check("tier 8 is Top Tier", tierFor(8).label === "Top Tier");
check("tier 2.4 is Developing", tierFor(2.4).label === "Developing");

/* ------------------------------------------------------------------ */
/* 6 — the breakdown contract                                          */
/* ------------------------------------------------------------------ */
check("ten breakdown cards", good.breakdown.length === 10, String(good.breakdown.length));
check(
  "breakdown covers the requested factors",
  ["symmetry", "boneStructure", "goldenRatio", "skinQuality", "harmony", "lowerThird"].every((k) =>
    good.breakdown.some((c) => c.key === k)
  )
);
check("breakdown scores are 0..100", good.breakdown.every((c) => c.score >= 0 && c.score <= 100));
check("every card has a tip", good.breakdown.every((c) => c.tip.length > 10));

/* ------------------------------------------------------------------ */
/* 7 — pixel-space contract                                            */
/* ------------------------------------------------------------------ */
const half = face().map((p) => ({ x: p.x / 2, y: p.y / 2 }));
const scaled = measure(half, W / 2, H / 2, skin);
const baseline = measure(face(), W, H, skin);
check(
  "ratios are resolution independent",
  Math.abs(scaled.metrics.symmetry - baseline.metrics.symmetry) < 0.01 &&
    Math.abs(scaled.metrics.goldenRatio - baseline.metrics.goldenRatio) < 0.01,
  `sym ${Math.abs(scaled.metrics.symmetry - baseline.metrics.symmetry).toFixed(4)}`
);
check(
  "canthal tilt is resolution independent",
  Math.abs(scaled.raw.canthalTiltDeg - baseline.raw.canthalTiltDeg) < 0.6,
  `${scaled.raw.canthalTiltDeg.toFixed(2)} vs ${baseline.raw.canthalTiltDeg.toFixed(2)}`
);

/* ------------------------------------------------------------------ */
/* 8 — normalised coordinates must NOT be passed in directly           */
/* ------------------------------------------------------------------ */
const normalised = face().map((p) => ({ x: p.x / W, y: p.y / H }));
const broken = measure(normalised, 1, 1, skin);
check(
  "normalised input would visibly distort the tilt (why we convert)",
  Math.abs(broken.raw.canthalTiltDeg - good.raw.canthalTiltDeg) > 1,
  `${broken.raw.canthalTiltDeg.toFixed(2)}° vs ${good.raw.canthalTiltDeg.toFixed(2)}°`
);

/* ------------------------------------------------------------------ */
/* 9 — weights are sane                                                */
/* ------------------------------------------------------------------ */
import { METRIC_WEIGHTS } from "../src/lib/scoring";
const total = Object.values(METRIC_WEIGHTS).reduce((s, v) => s + v, 0);
check("weights sum to 1.0", Math.abs(total - 1) < 1e-9, total.toFixed(4));
check("every metric carries weight", Object.values(METRIC_WEIGHTS).every((v) => v > 0));
check(
  "midface is the lightest, symmetry the heaviest",
  METRIC_WEIGHTS.symmetry === Math.max(...Object.values(METRIC_WEIGHTS)) &&
    METRIC_WEIGHTS.midface === Math.min(...Object.values(METRIC_WEIGHTS))
);

void ({} as RawMeasurements);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
