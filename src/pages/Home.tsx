import { Link } from "react-router-dom";
import ConsentGate from "@/components/ConsentGate";

/* --------------------------- decorative face --------------------------- */
/* Hand-drawn line diagram: no image assets, no copied logo — original marks. */

function FaceDiagram() {
  return (
    <svg
      viewBox="0 0 320 400"
      className="h-full w-full"
      fill="none"
      aria-hidden
      role="presentation"
    >
      <defs>
        <linearGradient id="dg-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4E6BF" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#D4AF37" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#9E7B22" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="dg-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgba(212,175,55,0.16)" />
          <stop offset="100%" stopColor="rgba(212,175,55,0)" />
        </radialGradient>
      </defs>

      <circle cx="160" cy="190" r="150" fill="url(#dg-glow)" />

      {/* head outline */}
      <ellipse
        cx="160"
        cy="196"
        rx="104"
        ry="148"
        stroke="url(#dg-stroke)"
        strokeWidth="1.1"
      />
      <ellipse
        cx="160"
        cy="196"
        rx="112"
        ry="156"
        stroke="rgba(212,175,55,0.14)"
        strokeWidth="0.7"
      />

      {/* midline */}
      <line
        x1="160"
        y1="42"
        x2="160"
        y2="352"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="0.7"
        strokeDasharray="2 6"
      />

      {/* facial thirds */}
      <line x1="58" y1="118" x2="262" y2="118" stroke="rgba(212,175,55,0.4)" strokeWidth="0.7" strokeDasharray="3 6" />
      <line x1="52" y1="200" x2="268" y2="200" stroke="rgba(212,175,55,0.55)" strokeWidth="0.8" />
      <line x1="66" y1="284" x2="254" y2="284" stroke="rgba(212,175,55,0.4)" strokeWidth="0.7" strokeDasharray="3 6" />

      {/* eye line + almonds */}
      <line x1="70" y1="176" x2="250" y2="176" stroke="rgba(255,255,255,0.16)" strokeWidth="0.6" />
      <path
        d="M96 176c8-9 22-9 30 0-8 9-22 9-30 0Z"
        stroke="url(#dg-stroke)"
        strokeWidth="1.1"
      />
      <path
        d="M194 176c8-9 22-9 30 0-8 9-22 9-30 0Z"
        stroke="url(#dg-stroke)"
        strokeWidth="1.1"
      />
      <circle cx="111" cy="176" r="3.2" fill="#E0C576" opacity="0.85" />
      <circle cx="209" cy="176" r="3.2" fill="#E0C576" opacity="0.85" />

      {/* canthal tilt vectors */}
      <line x1="126" y1="178" x2="96" y2="172" stroke="#F4E6BF" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
      <line x1="194" y1="178" x2="224" y2="172" stroke="#F4E6BF" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />

      {/* nose + mouth marks */}
      <path d="M160 176v54c0 6-6 10-12 12" stroke="rgba(255,255,255,0.22)" strokeWidth="0.7" strokeLinecap="round" />
      <path d="M138 268c14 8 30 8 44 0" stroke="rgba(212,175,55,0.5)" strokeWidth="0.9" strokeLinecap="round" />

      {/* jaw */}
      <path d="M74 232c4 44 34 76 86 76s82-32 86-76" stroke="rgba(212,175,55,0.3)" strokeWidth="0.8" strokeDasharray="2 5" />

      {/* landmark dots */}
      {[
        [160, 48],
        [160, 118],
        [160, 200],
        [160, 308],
        [56, 196],
        [264, 196],
        [111, 176],
        [209, 176],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="2.2" fill="#D4AF37" />
          <circle cx={cx} cy={cy} r="5" stroke="rgba(212,175,55,0.32)" strokeWidth="0.7" />
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------- content ------------------------------- */

const STEPS = [
  {
    n: "01",
    title: "Scan",
    body: "Upload a selfie or use your camera. Aureline finds 478 facial landmarks and checks the photo is good enough to measure before it scores anything.",
  },
  {
    n: "02",
    title: "Read",
    body: "Symmetry, facial thirds, fifths, canthal tilt, width-to-height and midface — each measured in pixels, each shown as a number you can trace back to the diagram.",
  },
  {
    n: "03",
    title: "Refine",
    body: "A routine weighted to your two weakest levers, with a daily checklist and a streak that keeps you honest.",
  },
];

const FEATURES = [
  {
    title: "Measured, not guessed",
    body: "Every score comes from real landmark geometry in your browser. No paid API, no fake numbers, no model guessing behind a curtain.",
    icon: (
      <>
        <path d="M4 18 9 8l4 6 3-4 4 8" />
        <path d="M4 4v16h16" />
      </>
    ),
  },
  {
    title: "Private by construction",
    body: "Your photo is decoded, measured, and discarded in the same tab. Nothing is uploaded, and only the numbers are saved — on your device.",
    icon: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2.2" />
        <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
        <path d="M12 14v2.5" />
      </>
    ),
  },
  {
    title: "Built to be useful",
    body: "No surgery suggestions, no invented conditions. Positive, specific, and limited to the things a routine can actually change.",
    icon: (
      <>
        <path d="M12 3.5 14.4 9l5.9.6-4.4 4 1.3 5.9L12 16.6 6.8 19.5 8.1 13.6 3.7 9.6 9.6 9 12 3.5Z" />
      </>
    ),
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      {/* ------------------------------- hero ------------------------------ */}
      <section className="relative grid items-center gap-10 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6 lg:pb-24 lg:pt-20">
        <div className="animate-fade-up">
          <p className="eyebrow flex items-center gap-3">
            <span className="h-px w-8 bg-gold-400/50" />
            Private · In-browser · 478 landmarks
          </p>

          <h1 className="mt-6 font-display text-[2.6rem] leading-[1.06] tracking-[-0.02em] text-white sm:text-[3.6rem] lg:text-[4.1rem]">
            Know your face.
            <span className="mt-1 block gold-text">Elevate your presence.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted/85">
            Aureline measures your facial proportions the way a photographer reads a
            frame — then hands you a routine built around the two things holding you
            back. An honest estimate, in under three seconds, without your photo ever
            leaving your device.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/scan" className="btn-gold">
              Start Scan
            </Link>
            <Link to="/routine" className="btn-ghost">
              See the routine
            </Link>
          </div>

          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/[0.07] pt-7">
            {[
              ["478", "landmarks"],
              ["6", "ratios measured"],
              ["0", "bytes uploaded"],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="stat-num font-display text-2xl text-white/95">{value}</dt>
                <dd className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted/55">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-sm animate-fade-in lg:max-w-none">
          <div className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(212,175,55,0.10),transparent_70%)] blur-2xl" />
          <FaceDiagram />
        </div>
      </section>

      {/* ---------------------------- consent ----------------------------- */}
      <section className="pb-16">
        <ConsentGate />
      </section>

      {/* --------------------------- how it works -------------------------- */}
      <section className="border-t border-white/[0.06] py-16 lg:py-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-4 font-display text-3xl text-white sm:text-[2.4rem]">
              Three minutes, three steps.
            </h2>
          </div>
          <p className="max-w-sm text-[13px] leading-relaxed text-muted/65">
            No account. No upload. No waiting on a server queue — the whole analysis
            runs on your phone.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <article
              key={step.n}
              className="card animate-fade-up p-6"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="stat-num font-display text-[13px] tracking-[0.2em] text-gold-400/70">
                  {step.n}
                </span>
                <span className="h-px flex-1 mx-4 bg-white/[0.08]" />
              </div>
              <h3 className="mt-5 font-display text-xl text-white/95">{step.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted/75">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------- features ---------------------------- */}
      <section className="border-t border-white/[0.06] py-16 lg:py-20">
        <p className="eyebrow">Why Aureline</p>
        <h2 className="mt-4 max-w-2xl font-display text-3xl leading-tight text-white sm:text-[2.4rem]">
          A measuring instrument, not a mirror.
        </h2>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <article
              key={feature.title}
              className="card-gold animate-fade-up p-6"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="grid h-11 w-11 place-items-center rounded-full border border-gold-400/25 bg-gold-400/[0.06]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-gold-300"
                >
                  {feature.icon}
                </svg>
              </div>
              <h3 className="mt-5 font-display text-xl text-white/95">{feature.title}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted/75">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------ close ----------------------------- */}
      <section className="pb-20 pt-8">
        <div className="card relative overflow-hidden px-6 py-12 text-center sm:px-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.16),transparent_70%)]"
          />
          <p className="eyebrow">Begin</p>
          <h2 className="mx-auto mt-4 max-w-xl font-display text-3xl leading-tight text-white sm:text-[2.5rem]">
            One photo. An honest read. A plan you can start tonight.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[13px] leading-relaxed text-muted/70">
            Everything is measured on your device and stored only on your device. Clear
            Data wipes it in one tap.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/scan" className="btn-gold">
              Start Scan
            </Link>
            <Link to="/history" className="btn-ghost">
              View history
            </Link>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-[11px] leading-relaxed text-muted/45">
          Aureline is an AI estimate for fun and self improvement, not a medical or
          psychological assessment. For 18+ only. Scores describe a photograph, not a
          person&apos;s worth.
        </p>
      </section>
    </div>
  );
}
