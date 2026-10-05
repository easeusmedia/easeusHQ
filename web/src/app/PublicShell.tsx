import Image from "next/image";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import type { LucideIcon } from "lucide-react";

// The frame for the pages anyone can read — home, privacy, terms: the name
// and the links along the top, the page, then who we are and how to reach us.
export function PublicShell({ current, children }: { current?: "privacy" | "terms"; children: React.ReactNode }) {
  const link = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${on ? "selected" : "border border-transparent text-muted hover:text-foreground"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 pt-6">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" priority />
          <span className="text-sm font-medium tracking-tight">Easeus Media</span>
        </Link>
        <nav className="flex items-center gap-1">
          {link("/privacy", "Privacy", current === "privacy")}
          {link("/terms", "Terms", current === "terms")}
          <Link href="/login" className="btn btn-sm btn-glow ml-2">
            Team sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-14">{children}</main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-6 text-xs text-muted">
        <span>© {new Date().getFullYear()} Easeus Media</span>
        <a href="mailto:easeus.media@gmail.com" className="hover:text-foreground">
          easeus.media@gmail.com
        </a>
      </footer>
    </div>
  );
}

export type Section = { id: string; title: string; Icon: LucideIcon; tint: string; body: React.ReactNode };

// A policy page: its title and date, a short list of its sections that
// stays in view on a wide screen, and each section as its own card.
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: Section[] }) {
  return (
    <>
      <div className="max-w-2xl">
        <span className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-muted">
          Last updated {updated}
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{intro}</p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-8">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted/70">On this page</p>
            <ul className="flex flex-col gap-1 border-l border-white/[0.08]">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-sm text-muted transition-colors hover:border-white/40 hover:text-foreground">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="flex flex-col gap-4">
          {sections.map(({ id, title: heading, Icon, tint, body }) => (
            <section key={id} id={id} className="panel scroll-mt-8 rounded-2xl p-6">
              <div className="flex items-center gap-3">
                {/* each section's icon in its own soft colour */}
                <span className="badge-lit flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ "--tint": tint } as React.CSSProperties}>
                  <Icon size={16} />
                </span>
                <h2 className="text-base font-medium">{heading}</h2>
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-foreground/85 [&_a]:text-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_b]:font-medium [&_b]:text-foreground [&_li]:pl-1 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
                {body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
