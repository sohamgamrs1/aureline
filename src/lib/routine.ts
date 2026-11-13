/**
 * Aureline — routine generator.
 *
 * The routine is not generic. It reads the two weakest measured levers and puts
 * the emphasis there: the checklist items that actually move that lever come
 * first, and the section gets a "focus" badge.
 *
 * The mapping is deliberately honest about causality:
 *  - skin      → skincare basics (the one lever that is fully in your control)
 *  - symmetry  → sleep side, posture, chewing side
 *  - thirds / fifths / midface → posture, neck, body composition
 *  - canthalTilt → sleep, hydration, screen breaks
 *  - fwhr      → body composition
 * None of these claim to change bone structure.
 */

import type { MetricKey, MetricSet, RawMeasurements, RoutineSection } from "./types";

export type Lever = {
  id: MetricKey | "skin";
  /** Used in prose, e.g. "Priority one: proportion." */
  label: string;
  /** Full name, used where space allows. */
  fullLabel: string;
  value: number;
};

/** The six levers the routine can be personalised on, lowest first. */
export function rankLevers(metrics: MetricSet, raw: RawMeasurements): Lever[] {
  const levers: Lever[] = [
    { id: "skin", label: "skin", fullLabel: "Skin quality", value: metrics.skin ?? 0 },
    { id: "symmetry", label: "symmetry", fullLabel: "Symmetry", value: metrics.symmetry ?? 0 },
    { id: "thirds", label: "vertical balance", fullLabel: "Facial thirds", value: metrics.thirds ?? 0 },
    { id: "fifths", label: "horizontal balance", fullLabel: "Facial fifths", value: metrics.fifths ?? 0 },
    { id: "canthalTilt", label: "eye area", fullLabel: "Eye area", value: metrics.canthalTilt ?? 0 },
    { id: "fwhr", label: "proportion", fullLabel: "Face width-to-height", value: metrics.fwhr ?? 0 },
    { id: "midface", label: "midface length", fullLabel: "Midface", value: metrics.midface ?? 0 },
    {
      id: "goldenRatio",
      label: "canon proximity",
      fullLabel: "Golden ratio proximity",
      value: metrics.goldenRatio ?? 0,
    },
    {
      id: "definition",
      label: "bone structure",
      fullLabel: "Bone structure",
      value: metrics.definition ?? 0,
    },
  ];
  return levers.sort((a, b) => a.value - b.value);
}

const SECTION_FOR_LEVER: Record<string, string[]> = {
  skin: ["skin"],
  symmetry: ["posture", "sleep"],
  thirds: ["posture", "fitness"],
  fifths: ["posture", "fitness"],
  canthalTilt: ["sleep", "skin"],
  fwhr: ["fitness"],
  midface: ["posture", "fitness"],
  goldenRatio: ["posture", "fitness"],
  definition: ["fitness", "posture"],
};

type SectionTemplate = Omit<RoutineSection, "tasks"> & {
  tasks: { id: string; label: string; hint: string; focus?: boolean }[];
};

const TEMPLATES: SectionTemplate[] = [
  {
    id: "skin",
    title: "Skin",
    caption: "Three steps, twice a day. That is the whole routine.",
    tasks: [
      {
        id: "skin-cleanse",
        label: "Cleanse with a gentle, non-foaming cleanser",
        hint: "Morning and night. Lukewarm water — hot water strips the barrier.",
        focus: true,
      },
      {
        id: "skin-moisturise",
        label: "Moisturise while skin is still slightly damp",
        hint: "Seals water in. Ceramides or glycerin, nothing fragranced.",
        focus: true,
      },
      {
        id: "skin-spf",
        label: "Sunscreen, SPF 30 or higher",
        hint: "Every morning, indoors too. This is the single biggest anti-ageing step.",
        focus: true,
      },
      {
        id: "skin-sleep-hygiene",
        label: "Change your pillowcase",
        hint: "Twice a week. Less bacteria, fewer breakouts on the cheek you sleep on.",
      },
    ],
  },
  {
    id: "hair",
    title: "Hair",
    caption: "Volume and a clean hairline change how the whole face reads.",
    tasks: [
      {
        id: "hair-wash",
        label: "Wash 2–3 times a week, not daily",
        hint: "Over-washing flattens hair and pushes the scalp to overproduce oil.",
      },
      {
        id: "hair-style",
        label: "Add height at the crown",
        hint: "Volume above the brow lengthens the face and balances a wider jaw.",
        focus: true,
      },
      {
        id: "hair-hairline",
        label: "Keep the hairline clean",
        hint: "A tidy edge reads as intentional; stray hairs read as neglect.",
      },
    ],
  },
  {
    id: "posture",
    title: "Posture",
    caption: "Head position changes how your jaw and midface photograph.",
    tasks: [
      {
        id: "posture-neck",
        label: "Chin tucked, ears over shoulders",
        hint: "Forward head posture softens the jaw line and shortens the neck.",
        focus: true,
      },
      {
        id: "posture-screen",
        label: "Raise your screen to eye level",
        hint: "Ten minutes of chin-down scrolling undoes an hour of good posture.",
        focus: true,
      },
      {
        id: "posture-mewing",
        label: "Rest your tongue on the roof of your mouth",
        hint: "Nose breathing, lips closed, teeth apart. It is a resting habit, not an exercise.",
      },
      {
        id: "posture-chew",
        label: "Chew evenly on both sides",
        hint: "One-sided chewing is a common, fixable source of visible asymmetry.",
        focus: true,
      },
    ],
  },
  {
    id: "sleep",
    title: "Sleep",
    caption: "The cheapest thing on this list, and the one most people skip.",
    tasks: [
      {
        id: "sleep-hours",
        label: "7–9 hours, same window every night",
        hint: "Consistency matters more than total hours for under-eye appearance.",
        focus: true,
      },
      {
        id: "sleep-back",
        label: "Sleep on your back",
        hint: "Side-sleeping creases one cheek and is linked to morning puffiness.",
        focus: true,
      },
      {
        id: "sleep-screens",
        label: "No screens for 30 minutes before bed",
        hint: "Better sleep depth shows up in the eye area within a week.",
      },
      {
        id: "sleep-hydration",
        label: "Water through the day, not all at night",
        hint: "Front-loading water avoids morning facial puffiness.",
      },
    ],
  },
  {
    id: "fitness",
    title: "Fitness",
    caption: "Body composition is the strongest lever on jaw and cheek definition.",
    tasks: [
      {
        id: "fitness-steps",
        label: "8,000 steps",
        hint: "The base layer. Everything else sits on top of this.",
      },
      {
        id: "fitness-strength",
        label: "Two strength sessions a week",
        hint: "More muscle at the same weight lowers body fat and sharpens the face.",
        focus: true,
      },
      {
        id: "fitness-salt",
        label: "Keep salt and alcohol moderate",
        hint: "Both show up as facial puffiness within 24 hours.",
        focus: true,
      },
      {
        id: "fitness-mobility",
        label: "Five minutes of neck and shoulder mobility",
        hint: "Loosens the muscles that pull the head forward.",
      },
    ],
  },
];

