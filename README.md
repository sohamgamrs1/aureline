# Aureline

**Know your face. Elevate your presence.**

A private, in-browser face analysis app. Upload a selfie, get 478 facial landmarks
measured in pixels, an Overall Score, a PSL 1–8 reading, eight breakdown cards,
and a glow-up routine weighted to your two weakest levers.

No backend. No paid API. No photo ever leaves the device.

**Stack:** Vite 5 + React 18 + React Router 6 + TypeScript + Tailwind, packaged for
Android with Capacitor.

---

## Why this is a Vite app and not Next.js

The first build failed with:

```
virtual:app/globals.css:147:26: ERROR: [plugin: http-resolve] Failed to fetch
  https://esm.sh/data:image@latest/svg+xml,...  HTTP 400
virtual:app/layout.tsx:35:35: ERROR: Expected identifier but found "<"
```

Both are Next.js problems, not Aureline problems:

1. **The CSS grain texture** was an inline `url("data:image/svg+xml,…")`. The
   `http-resolve` plugin rewrites every `url(...)` in a stylesheet as an HTTP
   module, so it tried to fetch a `data:` URI from `esm.sh` and got a 400.
2. **`app/layout.tsx`** is a Next.js server layout. The pipeline parsed it as
   TypeScript rather than TSX, so `<html>` read as a type assertion. Even past
   that, `next/link` and `next/navigation` cannot resolve through `esm.sh` in a
   browser.

So this version is the same app with the same design, logic and maths, ported to
plain Vite:

- `next/link` → `react-router-dom` `Link` (`to=` instead of `href=`)
- `next/navigation` `useRouter`/`usePathname` → `useNavigate`/`useLocation`
- `app/*/page.tsx` → `src/pages/*.tsx`, `app/layout.tsx` → `src/App.tsx` + `index.html`
- the film grain is now pure CSS gradients — **there is not a single `url()` left
  in `globals.css`**, so no bundler can mistake an asset for a module
- fonts are embedded as base64 in `src/styles/fonts.ts` and injected at runtime, so the project carries **no binary files at all**
- `"use client"` directives removed (they are Next-only and make Rollup warn)

`npm run build` now finishes with **zero warnings**.

### This project contains no binary files

The APK pipeline only carries **text** into its project — a `.woff2`, `.png` or
`.wasm` referenced at build time fails with `[plugin: virtual-fs] File not found in
project`. So everything binary was removed:

| Asset | How it is handled now |
| --- | --- |
| Playfair Display + Inter | base64 inside `src/styles/fonts.ts`, injected as `@font-face` at runtime |
| film grain | pure CSS gradients — no `url()` anywhere in the CSS |
| icons | inline SVG components |
| MediaPipe wasm + model | **not** bundled; fetched from the official CDN at runtime, with `/mediapipe/…` probed first if you do bundle them |

`grep -r "url(" src` returns exactly one hit: the base64 font template string in
`fonts.ts`, which is a JS value the CSS pipeline never parses.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # tsc --noEmit && vite build  →  dist/
npm run preview      # serve the production build
npm test             # 30 assertions over the scoring maths
```

### Bundle the face model

The repository ships without the 19 MB MediaPipe binaries. On first load
`src/lib/mediapipe.ts` probes `mediapipe/…`; if absent it falls back to the
official CDN, so a fresh clone works immediately.

For a fully offline build — which is what an APK wants — fetch them first:

```bash
npm run fetch:models     # writes public/mediapipe/{wasm/*, face_landmarker.task}
npm run build            # they are copied into dist/ automatically
```

---

## Building the APK

```bash
npm install
npm run fetch:models          # bundle the model so the app works offline
npx cap add android           # one time only
npm run apk:build             # build → sync → ./gradlew assembleDebug
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

Requires **JDK 17** and **Android Studio** (or just the Android SDK + `ANDROID_HOME`).
Open the project in Android Studio with `npm run apk:open` if you prefer the GUI,
then Build → Build APK.

### Camera permission (important)

`getUserMedia` inside an Android WebView needs the permission declared **and**
granted at runtime. Add this to `android/app/src/main/AndroidManifest.xml`,
inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

Capacitor's bridge forwards the WebView's permission request, but on some Android
builds the in-app camera is still refused. **Upload Photo always works** — it opens
the system photo picker — and the app degrades to it cleanly with an explanatory
message rather than failing. For a guaranteed native capture path, swap in
`@capacitor/camera`.

