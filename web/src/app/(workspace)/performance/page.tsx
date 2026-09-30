import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, Repeat2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { dayOf, periodFrom, trendSpans } from "@/lib/editorKpi";
import { Avatar } from "../TaskCard";
import { Delta, PartScore, PeriodBar, Settings, Total, TrendStrip } from "./ui";
import { SyncFrameio } from "./SyncFrameio";
import { loadPerformance, loadScoring, repeatedMistakes } from "./data";
import { AGAINST, feedbackLines, periodQuery, qualityLines, quantityLines } from "./shared";

export const dynamic = "force-dynamic";

// The editors at a glance, for core: each one's scorecard for the day,
// week, month or range chosen: Quantity, Quality and Feedback out of 5,
// the total, whether it's up or down on the one before, and the mistake
// they repeat most. An editor who comes here is taken to their own.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect(`/performance/${me.id}`);

  const today = dayOf(new Date());
  const scoring = await loadScoring();
  const period = periodFrom(await searchParams, today, scoring.workDays);
  const spans = trendSpans(period.kind === "range" ? "week" : period.kind, period.to, period.kind === "day" ? 12 : 6, scoring.workDays);
  const [data, kinds] = await Promise.all([
    loadPerformance({ from: [period.prev.from, spans[0].from, period.from].sort()[0] }),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const query = periodQuery(period);

  const cards = data.editors.map((e) => {
    const now = data.score(period.from, period.to, e.id);
    const before = data.score(period.prev.from, period.prev.to, e.id);
    return {
      e,
      now,
      before,
      series: spans.map((s) => data.score(s.from, s.to, e.id).pct),
      top: repeatedMistakes(data.feedback, period.from, period.to, e.id).find((r) => r.repeats > 0),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
        <div className="mr-auto pr-4">
          <h1 className="text-2xl font-semibold tracking-tight">Editor performance</h1>
          <p className="mt-1.5 text-sm text-muted">Quantity, Quality and Feedback, five points each.</p>
        </div>
        <SyncFrameio />
        <Settings scoring={data.scoring} kinds={kinds.map((k) => k.name)} categories={data.categories} canScore={canEditPeople(me)} />
        <PeriodBar period={period} today={today} workDays={scoring.workDays} />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No editors on the team yet.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <li key={c.e.id}>
              <Link href={`/performance/${c.e.id}${query ? `?${query}` : ""}`} className="flex h-full flex-col gap-5 rounded-2xl panel-soft panel-hover p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={c.e.name} size={40} presence={false} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.e.name}</span>
                      <Delta now={c.now} before={c.before} against={AGAINST[period.kind]} />
                    </span>
                  </div>
                  <div className="flex items-end gap-4">
                    <TrendStrip values={c.series} labels={spans.map((s) => s.label)} height={32} />
                    <Total total={c.now.total} max={c.now.max} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-5">
                  <PartScore part="quantity" value={c.now.quantity} lines={quantityLines(c.now).slice(0, 1)} />
                  <PartScore part="quality" value={c.now.quality} lines={qualityLines(c.now).slice(0, 1)} />
                  <PartScore part="feedback" value={c.now.feedback} lines={feedbackLines(c.now).slice(0, 1)} />
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
      )}

      <p className="text-xs text-muted">
        Quantity: {scoring.volumePoints} points for reels completed against {scoring.reelsPerDay} a working day, {5 - scoring.volumePoints} for moving each from Editing to Sent for approval in time. Quality: 5, less a
        point for each mistake a video (repeats count {scoring.repeatWeight}×). Feedback: starts at {scoring.feedbackStart}, praise adds, negative feedback takes away; with none, the score is out of 10.
      </p>
    </div>
  );
}
