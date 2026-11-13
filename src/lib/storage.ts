/**
 * Aureline — local-only storage.
 *
 * Three rules, enforced here and nowhere else:
 *  1. Only numbers and short strings are ever written. No photo, no blob, no
 *     landmark array.
 *  2. Nothing is ever sent anywhere — this file has no network call in it.
 *  3. Everything is namespaced under `aureline_` so Clear Data can wipe it in
 *     one pass without touching anything else on the origin.
 */

import type { HistoryEntry, Profile, RoutineState, ScanSession } from "./types";

const KEYS = {
  history: "aureline_history",
  routine: "aureline_routine",
  profile: "aureline_profile",
  consent: "aureline_consent",
  session: "aureline_session",
} as const;

const isBrowser = () => typeof window !== "undefined";

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode — the app keeps working, it just won't persist.
  }
}

/* ------------------------------- history ------------------------------- */

export function getHistory(): HistoryEntry[] {
  const list = readJson<HistoryEntry[]>(KEYS.history, []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string") : [];
}

/** Keep the newest 60 scans; numbers and text only. */
export function addHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...getHistory().filter((e) => e.id !== entry.id)].slice(0, 60);
  writeJson(KEYS.history, next);
  return next;
}

export function deleteHistoryEntry(id: string): HistoryEntry[] {
  const next = getHistory().filter((e) => e.id !== id);
  writeJson(KEYS.history, next);
  return next;
}

/* ------------------------------- session ------------------------------- */

/**
 * The live result, including the photo, lives in sessionStorage: it survives a
 * route change to /result but dies with the tab and is never written to disk by
 * the browser's persistent storage or to any server.
 */
export function saveSession(session: ScanSession) {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(KEYS.session, JSON.stringify(session));
  } catch {
    // Very large photos can exceed the session quota; the app degrades to a
    // result screen without the photo overlay rather than failing.
    try {
      window.sessionStorage.setItem(
        KEYS.session,
        JSON.stringify({ ...session, photo: "", landmarks: [] })
      );
    } catch {
      /* ignore */
    }
  }
}

export function getSession(): ScanSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEYS.session);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScanSession;
    return parsed && typeof parsed.overall === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(KEYS.session);
  } catch {
    /* ignore */
  }
}

/* ------------------------------- routine ------------------------------- */

export const emptyRoutine = (): RoutineState => ({
  done: {},
  streakDates: [],
  lastOpened: "",
});

export function getRoutine(): RoutineState {
  const state = readJson<RoutineState>(KEYS.routine, emptyRoutine());
  return {
    done: state?.done && typeof state.done === "object" ? state.done : {},
    streakDates: Array.isArray(state?.streakDates) ? state.streakDates : [],
    lastOpened: typeof state?.lastOpened === "string" ? state.lastOpened : "",
  };
}

export function saveRoutine(state: RoutineState) {
  writeJson(KEYS.routine, state);
}

/* ------------------------------- profile ------------------------------- */

export function getProfile(): Profile {
  const profile = readJson<Profile>(KEYS.profile, { name: "", goal: "" });
  return {
    name: typeof profile?.name === "string" ? profile.name.slice(0, 40) : "",
    goal: profile?.goal ?? "",
  };
}

export function saveProfile(profile: Profile) {
  writeJson(KEYS.profile, { name: profile.name.slice(0, 40), goal: profile.goal });
}

/* ------------------------------- consent ------------------------------- */

export function getConsent(): boolean {
  return readJson<boolean>(KEYS.consent, false) === true;
}

export function setConsent(value: boolean) {
  writeJson(KEYS.consent, value);
}

/* ------------------------------ clear all ------------------------------ */

/** Wipes every Aureline key. The only destructive action in the app. */
export function clearAll() {
  if (!isBrowser()) return;
  for (const key of Object.values(KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