`capacitor.config.ts` sets `androidScheme: "https"` so the WebView origin is
`https://localhost`, which is what `getUserMedia` and `crypto.randomUUID()`
require.

---

## If the installed app shows a blank screen

A white screen means the bundle threw before React mounted. Three things were
changed to make that debuggable and less likely:

**1. A boot guard in `index.html`.** It registers `error` and
`unhandledrejection` handlers *before* the module script runs — so it catches
module-evaluation failures, which no React error boundary can see. If the app has
not mounted after 8 seconds it says so. Instead of a white screen you now get the
actual error text on screen.

**2. No `import.meta.env`.** `src/lib/mediapipe.ts` read `import.meta.env.BASE_URL`
at module scope. That define only exists under Vite; under any other bundler it
evaluates to `undefined.BASE_URL`, which throws during module evaluation — and
because `App` imports `Scan` eagerly, that kills the whole app before first
render. The asset paths are now plain relative strings (`./mediapipe/...`), which
resolve correctly from `https://localhost`, `file://`, a sub-path, and dev.

**3. An error boundary around `<App />`**, which renders the message and stack in
the app's own styling instead of unmounting to nothing.

If you still see a blank screen, get the real error rather than guessing:

- **Android:** enable USB debugging, open `chrome://inspect` on your desktop
  Chrome, and inspect the WebView. The console shows the exception.
- **Or** rebuild without minification and check what the boot guard prints.

One thing worth knowing: if your build tool externalises `react`, `react-dom` and
`react-router-dom` (you can see `?external=...` in the esm.sh URLs), those are
fetched **over the network at launch**. An offline first run will hang before
mounting. Bundling them instead removes that dependency.

## The nine measurements

Every number is derived from landmark geometry. Landmarks arrive normalised
`0..1`; **all** distances and angles are computed after converting to pixels
(`x * width`, `y * height`), because normalised space is not square.

| Metric | How it is measured | Weight |
| --- | --- | --- |
| Symmetry | 20 mirrored landmark pairs reflected across the brow→chin midline; mean miss ÷ face width | 16% |
| Bone Structure | Bigonial width ÷ bizygomatic width, the interior angle at the gonion, and chin height ÷ face height | 14% |
| Facial Thirds | Hairline → brow → subnasale → chin, projected on the head's vertical axis; coefficient of variation | 12% |
| Canthal Tilt | Inner→outer eye-corner angle against the **head's** horizontal axis | 11% |
| Golden Ratio | Four canons: face height÷width, mouth÷nose, intercanthal÷nose, eye width÷intercanthal | 11% |
| Skin Quality | Evenness and healthy exposure of the two sampled cheek patches | 10% |
| Facial Fifths | Five horizontal segments, face edge → eye corners → face edge; coefficient of variation | 9% |
| FWHR | Bizygomatic width ÷ upper face height (nasion → upper lip) | 9% |
| Midface | Interpupillary distance ÷ midface height | 8% |

One curve scores everything:

```
closeness = clamp01(1 - (deviation / tolerance)²)
```

`Score10 = Σ(metric × weight) × 10`, `PSL = 1 + (Score10 / 10) × 7`.

### Calibration: how the curve was tuned

Two complaints drove this, in opposite directions, and both are now pinned by
assertions in `npm test`.

**First**, faces that read as PSL 6+ were coming out mid-scale. The original
scored each ratio with a linear falloff, `1 - |dev| / tol`, which punishes every
millimetre equally; since no real face is perfectly symmetric or perfectly
thirds-divided, everyone compressed into a 4–6 strip.

**Then**, after loosening it, a genuinely weak face scored in the same band as a
model. The scale was discriminating in neither direction — everything read alike.

Three things fixed it:

1. **Quadratic falloff** — `1 - (dev/tol)²` keeps small deviations near full
   marks and only bites once a face is visibly off.
2. **Tolerances set at population spread, not at zero** — see the `TOL` table at
   the top of `src/lib/scoring.ts`. A metric reaches zero when the deviation is
   roughly what separates the bottom third of faces from the middle, not the
   bottom few percent.
3. **Failo-aware aggregation** — a plain weighted mean hides a weak feature: five
   metrics at 0.95 and four at 0.45 still average 0.72. The overall score now
   blends in a weighted harmonic mean (pulled toward the low end) and applies a
   factor for the weakest metric, because a face is limited by its worst feature.

