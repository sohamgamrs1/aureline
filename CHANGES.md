# Aureline — changed files (v6)

Drop these over your project root. No new dependency.

| File | Change |
| --- | --- |
| `src/lib/scoring.ts` | `TOL` → `SCALE`, fitted to measured faces. Exponential curve. |
| `scripts/selftest.ts` | Asserts the distribution of the measured sample. |
| `scripts/fixtures/real-faces.json` | **New** — raw measurements from 9 real portraits (numbers only). |
| `src/components/Diagnostics.tsx` | **New** — the diagnostics panel. |
| `src/pages/Result.tsx` | Renders the panel. |
| `README.md` | Documents the fitting. |

## Why every face scored about the same

I measured nine portrait photographs end to end through the pipeline instead of
guessing again. The result was unambiguous:

| Deviation | Synthetic assumption | Median of real faces |
| --- | --- | --- |
| Symmetry miss | 1.2% of face width | **8.7%** |
| Thirds CV | 5% | **28.9%** |
| Fifths CV | 8% | **25.2%** |

Real deviations are 3–5× larger than the tolerances assumed. With a bounded
curve, symmetry and thirds therefore scored **exactly 0 on every photo** — the
failo factor bottomed out and everything collapsed into a 2–4 band, which is why
a model and an average face read the same.

## What changed

1. **Exponential curve.** `exp(-|dev| / scale)` instead of `1 - (dev/tol)²`. A
   bounded curve reaches zero at its tolerance; once real deviations exceed it,
   the ordering is lost. Exponential decay preserves it.

2. **`SCALE` fitted to the data.** Each value is `median real deviation / 0.598`,
   so the median face scores 0.55 on that metric:

   ```
   symmetry 0.1451   thirds 0.4828   fifths 0.4208   tilt 3.6599
   fwhr 0.2393       midface 0.1256  golden 0.7186/0.3929/0.3691/0.3462
   jaw 0.0509        gonial 19.94    chin 0.1147     skin 0.1309/0.1741
   ```

3. **Diagnostics panel** on the result screen — every measurement, its ideal, its
   deviation as a multiple of scale, and its score. Copyable as text.

## Effect on the same nine photos

```
before:  1.52 .. 4.01   sd 0.66   (symmetry and thirds pinned at 0)
after:   3.16 .. 6.66   sd 1.12
```

`npm test` now loads those measurements and asserts range ≥ 2.5 and sd ≥ 0.8, so
this cannot silently regress.

## Honest limitation

Nine photos is a small sample, and they are ordinary portraits rather than a
rated population. The scale is now anchored to real measurements instead of an
ideal, which is the important part — but if you send diagnostics from a handful
of faces you consider clearly above and clearly below average, the scales can be
fitted to *your* reference points in one pass. That is what the panel is for.

## Verify

```bash
npm run build
npm test
```
