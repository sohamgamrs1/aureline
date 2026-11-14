import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildRoutine,
  computeStreak,
  completedTasks,
  dateKey,
  defaultRoutine,
  totalTasks,
  type RoutinePlan,
} from "@/lib/routine";
import { getHistory, getRoutine, getSession, saveRoutine } from "@/lib/storage";
import type { RoutineState } from "@/lib/types";

export default function RoutinePage() {
  const [plan, setPlan] = useState<RoutinePlan | null>(null);
  const [state, setState] = useState<RoutineState | null>(null);
  const [day, setDay] = useState("");

  useEffect(() => {
    const today = dateKey();
    setDay(today);

    const session = getSession();
    const history = getHistory();
    const latest = history[0];

    if (session) {
      setPlan(buildRoutine(session.metrics, session.raw));
    } else if (latest) {
      // History stores metrics only; rebuild the plan from them. Raw geometry is
      // not persisted, so pass a neutral raw block for the two pixel-based levers.
      setPlan(
        buildRoutine(latest.metrics, {
          faceWidth: 0,
          faceHeight: 0,
          interpupillary: 0,
          canthalTiltDeg: 0,
          headRollDeg: 0,
          symmetryMiss: 0,
          thirdsVariation: 0,
          fifthsVariation: 0,
          fwhrValue: 0,
          midfaceValue: 0,
          jawRatio: 0.8,
          chinRatio: 0.33,
          lowerThirdShare: 1 / 3,
          gonialAngleDeg: 145,
          mouthNoseRatio: 1.618,
          intercanthalNoseRatio: 1,
          eyeIntercanthalRatio: 1,
          faceAspectRatio: 1.62,
          goldenValue: 1,
          noseAxisDeviation: 0,
          alarAsymmetry: 0,
          jawVAngleDeg: 90,
          hairCoverage: 0.7,
          browDefinition: 0.55,
          facialHair: 0.85,
          lipDefinition: 0.55,
          skinLuminance: 0.6,
          skinVariance: 0,
        })
      );
    } else {
      setPlan(defaultRoutine());
    }

    const stored = getRoutine();
    setState({ ...stored, lastOpened: today });
    saveRoutine({ ...stored, lastOpened: today });
  }, []);

  const totals = useMemo(
    () => (plan ? totalTasks(plan) : 0),
    [plan]
  );
  const doneCount = useMemo(
    () => (plan && state ? completedTasks(plan, state.done, day) : 0),
    [plan, state, day]
  );
  const streak = useMemo(
    () => (state ? computeStreak(state.streakDates) : 0),
    [state]
  );
  const progress = totals ? doneCount / totals : 0;

  const toggle = (taskId: string) => {
    if (!plan || !state) return;
    const key = `${day}:${taskId}`;
    const done = { ...state.done, [key]: !state.done[key] };
    if (!done[key]) delete done[key];

    const allDone =
      plan.sections.reduce(
        (sum, section) =>
          sum + section.tasks.filter((task) => done[`${day}:${task.id}`]).length,
        0
      ) === totals;

    const streakDates = allDone
      ? Array.from(new Set([...state.streakDates, day]))
      : state.streakDates.filter((d) => d !== day);

    const next = { ...state, done, streakDates };
    setState(next);
    saveRoutine(next);
  };

  const resetDay = () => {
    if (!state) return;
    const done = Object.fromEntries(
      Object.entries(state.done).filter(([key]) => !key.startsWith(`${day}:`))
    );
    const next = {
      ...state,
      done,
      streakDates: state.streakDates.filter((d) => d !== day),
    };
    setState(next);
    saveRoutine(next);
  };

  if (!plan || !state) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="h-9 w-9 animate-spin rounded-full border border-gold-400/25 border-t-gold-300" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Step 03 · Routine</p>
          <h1 className="mt-4 font-display text-[2rem] leading-tight text-white sm:text-[2.6rem]">
            Your glow-up plan.
          </h1>
          <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-muted/70">
            {plan.rationale}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 rounded-card border border-gold-400/20 bg-gold-400/[0.05] px-5 py-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] text-muted/55">Streak</p>
            <p className="stat-num font-display text-3xl leading-none text-gold-200">
              {streak}
              <span className="ml-1 text-[11px] uppercase tracking-[0.16em] text-muted/50">
                {streak === 1 ? "day" : "days"}
              </span>
            </p>
          </div>
          <span className="h-9 w-px bg-white/10" />
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] text-muted/55">Today</p>
            <p className="stat-num font-display text-3xl leading-none text-white/90">
              {doneCount}
              <span className="ml-1 text-[11px] text-muted/50">/ {totals}</span>
            </p>
          </div>
        </div>
      </header>

      {/* progress */}
      <div className="mt-7">
        <div className="mb-2.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted/50">
          <span>Daily progress</span>
          <span className="stat-num">{Math.round(progress * 100)}%</span>
        </div>
        <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${progress * 100}%`,
              background:
                "linear-gradient(90deg, rgba(158,123,34,0.85), #D4AF37 60%, #F4E6BF)",
              boxShadow: "0 0 16px -2px rgba(212,175,55,0.8)",
            }}
          />
        </div>
      </div>

      {/* sections */}
      <div className="mt-8 space-y-4">
        {plan.sections.map((section, index) => {
          const isFocus = plan.focusSectionIds.includes(section.id);
          const sectionDone = section.tasks.filter(
            (task) => state.done[`${day}:${task.id}`]
          ).length;

          return (
            <section
              key={section.id}
              className={`animate-fade-up ${isFocus ? "card-gold" : "card"} p-5 sm:p-6`}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-xl text-white/95">{section.title}</h2>
                  {isFocus && (
                    <span className="rounded-full border border-gold-400/35 bg-gold-400/10 px-2.5 py-1 text-[8px] uppercase tracking-[0.2em] text-gold-200">
                      Focus
                    </span>
                  )}
                </div>
                <p className="stat-num text-[10px] uppercase tracking-[0.18em] text-muted/45">
                  {sectionDone} / {section.tasks.length}
                </p>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted/50">
                {section.caption}
              </p>

              <ul className="mt-4 space-y-1">
                {section.tasks.map((task) => {
                  const key = `${day}:${task.id}`;
                  const checked = Boolean(state.done[key]);
                  return (
                    <li key={task.id}>
                      <label className="group flex cursor-pointer items-start gap-3.5 rounded-xl px-2 py-2.5 transition-colors duration-200 hover:bg-white/[0.03]">
                        <span className="relative mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(task.id)}
                            className="peer absolute h-full w-full cursor-pointer appearance-none rounded-[5px] border border-white/20 transition-colors duration-200 checked:border-gold-400 checked:bg-gold-400"
                          />
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#07070B"
                            strokeWidth={3.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`pointer-events-none relative h-2.5 w-2.5 transition-opacity duration-150 ${
                              checked ? "opacity-100" : "opacity-0"
                            }`}
                          >
                            <path d="m5 12.5 4.5 4.5L19 7" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block text-[13px] leading-snug transition-colors duration-200 ${
                              checked ? "text-muted/45 line-through" : "text-white/85"
                            }`}
                          >
                            {task.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted/50">
                            {task.hint}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-[11px] leading-relaxed text-muted/45">
          A day counts toward your streak only when every box is ticked.
        </p>
        <div className="flex gap-2.5">
          <button type="button" onClick={resetDay} className="btn-ghost">
            Reset today
          </button>
          <Link to="/scan" className="btn-ghost">
            New scan
          </Link>
        </div>
      </div>
    </div>
  );
}
