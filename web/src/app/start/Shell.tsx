import Image from "next/image";
import { FileText, PenLine, UserRound, type LucideIcon } from "lucide-react";

// The frame every /start page sits in: one stroked dark card on the app's
// own dark ground — how it works on the left (desktop only), the page itself
// on the right. step: where the client is, lit on the left.
const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: UserRound, title: "Your details", body: "Who you are, and who signs." },
  { Icon: FileText, title: "Your agreement", body: "We prepare it from what you share." },
  { Icon: PenLine, title: "Sign online", body: "Adobe emails it to you to sign securely." },
];

export function Shell({ children, step = 1 }: { children: React.ReactNode; step?: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex min-h-dvh w-full items-stretch justify-center bg-background text-foreground lg:items-center lg:p-10">
      <div className="panel flex w-full max-w-[1120px] rounded-none lg:min-h-[640px] lg:rounded-[28px] lg:p-2.5">
        <aside className="relative hidden w-[44%] shrink-0 flex-col overflow-hidden rounded-[20px] panel-soft p-8 lg:flex">
          <Everest />
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

        <div className="flex min-w-0 flex-1 flex-col px-6 py-8 sm:px-10 lg:px-16 lg:py-12">
          {/* on a phone the left side is gone, so the name comes along here */}
          <div className="mb-10 flex items-center gap-2 lg:hidden">
            <Image src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" priority />
            <span className="text-[13px] font-medium tracking-tight">Easeus Media</span>
          </div>
          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Everest at night, drawn rather than photographed: the far range, the
// massif and Lhotse beside it, Nuptse's long wall in front, all dark; the
// ridge line lit in the app's blue, brightest at the summit, with a soft
// light rising behind it and a little grain. It fills the top of the panel
// and fades out before the words, so they stay calm.
const RIDGE = "M96 400 L160 334 L200 302 L232 276 L260 240 L284 200 L300 162 L318 112 L332 134 L348 158 L366 170 L388 150 L410 176 L440 206 L474 240 L508 276 L546 312 L600 350";
const NUPTSE = "M0 352 L52 322 L104 300 L148 270 L176 256 L204 266 L238 292 L276 330 L318 372 L346 400";

function Everest() {
  const grain =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";
  const fade = "linear-gradient(to bottom, black 0%, black 58%, transparent 96%)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <svg
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 top-0 h-[64%] w-full"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <defs>
          <linearGradient id="ev-rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#18202c" />
            <stop offset="1" stopColor="#0c0f14" />
          </linearGradient>
          <linearGradient id="ev-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#141a24" />
            <stop offset="1" stopColor="#0e1218" />
          </linearGradient>
          <linearGradient id="ev-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#121822" />
            <stop offset="1" stopColor="#0b0e13" />
          </linearGradient>
          <radialGradient id="ev-edge" cx="318" cy="112" r="300" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#cfe2ff" stopOpacity="0.95" />
            <stop offset="0.3" stopColor="#4b95e6" stopOpacity="0.7" />
            <stop offset="1" stopColor="#4b95e6" stopOpacity="0.08" />
          </radialGradient>
          <radialGradient id="ev-halo" cx="318" cy="130" r="190" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#4b95e6" stopOpacity="0.35" />
            <stop offset="1" stopColor="#4b95e6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ev-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a9c6ee" stopOpacity="0.22" />
            <stop offset="1" stopColor="#a9c6ee" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ev-near-edge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8fb4e6" stopOpacity="0.05" />
            <stop offset="0.6" stopColor="#8fb4e6" stopOpacity="0.35" />
            <stop offset="1" stopColor="#8fb4e6" stopOpacity="0.08" />
          </linearGradient>
          <filter id="ev-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        {/* the light behind the summit, and a few stars */}
        <circle cx="318" cy="130" r="190" fill="url(#ev-halo)" />
        <g fill="#dbe8ff">
          <circle cx="92" cy="58" r="0.9" opacity="0.5" />
          <circle cx="168" cy="96" r="0.7" opacity="0.35" />
          <circle cx="452" cy="64" r="0.9" opacity="0.45" />
          <circle cx="530" cy="120" r="0.7" opacity="0.3" />
          <circle cx="232" cy="40" r="0.6" opacity="0.3" />
          <circle cx="398" cy="34" r="0.7" opacity="0.4" />
        </g>
        {/* the far range */}
        <path
          d="M0 268 L46 246 L84 258 L132 214 L166 230 L204 204 L236 222 L262 212 L300 240 L340 226 L380 238 L420 208 L456 228 L500 194 L546 226 L600 210 L600 400 L0 400 Z"
          fill="url(#ev-far)"
          stroke="#8fb4e6"
          strokeOpacity="0.16"
        />
        {/* Everest and Lhotse, their snow, and the faces fading as they fall */}
        <path d={`${RIDGE} L600 400 Z`} fill="url(#ev-rock)" />
        <path d="M318 112 L332 134 L322 150 L312 142 L300 162 Z" fill="#cfe2ff" opacity="0.07" />
        <path d="M388 150 L400 164 L392 172 L381 160 Z" fill="#cfe2ff" opacity="0.05" />
        <g stroke="url(#ev-face)" strokeWidth="0.9" fill="none">
          <path d="M318 112 L308 176 L296 236" />
          <path d="M318 112 L334 170 L344 220" />
          <path d="M388 150 L384 196 L392 236" />
        </g>
        {/* the ridge, lit: a soft glow under a fine line */}
        <path d={RIDGE} fill="none" stroke="url(#ev-edge)" strokeWidth="5" opacity="0.45" filter="url(#ev-soft)" />
        <path d={RIDGE} fill="none" stroke="url(#ev-edge)" strokeWidth="1.2" strokeLinejoin="round" />
        {/* Nuptse, the long wall in front */}
        <path d={`${NUPTSE} L0 400 Z`} fill="url(#ev-near)" />
        <path d={NUPTSE} fill="none" stroke="url(#ev-near-edge)" strokeLinejoin="round" />
      </svg>
      <div className="absolute inset-0 opacity-[0.14] mix-blend-overlay" style={{ backgroundImage: grain }} />
    </div>
  );
}
