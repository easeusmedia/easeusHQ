import Image from "next/image";
import { FileText, PenLine, UserRound, type LucideIcon } from "lucide-react";
import { SCENE, SUMMIT_RIDGE } from "./everestRidge";

// The frame every /start page sits in, over Everest before dawn: the
// mountain fills the screen (the goal we help clients reach: the top), and
// a glass card sits on it in two even halves. On the left, a clear window
// onto the peak and how this works (desktop only); on the right, the page
// itself on dark frosted glass that blurs the range behind it. step: where
// the client is, lit on the left.
const STEPS: { Icon: LucideIcon; title: string; body: string }[] = [
  { Icon: UserRound, title: "Your details", body: "Who you are, and who signs." },
  { Icon: FileText, title: "Your agreement", body: "We prepare it from what you share." },
  { Icon: PenLine, title: "Sign online", body: "Adobe emails it to you to sign securely." },
];

export function Shell({ children, step = 1 }: { children: React.ReactNode; step?: 1 | 2 | 3 | 4 }) {
  return (
    <div className="relative flex min-h-dvh w-full items-stretch justify-center bg-background text-foreground lg:items-center lg:p-10">
      <Scene />
      <div className="relative flex w-full max-w-[1120px] rounded-none border-white/10 bg-[#050a12]/30 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] lg:min-h-[640px] lg:rounded-[28px] lg:border lg:p-2.5">
        {/* the window: nothing between the peak and the eye but a shade
            at the foot, so the words there read */}
        <aside className="relative hidden w-1/2 shrink-0 flex-col overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-b from-transparent from-45% to-[#040810]/85 p-9 lg:flex">
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

        {/* dark frosted glass: the range goes soft behind the form */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#080c13]/80 px-6 py-8 backdrop-blur-2xl sm:px-10 lg:ml-2.5 lg:rounded-[20px] lg:border lg:border-white/[0.06] lg:px-12 lg:py-12">
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

// Everest before dawn, filling the screen (public/start/everest.webp, drawn
// by scripts/everest-scene.mjs), with a little life on top in the same
// frame so it lines up with the ridge: the light behind the summit breathes
// and a glint now and then travels the ridge over the top (globals.css,
// .ev-*; still for anyone who's asked for less motion). The summit sits in
// the left third, where the card's window is.
function Scene() {
  const { width, height } = SCENE;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none fixed inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id="sc-glow" cx="520" cy="300" r="260" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9cc8ff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#4b95e6" stopOpacity="0" />
        </radialGradient>
        <filter id="sc-soft" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <image href="/start/everest.webp" width={width} height={height} />
      <circle cx="520" cy="300" r="260" fill="url(#sc-glow)" className="ev-dawn" style={{ mixBlendMode: "screen" }} />
      {/* the glint: a short bright stretch of the ridge, carried over the summit */}
      <path d={SUMMIT_RIDGE} pathLength={1} fill="none" stroke="#dcebff" strokeWidth="8" strokeLinecap="round" strokeDasharray="0.06 0.94" filter="url(#sc-soft)" className="ev-sweep" />
      <path d={SUMMIT_RIDGE} pathLength={1} fill="none" stroke="#f4f8ff" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.03 0.97" className="ev-sweep" />
    </svg>
  );
}
