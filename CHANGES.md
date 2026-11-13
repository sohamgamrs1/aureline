# Aureline — changed files (v5)

Drop these over your existing project root. No new dependency, no config change.

| File | Change |
| --- | --- |
| `src/lib/scoring.ts` | Tolerance table `TOL`, failo-aware aggregation, hairline cap on the top third. |
| `scripts/selftest.ts` | Calibration assertions rewritten for the new curve. |
| `README.md` | Documents the retuning. |

## What was wrong

After v4 the scale stopped discriminating: a weak face and a model landed in the
same band. Two causes.

**Tolerances were too wide.** They had been opened up to fix the earlier "good
faces score low" complaint, and went too far — most real deviations sat at only
20–40% of tolerance, where the quadratic curve still awards 0.85–0.95. Every
metric read high, so every face read high.

**Averaging hid weak features.** A plain weighted mean of nine metrics lets
strong ones carry weak ones: five at 0.95 and four at 0.45 still average 0.72.

## What changed

1. **`TOL` table** — tolerances retuned to population spread. Symmetry 0.045
   (was 0.05), thirds 0.20 (was 0.22), fifths 0.24 (was 0.30), canthal tilt ±10°
   (was ±12°), FWHR 0.36 (was 0.50), midface 0.24 (was 0.28), plus the golden,
   bone-structure and skin tolerances. All in one place now instead of scattered
   through `measure()`.

2. **Failo-aware aggregation.** The overall score is
   `0.7 × weightedMean + 0.3 × weightedHarmonic`, then multiplied by
   `0.72 + 0.28 × min(1, weakest / 0.4)`. One clearly weak metric now drags the
   whole read down, which is how a face is actually judged.

3. **Hairline cap.** The top third is capped at 1.5× the mean of the other two,
   so a mis-estimated trichion (landmark 10) cannot zero out the thirds score and
   cascade through the failo factor.

## The resulting curve

```
q=0.00  overall 9.75  PSL 7.8  Chad
q=0.20  overall 9.14  PSL 7.4  Chad
q=0.35  overall 8.20  PSL 6.7  Chadlite
q=0.50  overall 7.03  PSL 5.9  HTN
q=0.70  overall 4.27  PSL 4.0  MTN
q=1.00  overall 1.53  PSL 2.1  Developing
```

Guards now asserted: a model-quality face clears PSL 6, a weak face falls below
3, and the two are at least 4 points apart. If the top of the scale saturates
again, `npm test` fails.

## Verify

```bash
npm run build
npm test      # prints the curve and asserts both ends
```
