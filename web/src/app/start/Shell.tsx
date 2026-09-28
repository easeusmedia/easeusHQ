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
          <Lines />
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

          <p className="relative mt-10 text-xs text-muted/70">Easeus Media: your New Age Media Distribution Partner. (Yes, technically an agency. We just don&apos;t act like one.)</p>
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

// Drawn, not photographed: fine lines leaning in like a façade seen from
// below, a soft blue light rising behind them and a little grain. It fills
// the top of the panel and fades out before the words, so they stay calm.
function Lines() {
  const grain =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";
  const fade = "linear-gradient(to bottom, transparent 0%, black 22%, black 48%, transparent 72%)";
  return (
    // three-quarter strength: present, but a texture rather than a feature
    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-75">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(80% 45% at 50% 30%, rgba(75,149,230,0.22) 0%, rgba(75,149,230,0.06) 45%, transparent 70%)" }}
      />
      <div
        className="absolute -inset-x-1/4 top-[-12%] bottom-[30%] origin-bottom"
        style={{
          background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.075) 0 1px, transparent 1px 18px)",
          transform: "perspective(900px) rotateX(24deg)",
          maskImage: fade,
          WebkitMaskImage: fade,
        }}
      />
      <div className="absolute inset-0 opacity-[0.14] mix-blend-overlay" style={{ backgroundImage: grain }} />
    </div>
  );
}