The resulting curve, asserted by `npm test`:

```
q=0.00  overall 9.75  PSL 7.8  Chad
q=0.20  overall 9.14  PSL 7.4  Chad
q=0.35  overall 8.20  PSL 6.7  Chadlite
q=0.50  overall 7.03  PSL 5.9  HTN
q=0.70  overall 4.27  PSL 4.0  MTN
q=1.00  overall 1.53  PSL 2.1  Developing
```

Two regression guards sit on top: a model-quality face must clear PSL 6, a weak
face must fall below 3, and the two must be at least 4 points apart. If the top
of the scale ever saturates again, the suite fails.

**One robustness note.** Landmark 10 approximates the trichion (hairline), which
MediaPipe estimates from face shape rather than detecting hair. On a high or
receding hairline it can sit well above the real hairline and inflate the top
third. Since that is indistinguishable from a genuinely long forehead, the top
third is capped at 1.5× the mean of the other two — better to under-penalise a
real forehead than to crush a score on a landmark we do not trust.

**What Bone Structure does and does not measure.** A frontal 2D photo supports
jaw breadth, the gonial angle and chin proportion. It does **not** support
brow-ridge projection, which is depth — so that is deliberately not scored
rather than faked from a proxy. The metric reads *angularity and definition*,
not masculinity or femininity; it does not assume either is better.

### Two details that are easy to get wrong

**1. Head roll must not come from the eye line.** The face's frame is built from
the brow (10) → chin (152) midline: `u` points down it, `h` is perpendicular.
Canthal tilt is the inner→outer vector measured against `h`. Measuring against
the eye line itself would cancel the tilt out completely.

**2. The two eyes point in opposite directions along `h`.** The outer corner sits
at `-h` on one side and `+h` on the other, so the horizontal component is taken
as a magnitude. Without that, one eye reads ≈0° and the other ≈180°, and their
mean is meaningless. `npm test` covers both, plus resolution independence and a
guard proving that normalised coordinates would distort the result.

---

## The quality gate

A photo is checked **before** it is scored, and a failure produces exactly one
reason and one fix — never a partial score.

- **Face size** — face width ≥ 24% of frame width
- **Roll** — under 8° off vertical (brow→chin midline)
- **Yaw** — nose-tip drift under 14% of face width
- **Brightness** — mean luminance of both cheek patches between 26% and 94%
- **Sharpness** — Laplacian variance above the blur floor

Skin quality is sampled from the two cheek patches, not inferred from geometry.
Jawline is a rule on gonial width ÷ bizygomatic width.

---

## Privacy model

- The photo is decoded, drawn to an offscreen canvas, measured, and discarded.
  There is no upload path anywhere in the codebase.
- The live result (including the photo) lives in **sessionStorage** so `/result`
  survives a route change; it dies with the tab.
- Only numbers and short strings go to **localStorage**, under `aureline_*`:
  history (max 60), routine state, profile, consent.
- **Clear Data** in Profile wipes every key in one pass.
- No analytics, no cookies, no third-party requests at runtime.

---

## Structure

```
index.html
capacitor.config.ts
src/
  main.tsx            HashRouter + mount
  App.tsx             shell: ambient light, nav, routes, footer
  pages/              Home, Scan, Result, Routine, History, Profile
  components/         Nav, CameraGuide, ScoreCircle, MetricBar, ConsentGate, Sparkline
  lib/
    scoring.ts        all measurement + scoring maths (pure, no DOM)
    mediapipe.ts      model loading, pixel conversion, quality gate, canvas overlay
    routine.ts        lever ranking, plan generation, streaks
    storage.ts        localStorage/sessionStorage, all namespaced
    types.ts          shared shapes
  styles/
    fonts.ts          Playfair Display + Inter, embedded as base64, injected at runtime
    globals.css       design tokens, card/button primitives, CSS-only grain
scripts/
  selftest.ts         30 assertions over scoring.ts
  fetch-mediapipe.mjs downloads wasm + model into public/mediapipe
```

---

## Limits worth stating plainly

- A photograph is one moment under one light. The score describes the photo.
- Scores are aesthetic estimates against population ratios, not measurements of
  health, age, or attractiveness in any objective sense.
- The routine moves skin, definition, posture and sleep — it does not claim to
  change bone structure, and the app never suggests surgery.
- For adults 18 and over. Not a medical or psychological assessment.
