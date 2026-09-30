import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { chartSpans, dayOf, periodFrom } from "@/lib/editorKpi";
import { LETTER_LABEL, PART_LABEL } from "@/lib/videoScore";
import { Avatar } from "../TaskCard";
import { Delta, GradeBadge, PeriodBar } from "./ui";
import { TeamChart } from "./charts";
import { SyncFrameio } from "./SyncFrameio";
import { firstDay, loadPerformance } from "./data";
import { AGAINST, periodQuery } from "./shared";
import { GRADE_STYLE } from "../gradeStyle";

export const dynamic = "force-dynamic";

// The editors at a glance, for core: each one's average letter from their
// videos over the week, month or stretch chosen, how many videos, how many
// made S and A+, their three parts, and everyone's weeks on one chart. An
// editor who comes here is taken to their own.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect(`/performance/${me.id}`);

  const q = await searchParams;
  const today = dayOf(new Date());
  const first = q.view === "all" ? await firstDay() : undefined;
  const period = periodFrom(q, today, first);
  const spans = chartSpans(period);
  const data = await loadPerformance({ from: [period.prev.from, spans[0].from, period.from].sort()[0] });
  const query = periodQuery(period);

  const cards = data.editors.map((e) => ({
    e,
    now: data.summary(period.from, period.to, e.id),
    before: period.kind === "all" ? null : data.summary(period.prev.from, period.prev.to, e.id),
    weeks: spans.map((s) => data.summary(s.from, s.to, e.id)),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <h1 className="mr-auto pr-4 text-2xl font-semibold tracking-tight">Editor performance</h1>
        <SyncFrameio />
        <Link href="/performance/settings" className="btn btn-ghost flex items-center gap-1.5">
          <Settings2 size={15} /> Settings
        </Link>
        <PeriodBar period={period} today={today} />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">No editors yet.</p>
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {cards.map(({ e, now, before }) => (
              <li key={e.id} className="min-w-0">
                <Link href={`/performance/${e.id}${query ? `?${query}` : ""}`} className="flex h-full flex-col gap-5 rounded-2xl panel-soft panel-hover p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={e.name} size={44} presence={false} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-base font-medium">{e.name}</span>
                        <span className="text-sm text-muted">
                          {now.videos} video{now.videos === 1 ? "" : "s"}
                        </span>
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="flex flex-col items-end">
                        <span className="text-base font-medium">{now.letter.overall ? LETTER_LABEL[now.letter.overall] : "No grade yet"}</span>
                        {now.overall !== null && <span className="text-sm tabular-nums text-muted">{now.overall}</span>}
                        <Delta now={now.overall} before={before?.overall ?? null} against={AGAINST[period.kind]} />
                      </span>
                      <GradeBadge grade={now.letter.overall} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
                    {(["quality", "efficiency", "client"] as const).map((p) => (
                      <span key={p} className="flex min-w-0 items-center gap-2">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold ${now.letter[p] ? GRADE_STYLE[now.letter[p]!] : "bg-foreground/[0.05] text-muted"}`}>{now.letter[p] ?? "–"}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-muted">{PART_LABEL[p]}</span>
                          {now[p] !== null && <span className="block text-sm tabular-nums">{now[p]}</span>}
                        </span>
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
            <h2 className="mb-4 text-base font-semibold">Week by week</h2>
            <TeamChart
              series={cards.map((c) => ({ name: c.e.name, values: c.weeks.map((w) => w.overall), letters: c.weeks.map((w) => w.letter.overall) }))}
              spans={spans}
              bands={data.scoring.bands}
              showScore
            />
          </section>
        </>
      )}
    </div>
  );
}
