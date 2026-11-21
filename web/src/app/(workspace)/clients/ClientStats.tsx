"use client";

import { useRef, useState } from "react";
import { ChevronRight, CircleCheck, Clapperboard, ListChecks, X, type LucideIcon } from "lucide-react";
import { StatTile } from "../StatTile";
import { PrefetchLink } from "../PrefetchLink";
import { closeOnBackdrop } from "../dialog";

// What a tile opens to: each one a link straight to it, with its cover (a
// project) or its stage (a task)
export type StatItem = { id: string; title: string; sub?: string; href: string; cover?: string | null; pill?: { label: string; className: string } };

// The numbers the daily client review actually asks for, big enough to read
// at a glance. Each opens a window of what it counts, and each of those
// opens itself (Abhishek, 21 Nov 2026). The client's own page leaves out
// the tasks (20 Oct 2026: they see projects and files, never the work). No
// Unpaid tile (21 Nov 2026): what's paid shows on each invoice under Projects.
export function ClientStats({ activeTasks, inProgress, delivered }: { activeTasks?: StatItem[]; inProgress: StatItem[]; delivered: StatItem[] }) {
  return (
    // a phone: one under another, so no label is cut short and none sits alone
    <div className={`grid gap-3 max-sm:grid-cols-1 ${activeTasks === undefined ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
      {activeTasks !== undefined && <OpeningTile label="Active tasks" Icon={ListChecks} items={activeTasks} />}
      <OpeningTile label="Projects in progress" Icon={Clapperboard} items={inProgress} />
      <OpeningTile label="Projects delivered" Icon={CircleCheck} tone="emerald" items={delivered} />
    </div>
  );
}

function OpeningTile({ label, Icon, tone, items }: { label: string; Icon: LucideIcon; tone?: "emerald"; items: StatItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // nothing to open at zero
  if (!items.length) return <StatTile label={label} value={0} Icon={Icon} tone={tone} />;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className="block w-full rounded-2xl text-left outline-none! transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-accent/50 motion-safe:hover:-translate-y-0.5"
      >
        <StatTile label={label} value={items.length} Icon={Icon} tone={tone} />
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        {...closeOnBackdrop}
        aria-label={label}
        className="glass fixed top-1/2 left-1/2 m-0 flex max-h-[min(36rem,calc(100vh-4rem))] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl p-0 text-foreground"
      >
        {open && (
          <div className="pop-in flex min-h-0 flex-col">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
              <span className={`flex size-8 items-center justify-center rounded-lg ${tone === "emerald" ? "badge-lit emerald" : "badge-lit"}`}>
                <Icon size={15} />
              </span>
              <h2 className="text-base font-semibold tracking-tight">
                {label} <span className="ml-1 font-normal text-muted tabular-nums">{items.length}</span>
              </h2>
              <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="ml-auto rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <ul className="min-h-0 overflow-y-auto overscroll-contain p-2">
              {items.map((it) => (
                <li key={it.id}>
                  <PrefetchLink
                    href={it.href}
                    onClick={() => dialog.current?.close()}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
                  >
                    {it.cover !== undefined && (
                      <span className="aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-surface-2">
                        {it.cover && (
                          // eslint-disable-next-line @next/next/no-img-element -- a local file under public/, already downscaled
                          <img src={it.cover} alt="" className="h-full w-full object-cover" />
                        )}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{it.title}</span>
                      {it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}
                    </span>
                    {it.pill && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${it.pill.className}`}>{it.pill.label}</span>}
                    <ChevronRight size={15} className="shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </PrefetchLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </dialog>
    </>
  );
}
