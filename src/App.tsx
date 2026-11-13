import { Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import Home from "./pages/Home";
import Scan from "./pages/Scan";
import Result from "./pages/Result";
import Routine from "./pages/Routine";
import History from "./pages/History";
import Profile from "./pages/Profile";

/**
 * App shell: ambient light, the nav, the route outlet, the footer.
 * Everything that was in app/layout.tsx lives here now.
 */
export default function App() {
  return (
    <>
      {/* Ambient light: two soft gold pools, fixed behind everything. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.11),transparent_65%)] blur-2xl" />
        <div className="absolute -right-52 top-1/3 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.07),transparent_68%)] blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-ink-950 to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-dvh flex-col">
        <Nav />
        <main className="flex-1 pb-28 md:pb-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/scan" element={<Scan />} />
            <Route path="/result" element={<Result />} />
            <Route path="/routine" element={<Routine />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>

        <footer className="border-t border-white/[0.06] px-5 py-10 sm:px-8 md:pb-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-[11px] leading-relaxed text-muted/60">
              Aureline is an AI estimate for fun and self improvement. It is not a
              medical, psychological, or diagnostic assessment. For adults 18 and over.
              Your photo is processed in your browser and never uploaded.
            </p>
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted/40">
              © {new Date().getFullYear()} Aureline
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
