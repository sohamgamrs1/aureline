import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { computeStreak } from "@/lib/routine";
import { clearAll, getConsent, getHistory, getProfile, getRoutine, saveProfile } from "@/lib/storage";
import type { Profile } from "@/lib/types";

const GOALS: { id: Exclude<Profile["goal"], "">; label: string; hint: string }[] = [
  { id: "presence", label: "Presence", hint: "Read better in photos and rooms" },
  { id: "skin", label: "Skin", hint: "Even tone and a clear routine" },
  { id: "definition", label: "Definition", hint: "Sharper jaw and cheekbones" },
  { id: "confidence", label: "Confidence", hint: "Stop guessing, start tracking" },
];

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({ name: "", goal: "" });
  const [scans, setScans] = useState(0);
  const [streak, setStreak] = useState(0);
  const [consented, setConsented] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    setProfile(getProfile());
    setScans(getHistory().length);
    setStreak(computeStreak(getRoutine().streakDates));
    setConsented(getConsent());
  }, []);

  const persist = (next: Profile) => {
    setProfile(next);
    saveProfile(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const wipe = () => {
    clearAll();
    setScans(0);
    setStreak(0);
    setConsented(false);
    setProfile({ name: "", goal: "" });
    setConfirmClear(false);
    setCleared(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
      <header>
        <p className="eyebrow">Account</p>
        <h1 className="mt-4 font-display text-[2rem] leading-tight text-white sm:text-[2.6rem]">
          Profile
        </h1>
        <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-muted/70">
          There is no account and no login. Everything here is stored on this device
          only, and you can erase all of it in one tap.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Scans saved", `${scans}`],
          ["Current streak", `${streak} ${streak === 1 ? "day" : "days"}`],
          ["Acknowledgement", consented ? "On" : "Off"],
        ].map(([label, value]) => (
          <div key={label} className="card px-5 py-4">
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted/50">{label}</p>
            <p className="stat-num mt-1.5 font-display text-xl text-white/95">{value}</p>
          </div>
        ))}
      </div>

      {/* name */}
      <section className="card mt-4 p-6">
        <label htmlFor="name" className="eyebrow block">
          What should we call you
        </label>
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
          <input
            id="name"
            value={profile.name}
            onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            onBlur={() => persist({ ...profile, name: profile.name.trim() })}
            maxLength={40}
            placeholder="Your first name"
            className="w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-5 py-3 text-[14px] text-white placeholder:text-muted/35 focus:border-gold-400/50 focus:outline-none focus:ring-1 focus:ring-gold-400/25"
          />
          <button
            type="button"
            onClick={() => persist({ ...profile, name: profile.name.trim() })}
            className="btn-ghost shrink-0"
          >
            {savedFlash ? "Saved" : "Save"}
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted/45">
          Used only to greet you on this device. Never sent anywhere.
        </p>
      </section>

      {/* goal */}
      <section className="card mt-4 p-6">
        <p className="eyebrow">Primary goal</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted/45">
          Shapes the emphasis of your routine — it does not change your score.
        </p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {GOALS.map((goal) => {
            const active = profile.goal === goal.id;
            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => persist({ ...profile, goal: active ? "" : goal.id })}
                className={`rounded-2xl border px-4 py-3.5 text-left transition-all duration-300 ${
                  active
                    ? "border-gold-400/45 bg-gold-400/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <span
                  className={`block text-[13px] ${active ? "text-gold-100" : "text-white/85"}`}
                >
                  {goal.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted/50">
                  {goal.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* privacy */}
      <section className="card mt-4 p-6">
        <p className="eyebrow">Data &amp; privacy</p>
        <ul className="mt-4 space-y-3">
          {[
            ["Your photo", "Decoded in this tab, measured, then discarded. Never uploaded."],
            ["Saved scans", "Date, scores and six ratios. Numbers and text only."],
            ["Routine", "Checkbox state and streak dates."],
            ["Nothing else", "No analytics, no cookies, no third-party requests."],
          ].map(([title, detail]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold-400/70" />
              <span>
                <span className="block text-[12px] text-white/80">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted/50">
                  {detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* clear data */}
      <section className="mt-4 rounded-card border border-red-400/20 bg-red-500/[0.04] p-6">
        <p className="text-[10px] uppercase tracking-[0.26em] text-red-200/70">
          Danger zone
        </p>
        <h2 className="mt-3 font-display text-xl text-white/95">Clear all data</h2>
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-muted/60">
          Deletes every saved scan, your routine state, name and acknowledgement from
          this browser. This cannot be undone.
        </p>

        {cleared ? (
          <p className="mt-5 text-[12px] text-emerald-300/85">
            Everything cleared. Aureline is back to a blank slate.
          </p>
        ) : confirmClear ? (
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={wipe}
              className="rounded-full border border-red-400/50 bg-red-500/15 px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-red-100"
            >
              Yes, delete everything
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="mt-5 rounded-full border border-red-400/35 px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-red-200/85 transition-colors hover:bg-red-500/10"
          >
            Clear data
          </button>
        )}
      </section>

      {/* disclaimer */}
      <section className="mt-4 rounded-card border border-white/[0.06] px-6 py-6">
        <p className="eyebrow">Disclaimer</p>
        <p className="mt-4 text-[12px] leading-relaxed text-muted/65">
          Aureline is an AI estimate for fun and self improvement, not a medical or
          psychological assessment. It is intended for adults 18 and over. Scores
          describe a single photograph under a single light — they are not a statement
          about your health, your age, your ethnicity, or your worth. If appearance
          concerns are affecting how you feel day to day, please speak to a qualified
          professional.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link to="/scan" className="btn-gold">
            New scan
          </Link>
          <Link to="/history" className="btn-ghost">
            View history
          </Link>
        </div>
      </section>
    </div>
  );
}
