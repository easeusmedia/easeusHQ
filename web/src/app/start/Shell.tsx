import Image from "next/image";
import { FileText, PenLine, UserRound, type LucideIcon } from "lucide-react";

// The frame every /start page sits in: one stroked dark card on the app's
// own dark ground, in two even halves — how it works on the left (desktop
// only), the page itself on the right. step: where the client is, lit on
// the left.
const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: UserRound, title: "Your details", body: "Who you are, and who signs." },
  { Icon: FileText, title: "Your agreement", body: "We prepare it from what you share." },
  { Icon: PenLine, title: "Sign online", body: "Adobe emails it to you to sign securely." },
];

export function Shell({ children, step = 1 }: { children: React.ReactNode; step?: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex min-h-dvh w-full items-stretch justify-center bg-background text-foreground lg:items-center lg:p-10">
      <div className="panel flex w-full max-w-[1120px] rounded-none lg:min-h-[640px] lg:rounded-[28px] lg:p-2.5">
        <aside className="relative hidden w-1/2 shrink-0 flex-col overflow-hidden rounded-[20px] panel-soft p-9 lg:flex">
          <Eclipse />
          <div className="relative flex items-center gap-2">
            <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" priority />
            <span className="text-[13px] font-medium tracking-tight">Easeus Media</span>
          </div>

          <div className="relative mt-auto">
            <p className="text-[22px] font-medium leading-snug tracking-tight">Great content starts with a clear agreement.</p>
            <p className="mt-2 text-sm text-muted">Tell us who you are. We&apos;ll handle the rest.</p>

            <ol className="mt-8 flex flex-col gap-4">
              {STEPS.map(({ Icon, title, body }, i) => {
                const n = i + 1;
                const done = n < step;
                const now = n === step;
                return (
                  <li key={title} className="flex items-center gap-3.5">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                        now ? "badge-lit" : done ? "badge-lit emerald" : "badge"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm ${now || done ? "text-foreground" : "text-muted"}`}>{title}</span>
                      <span className="block text-xs text-muted">{body}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="relative mt-10 text-xs text-muted/70">Easeus Media: Your New Age Media Distribution Partner.</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
          {/* on a phone the left side is gone, so the name comes along here */}
          <div className="mb-10 flex items-center gap-2 lg:hidden">
            <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" priority />
            <span className="text-[13px] font-medium tracking-tight">Easeus Media</span>
          </div>
          <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Drawn, not photographed: a dark sphere caught at the edge of the light,
// its rim lit in the app's blue and brightest at the top, a soft bloom
// around it, a haze just inside the edge, and one fine orbit passing behind
// and in front. It fills the top of the panel and fades out before the
// words, so they stay calm.
function Eclipse() {
  const grain =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";
  const fade = "linear-gradient(to bottom, black 0%, black 55%, transparent 95%)";
  const orbit = { cx: 300, cy: 262, rx: 286, ry: 52 };
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 top-0 h-[64%] w-full"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <defs>
          <radialGradient id="ec-bloom" cx="300" cy="330" r="300" gradientUnits="userSpaceOnUse">
            <stop offset="0.5" stopColor="#4b95e6" stopOpacity="0" />
            <stop offset="0.66" stopColor="#4b95e6" stopOpacity="0.32" />
            <stop offset="1" stopColor="#4b95e6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ec-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef4ff" />
            <stop offset="0.18" stopColor="#7db3f2" />
            <stop offset="0.5" stopColor="#4b95e6" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ec-body" cx="300" cy="150" r="380" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1a2536" />
            <stop offset="0.55" stopColor="#0f141c" />
            <stop offset="1" stopColor="#0a0d12" />
          </radialGradient>
          <clipPath id="ec-inside">
            <circle cx="300" cy="330" r="190" />
          </clipPath>
          {/* the orbit's near half: below its own centre line */}
          <clipPath id="ec-near">
            <rect x="-100" y={orbit.cy} width="800" height="200" />
          </clipPath>
          <filter id="ec-blur8" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="ec-blur16" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>
        <circle cx="300" cy="330" r="300" fill="url(#ec-bloom)" />
        <g fill="#dbe8ff">
          <circle cx="96" cy="70" r="0.9" opacity="0.45" />
          <circle cx="170" cy="120" r="0.7" opacity="0.3" />
          <circle cx="470" cy="52" r="0.9" opacity="0.4" />
          <circle cx="520" cy="140" r="0.7" opacity="0.28" />
          <circle cx="246" cy="36" r="0.6" opacity="0.3" />
          <circle cx="386" cy="92" r="0.6" opacity="0.25" />
        </g>
        <g transform={`rotate(-7 ${orbit.cx} ${orbit.cy})`}>
          <ellipse {...orbit} fill="none" stroke="#8fb4e6" strokeOpacity="0.13" />
        </g>
        <circle cx="300" cy="330" r="190" fill="url(#ec-body)" />
        <g clipPath="url(#ec-inside)">
          <circle cx="300" cy="330" r="190" fill="none" stroke="#4b95e6" strokeOpacity="0.35" strokeWidth="36" filter="url(#ec-blur16)" />
        </g>
        <circle cx="300" cy="330" r="190" fill="none" stroke="url(#ec-rim)" strokeWidth="7" filter="url(#ec-blur8)" opacity="0.75" />
        <circle cx="300" cy="330" r="190" fill="none" stroke="url(#ec-rim)" strokeWidth="1.3" />
        <g transform={`rotate(-7 ${orbit.cx} ${orbit.cy})`}>
          <ellipse {...orbit} fill="none" stroke="#8fb4e6" strokeOpacity="0.2" clipPath="url(#ec-near)" />
        </g>
      </svg>
      <div className="absolute inset-0 opacity-[0.14] mix-blend-overlay" style={{ backgroundImage: grain }} />
    </div>
  );
}
