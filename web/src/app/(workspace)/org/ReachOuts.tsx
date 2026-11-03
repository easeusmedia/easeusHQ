"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { toneOf, tracksOutreach, type FieldData, type LeadData, type StageData } from "@/lib/space";
import { LeadCard } from "./space/LeadCard";

// One outreach board with reach outs going on: its days, the leads on each
// (the latest to arrive first, five of them), as the board itself shows them
export type ReachOutBoard = {
  id: string;
  // "Doctors", "Dream 300 YouTube"
  portal: string;
  name: string;
  href: string;
  // its properties and stages, for the cards (the country, what's pinned,
  // and from Day 1 how it's going)
  fields: FieldData[];
  stages: Pick<StageData, "id" | "name" | "color">[];
  columns: { stage: StageData; count: number; leads: LeadData[] }[];
};

const COLUMN = "w-[15rem] shrink-0";
const QUIET_ROW = "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-foreground/[0.05] hover:text-foreground";

// Ongoing reach outs on the Sales home (Abhishek, 3 Nov 2026): every board
// where reaching out is going on, in the board's own look (a card for the
// board, a row of its days, each with its stage pill and its leads' cards),
// so on what day which leads are reads at a glance. A card opens its lead;
// Show more opens the board.
export function ReachOuts({ boards }: { boards: ReachOutBoard[] }) {
  const router = useRouter();
  if (!boards.length)
    return (
      <section className="rounded-2xl border border-white/[0.07] bg-foreground/[0.02] px-4 py-3">
        <p className="text-sm font-medium">Ongoing reach outs</p>
        <p className="mt-1 text-sm text-muted">No reach outs going on.</p>
      </section>
    );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {boards.map((b) => {
        const total = b.columns.reduce((n, c) => n + c.count, 0);
        const board = { stages: b.stages, messages: [], fields: b.fields };
        return (
          <section key={b.id} aria-label={`${b.portal} / ${b.name}`} className="min-w-0 rounded-2xl border border-white/[0.07] bg-foreground/[0.02]">
            <Link href={b.href} className="group flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition-colors hover:bg-white/[0.02]">
              <span className="text-muted">{b.portal}</span>
              <span className="text-muted/50">/</span>
              {b.name}
              <span className="rounded-full bg-white/[0.06] px-2 py-px text-xs font-normal text-muted tabular-nums">{total}</span>
              <ChevronRight size={15} className="ml-auto shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <div className="border-t border-white/[0.06]">
              {/* sideways, fading at the card's edges, as a board's row does */}
              <div className="overflow-x-auto px-4 pt-3 pb-4 [mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%_-_1rem),transparent)]">
                <div className="flex w-max items-start gap-3">
                  {b.columns.map((c) => {
                    const tone = toneOf(c.stage.color);
                    return (
                      <div key={c.stage.id} className={`${COLUMN} flex flex-col gap-2`}>
                        <div title={c.stage.name} className={`mist-tint flex h-8 min-w-0 items-center gap-2 rounded-full border pr-1 pl-2.5 text-xs font-medium ${tone.pill}`}>
                          <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
                          <span className="min-w-0 flex-1 truncate">{c.stage.name}</span>
                          <span className="shrink-0 px-1 text-muted tabular-nums">{c.count}</span>
                        </div>
                        <div className="flex min-h-24 min-w-0 flex-col gap-2">
                          {c.leads.map((l) => (
                            <LeadCard key={l.id} lead={l} board={board} onOpen={(id) => router.push(`${b.href}&lead=${id}`)} tracks={tracksOutreach(b.stages, l)} />
                          ))}
                          {c.count > c.leads.length && (
                            <Link href={b.href} className={QUIET_ROW}>
                              Show more
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
