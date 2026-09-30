import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { chartSpans, dayOf, partMax, periodFrom } from "@/lib/editorKpi";
import { Avatar } from "../TaskCard";
import { Delta, GradeBadge, PartScore, PeriodBar, Total } from "./ui";
import { TeamChart } from "./charts";
import { SyncFrameio } from "./SyncFrameio";
import { firstDay, loadPerformance, loadScoring } from "./data";
import { AGAINST, facts, periodQuery } from "./shared";

export const dynamic = "force-dynamic";

// The editors at a glance, for core: each one's grade and total out of 10
// for the week, month or stretch chosen, and its three parts, with every
// editor's score over time on one chart. An editor who comes here is
// taken to their own.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect(`/performance/${me.id}`);

  const q = await searchParams;
  const today = dayOf(new Date());
  const [scoring, first] = await Promise.all([loadScoring(), q.view === "all" ? firstDay() : undefined]);
  const period = periodFrom(q, today, first);
  const spans = chartSpans(period);
  const data = await loadPerformance({ from: [period.prev.from, spans[0].from, period.from].sort()[0] });
  const query = periodQuery(period);
  const max = partMax(scoring);

  const cards = data.editors.map((e) => ({
    e,
    now: data.score(period.from, period.to, e.id),
    before: period.kind === "all" ? null : data.score(period.prev.from, period.prev.to, e.id),
    series: spans.map((s) => data.score(s.from, s.to, e.id).total),
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
            {cards.map((c) => {
              const f = facts(c.now);
              return (
                <li key={c.e.id} className="min-w-0">
                  <Link href={`/performance/${c.e.id}${query ? `?${query}` : ""}`} className="flex h-full flex-col gap-6 rounded-2xl panel-soft panel-hover p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={c.e.name} size={44} presence={false} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-base font-medium">{c.e.name}</span>
                          <Delta now={c.now.total} before={c.before?.total ?? null} against={AGAINST[period.kind]} />
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Total total={c.now.total} grade={c.now.grade} />
                        <GradeBadge grade={c.now.grade} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:gap-6">
                      <PartScore part="quantity" value={c.now.quantity} max={max.quantity} fact={f.quantity} />
                      <PartScore part="quality" value={c.now.quality} max={max.quality} fact={f.quality} />
                      <PartScore part="feedback" value={c.now.feedback} max={max.feedback} fact={f.feedback} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
            <h2 className="mb-4 text-base font-semibold">Week by week</h2>
            <TeamChart series={cards.map((c) => ({ name: c.e.name, values: c.series }))} spans={spans} />
          </section>
        </>
      )}
    </div>
  );
}