export type RoutinePlan = {
  sections: RoutineSection[];
  focusSectionIds: string[];
  focusLevers: Lever[];
  /** One line explaining why this routine looks the way it does. */
  rationale: string;
};

/**
 * Build the plan. Focus sections surface their focus tasks first; every other
 * section is still present so the checklist stays complete.
 */
export function buildRoutine(metrics: MetricSet, raw: RawMeasurements): RoutinePlan {
  const ranked = rankLevers(metrics, raw);
  const lowestTwo = ranked.slice(0, 2);

  const focusSectionIds = Array.from(
    new Set(lowestTwo.flatMap((lever) => SECTION_FOR_LEVER[lever.id] ?? []))
  );

  const sections: RoutineSection[] = TEMPLATES.map((template) => {
    const isFocus = focusSectionIds.includes(template.id);
    const tasks = [...template.tasks].sort((a, b) => {
      if (isFocus) return Number(!!b.focus) - Number(!!a.focus);
      return 0;
    });
    return {
      id: template.id,
      title: template.title,
      caption: template.caption,
      tasks: tasks.map(({ id, label, hint }) => ({ id, label, hint })),
    };
  });

  const focusNames = lowestTwo.map((l) => l.fullLabel.toLowerCase());
  const rationale =
    `Your two lowest readings are ${focusNames[0]} and ${focusNames[1]}, ` +
    `so this plan leans on ${focusSectionIds
      .map((id) => TEMPLATES.find((t) => t.id === id)?.title ?? id)
      .join(" and ")
      .toLowerCase()}. ` +
    "The other sections stay in because a routine only works as a whole.";

  return { sections, focusSectionIds, focusLevers: lowestTwo, rationale };
}

/** A default plan for someone with no scan yet — no fake personalisation. */
export function defaultRoutine(): RoutinePlan {
  const sections: RoutineSection[] = TEMPLATES.map((template) => ({
    id: template.id,
    title: template.title,
    caption: template.caption,
    tasks: template.tasks.map(({ id, label, hint }) => ({ id, label, hint })),
  }));
  return {
    sections,
    focusSectionIds: ["skin", "posture"],
    focusLevers: [],
    rationale:
      "This is the standard Aureline plan. Run a scan and it re-weights itself around your two weakest levers.",
  };
}

/* --------------------------- dates & streaks --------------------------- */

export function dateKey(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDate(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Streak = consecutive completed days ending today, or ending yesterday if
 * today is still in progress (so the streak doesn't look broken at 9am).
 */
export function computeStreak(streakDates: string[]): number {
  const set = new Set(streakDates);
  const today = new Date();
  let cursor = set.has(dateKey(today)) ? today : shiftDate(today, -1);
  let streak = 0;
  while (set.has(dateKey(cursor)) && streak < 3650) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function totalTasks(plan: RoutinePlan) {
  return plan.sections.reduce((sum, section) => sum + section.tasks.length, 0);
}

export function completedTasks(plan: RoutinePlan, done: Record<string, boolean>, day = dateKey()) {
  return plan.sections.reduce(
    (sum, section) =>
      sum + section.tasks.filter((task) => done[`${day}:${task.id}`]).length,
    0
  );
}
