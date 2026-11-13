import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/scan", label: "Scan" },
  { href: "/result", label: "Result" },
  { href: "/routine", label: "Routine" },
  { href: "/history", label: "History" },
  { href: "/profile", label: "Profile" },
] as const;

/* Mobile bar keeps to the five routes a thumb actually needs. */
const MOBILE_LINKS = [
  { href: "/", label: "Home", icon: IconHome },
  { href: "/scan", label: "Scan", icon: IconScan },
  { href: "/routine", label: "Routine", icon: IconRoutine },
  { href: "/history", label: "History", icon: IconHistory },
  { href: "/profile", label: "Profile", icon: IconProfile },
] as const;

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="Aureline home">
      <span className="relative grid h-8 w-8 place-items-center rounded-full border border-gold-400/40 bg-gradient-to-br from-gold-400/25 to-transparent">
        <span className="font-display text-[13px] leading-none text-gold-200">A</span>
        <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[17px] tracking-[0.14em] text-white/95">
            AURELINE
          </span>
          <span className="mt-1 text-[8px] uppercase tracking-[0.34em] text-muted/70">
            Face Intelligence
          </span>
        </span>
      )}
    </Link>
  );
}

export default function Nav() {
  const { pathname } = useLocation();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-900/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`relative rounded-full px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-300 ${
                    active ? "text-gold-200" : "text-muted hover:text-white/85"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute inset-x-4 -bottom-0.5 h-px bg-gold-400/70" />
                  )}
                </Link>
              );
            })}
          </nav>
          <Link
            to="/scan"
            className="hidden rounded-full border border-gold-400/35 px-5 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-gold-200 transition-colors hover:bg-gold-400/10 md:inline-flex"
          >
            Start Scan
          </Link>
        </div>
      </header>

      <nav className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-900/85 backdrop-blur-2xl md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between px-3 pb-1 pt-2">
          {MOBILE_LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                to={href}
                className="group relative flex flex-1 flex-col items-center gap-1 py-1.5"
              >
                <Icon
                  className={`h-[18px] w-[18px] transition-colors duration-300 ${
                    active ? "text-gold-300" : "text-muted/70"
                  }`}
                />
                <span
                  className={`text-[9px] uppercase tracking-[0.14em] transition-colors duration-300 ${
                    active ? "text-gold-200" : "text-muted/60"
                  }`}
                >
                  {label}
                </span>
                {active && (
                  <span className="absolute -top-[9px] h-[2px] w-6 rounded-full bg-gold-400/80" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/* ------------------------------- icons -------------------------------- */
/* Hand-drawn 24px line icons — no icon package, no licence, consistent weight. */

type IconProps = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconHome({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V19a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}
function IconScan({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 12h8" />
    </svg>
  );
}
function IconRoutine({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 6.5h14M5 12h14M5 17.5h9" />
      <path d="M3 6.5h.01M3 12h.01M3 17.5h.01" />
    </svg>
  );
}
function IconHistory({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 7v5l3 2" />
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4.5V8h-3.5" />
    </svg>
  );
}
function IconProfile({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="9" r="3.4" />
      <path d="M5 19.5c1.4-3 4-4.5 7-4.5s5.6 1.5 7 4.5" />
    </svg>
  );
}
