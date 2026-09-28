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
          {/* one soft wash of the accent in the corner, as on a lit card */}
          <div className="glass-glow" />
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

          <p className="relative mt-10 text-xs text-muted/70">Easeus Media: video for people worth listening to.</p>
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
