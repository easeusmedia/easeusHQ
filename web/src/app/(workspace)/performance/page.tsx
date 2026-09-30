import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Repeat2, Settings2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { dayOf, GRADE_LABEL, partMax, periodFrom, trendSpans } from "@/lib/editorKpi";
import { Avatar } from "../TaskCard";
import { Delta, GradeBadge, PartScore, PeriodBar, Total } from "./ui";
import { TeamChart } from "./charts";
import { SyncFrameio } from "./SyncFrameio";
import { loadPerformance, loadScoring, repeatedMistakes } from "./data";
import { AGAINST, periodQuery, qualityLines, quantityLines, ratingLines } from "./shared";

export const dynamic = "force-dynamic";

// The editors at a glance, for core: each one's grade and total out of 10
// for the day, week, month or range chosen, whether it's up or down on the
// one before, its three parts and the mistake they repeat most, with every
// editor's total week by week on one chart. An editor who comes here is
// taken to their own.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect(`/performance/${me.id}`);

  const today = dayOf(new Date());
  const scoring = await loadScoring();
  const period = periodFrom(await searchParams, today);
  const spans = trendSpans(period.kind === "range" ? "week" : period.kind, period.to, period.kind === "month" ? 6 : 10);
  const data = await loadPerformance({ from: [period.prev.from, spans[0].from, period.from].sort()[0] });
  const query = periodQuery(period);
  const max = partMax(scoring);
  const unit = period.kind === "month" ? "Month" : "Week";

  const cards = data.editors.map((e) => {
    const now = data.score(period.from, period.to, e.id);
    const before = data.score(period.prev.from, period.prev.to, e.id);
    return {
      e,
      now,
      before,
      series: spans.map((s) => data.score(s.from, s.to, e.id).total),
      top: repeatedMistakes(data.feedback, period.from, period.to, e.id).find((r) => r.repeats > 0),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
        <div className="mr-auto pr-4">
          <h1 className="text-2xl font-semibold tracking-tight">Editor performance</h1>
          <p className="mt-1.5 text-sm text-muted">Graded A+ to D, out of 10: Quantity, Quality and Rating, week by week.</p>
        </div>
        <SyncFrameio />
        <Link href="/performance/settings" className="btn btn-ghost flex items-center gap-1.5">
          <Settings2 size={14} /> Settings
        </Link>
        <PeriodBar period={period} today={today} />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No editors on the team yet.</p>
      ) : (
        <>
          <ul className="grid gap-4 lg:grid-cols-2">
            {cards.map((c) => (
              <li key={c.e.id}>
                <Link href={`/performance/${c.e.id}${query ? `?${query}` : ""}`} className="flex h-full flex-col gap-5 rounded-2xl panel-soft panel-hover p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={c.e.name} size={40} presence={false} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.e.name}</span>
                        <Delta now={c.now.total} before={c.before.total} against={AGAINST[period.kind]} />
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Total total={c.now.total} />
                        <p className="text-xs text-muted">{c.now.grade ? GRADE_LABEL[c.now.grade] : "Nothing to score"}</p>
                      </div>
                      <GradeBadge grade={c.now.grade} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-5">
                    <PartScore part="quantity" value={c.now.quantity} max={max.quantity} lines={quantityLines(c.now).slice(0, 1)} />
                    <PartScore part="quality" value={c.now.quality} max={max.quality} lines={qualityLines(c.now).slice(0, 1)} />
                    <PartScore part="rating" value={c.now.rating} max={max.rating} lines={ratingLines(c.now).slice(0, 1)} />
                  </div>
                  {c.top ? (
                    <p className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3 text-xs">
                      <Repeat2 size={13} className="shrink-0 text-rose-300" />
                      <span className="text-muted">Keeps repeating:</span>
                      <span className="text-foreground/85">
                        {c.top.category}, {c.top.count} times on {c.top.videos} video{c.top.videos === 1 ? "" : "s"}
                      </span>
                    </p>
                  ) : c.now.mistakes === 0 && c.now.completed > 0 ? (
                    <p className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted">
                      <CircleCheck size={13} className="shrink-0 text-accent" /> No mistakes this period.
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
            <h2 className="text-sm font-semibold">
              {unit} by {unit.toLowerCase()}
            </h2>
            <p className="mt-0.5 mb-4 text-xs text-muted">Each editor&apos;s total out of 10. The dashed lines are where each grade starts.</p>
            <TeamChart series={cards.map((c) => ({ name: c.e.name, values: c.series }))} labels={spans.map((s) => s.label)} grades={scoring.grades} />
          </section>
        </>
      )}

      <p className="text-xs text-muted">
        Each week is scored on its own: Output {scoring.outputPoints} and Speed {scoring.speedPoints} make Quantity, then Quality {scoring.qualityPoints} and Rating {scoring.ratingPoints}, 10 in all. A
        month is the average of its weeks. A+ from {scoring.grades["A+"]}, A from {scoring.grades.A}, B from {scoring.grades.B}, C from {scoring.grades.C}, D below.
      </p>
    </div>
  );
}
