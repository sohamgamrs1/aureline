/**
 * Aureline self-test — run with `npm test`.
 *
 * Builds a synthetic "reference" face from canonical proportions (equal thirds,
 * five eye-widths, 5.5° canthal tilt, 1.9 FWHR, 1.0 midface ratio), feeds it
 * through the exact measure()/scoreFromMetrics() path the browser uses, and
 * asserts the numbers land where they should.
 *
 * This catches landmark-index mistakes, coordinate-space mistakes and the
 * canthal-tilt / head-roll interaction without needing a photo or a browser.
 */

import { analyse, closeness, measure, toPsl, tierFor, LM } from "../src/lib/scoring";
import type { Pixel } from "../src/lib/types";

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

/**
 * A face built to spec, in pixel space:
 *   trichion 300 · glabella 550 · subnasale 800 · chin 1050   (equal thirds)
 *   bizygomatic width 380 · IPD 152 · eye width 76            (five eye-widths)
 *   nasion 630 · upper lip 830                                (FWHR 1.90)
 *   pupil line 678                                            (midface ratio 1.00)
 */
function referenceFace(opts: { tilt?: number; roll?: number; asym?: number } = {}): Pixel[] {
  const { tilt = 5.5, roll = 0, asym = 0 } = opts;
  const cx = W / 2;
  const pts: Pixel[] = Array.from({ length: 478 }, () => ({ x: cx, y: 700 }));

  const faceWidth = 380;
  const eyeY = 678;
  const rad = (tilt * Math.PI) / 180;

  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y };
  };

  /* midline vertical landmarks */
  set(LM.browMid, cx, 300);
  set(LM.glabella, cx, 550);
  set(LM.nasion, cx, 630);
  set(LM.noseTip, cx, 740);
  set(LM.subnasale, cx, 800);
  set(LM.upperLip, cx, 830);
  set(LM.chin, cx, 1050);

  /* bizygomatic width + jaw */
  set(LM.faceEdgeRight, cx - faceWidth / 2, 640);
  set(LM.faceEdgeLeft, cx + faceWidth / 2, 640);
  set(LM.jawRight, cx - faceWidth * 0.39, 900);
  set(LM.jawLeft, cx + faceWidth * 0.39, 900);

  /* eyes: corners at exact fifths, tilt applied symmetrically */
  const dy = Math.tan(rad) * 38; // half of an eye width
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

  eye(LM.eyeRightOuter, LM.eyeRightInner, LM.irisRight, LM.eyelidRightTop, LM.eyelidRightBottom, cx - 114, cx - 38);
  eye(LM.eyeLeftOuter, LM.eyeLeftInner, LM.irisLeft, LM.eyelidLeftTop, LM.eyelidLeftBottom, cx + 114, cx + 38);

  /* symmetric landmark pairs used by the symmetry metric */
  const pairs: readonly (readonly [number, number])[] = [
    [33, 263], [133, 362], [159, 386], [145, 374], [70, 300], [63, 293],
    [105, 334], [66, 296], [61, 291], [58, 288], [93, 323], [234, 454],
    [127, 356], [132, 361], [172, 397], [136, 365], [150, 379], [149, 378],
    [176, 400], [205, 425],
  ];
  const alreadySet = new Set([
    33, 263, 133, 362, 159, 386, 145, 374, 172, 397, 234, 454,
  ]);

  let free = 0;
  for (const [a, b] of pairs) {
    if (alreadySet.has(a) || alreadySet.has(b)) continue;
    const offset = 48 + free * 7;
    const y = 660 + free * 9;
    set(a, cx - offset, y);
    set(b, cx + offset + (free === 0 ? asym : 0), y);
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

const skin = { luminance: 0.62, variance: 0.02 };

console.log("\nAureline self-test\n");

/* 1 — the closeness primitive */
check("closeness(0, t) === 1", closeness(0, 0.5) === 1);
check("closeness(t, t) === 0", closeness(0.5, 0.5) === 0);
check("closeness is symmetric", closeness(0.2, 0.5) === closeness(-0.2, 0.5));
check("closeness clamps at 0", closeness(9, 0.5) === 0);

/* 2 — a reference face should score near the top */
const face = referenceFace();
const good = analyse(face, W, H, skin);
console.log(
  `     reference face: overall ${good.overall.toFixed(2)} · PSL ${good.psl} · tilt ${good.raw.canthalTiltDeg.toFixed(2)}° · FWHR ${good.raw.fwhrValue.toFixed(2)} · midface ${good.raw.midfaceValue.toFixed(2)}`
);
check("symmetry reads high", good.metrics.symmetry > 0.9, good.metrics.symmetry.toFixed(3));
check("equal thirds read high", good.metrics.thirds > 0.9, good.metrics.thirds.toFixed(3));
check("equal fifths read high", good.metrics.fifths > 0.9, good.metrics.fifths.toFixed(3));
check("FWHR is recovered", Math.abs(good.raw.fwhrValue - 1.9) < 0.02, good.raw.fwhrValue.toFixed(3));
check("midface ratio is recovered", Math.abs(good.raw.midfaceValue - 1.0) < 0.02, good.raw.midfaceValue.toFixed(3));
check(
  "canthal tilt is recovered per eye",
  Math.abs(good.raw.canthalTiltDeg - 5.5) < 0.6,
  `${good.raw.canthalTiltDeg.toFixed(2)}°`
);
check("overall score is high on a reference face", good.overall > 8, good.overall.toFixed(2));
check("potential is >= overall and capped at 10", good.potential >= good.overall && good.potential <= 10);

/* 3 — head roll must NOT cancel the canthal tilt */
const rolled = analyse(referenceFace({ roll: 6 }), W, H, skin);
check("head roll is detected", Math.abs(Math.abs(rolled.raw.headRollDeg) - 6) < 1.5, rolled.raw.headRollDeg.toFixed(2));
check(
  "canthal tilt survives a 6° head roll",
  Math.abs(rolled.raw.canthalTiltDeg - good.raw.canthalTiltDeg) < 0.8,
  `${rolled.raw.canthalTiltDeg.toFixed(2)} vs ${good.raw.canthalTiltDeg.toFixed(2)}`
);

/* 4 — a negative tilt must read negative */
const negative = analyse(referenceFace({ tilt: -6 }), W, H, skin);
check("negative tilt is detected as negative", negative.raw.canthalTiltDeg < -3, negative.raw.canthalTiltDeg.toFixed(2));

/* 5 — asymmetry must be punished */
const skewed = analyse(referenceFace({ asym: 30 }), W, H, skin);
check(
  "asymmetry lowers the symmetry score",
  skewed.metrics.symmetry < good.metrics.symmetry,
  `${skewed.metrics.symmetry.toFixed(3)} < ${good.metrics.symmetry.toFixed(3)}`
);
check("asymmetry lowers the overall score", skewed.overall < good.overall, `${skewed.overall.toFixed(2)} < ${good.overall.toFixed(2)}`);

/* 6 — PSL mapping + tiers */
check("PSL(0) === 1", toPsl(0) === 1);
check("PSL(10) === 8", toPsl(10) === 8);
check("PSL(5) === 4.5", toPsl(5) === 4.5);
check("tier 5.4 is HTN", tierFor(5.4).short === "HTN");
check("tier 7.2 is Chad", tierFor(7.2).short === "Chad");
check("tier 8 is Top Tier", tierFor(8).label === "Top Tier");
check("tier 2.4 is Developing", tierFor(2.4).label === "Developing");

/* 7 — the breakdown contract */
check("eight breakdown cards", good.breakdown.length === 8);
check("breakdown scores are 0..100", good.breakdown.every((c) => c.score >= 0 && c.score <= 100));
check("every card has a tip", good.breakdown.every((c) => c.tip.length > 10));

/* 8 — the pixel-space contract: ratios must not depend on image resolution */
const half = face.map((p) => ({ x: p.x / 2, y: p.y / 2 }));
const scaled = measure(half, W / 2, H / 2, skin);
const baseline = measure(face, W, H, skin);
check(
  "ratios are resolution independent",
  Math.abs(scaled.metrics.symmetry - baseline.metrics.symmetry) < 0.01 &&
    Math.abs(scaled.metrics.thirds - baseline.metrics.thirds) < 0.01,
  `sym ${Math.abs(scaled.metrics.symmetry - baseline.metrics.symmetry).toFixed(4)}`
);
check(
  "canthal tilt is resolution independent",
  Math.abs(scaled.raw.canthalTiltDeg - baseline.raw.canthalTiltDeg) < 0.6,
  `${scaled.raw.canthalTiltDeg.toFixed(2)} vs ${baseline.raw.canthalTiltDeg.toFixed(2)}`
);

/* 9 — normalised coordinates must NOT be passed in directly */
// Sanity guard for the documented contract: feeding 0..1 space changes the answer.
const normalised = face.map((p) => ({ x: p.x / W, y: p.y / H }));
const broken = measure(normalised, 1, 1, skin);
check(
  "normalised input would visibly distort the tilt (why we convert)",
  Math.abs(broken.raw.canthalTiltDeg - good.raw.canthalTiltDeg) > 1,
  `${broken.raw.canthalTiltDeg.toFixed(2)}° vs ${good.raw.canthalTiltDeg.toFixed(2)}°`
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
