import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Repeat2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { addDays, dayOf, periodFrom, shortDay, trendSpans } from "@/lib/editorKpi";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { AddFeedbackButton, Delta, LeavePanel, MistakeList, PartScore, PeriodBar, PraiseList, Total, TrendStrip, type VideoRow, VideoTable } from "../ui";
import { loadPerformance, loadScoring, repeatedMistakes } from "../data";
import { AGAINST, feedbackLines, periodQuery, qualityLines, quantityLines } from "../shared";

export const dynamic = "force-dynamic";

// One editor's scorecard: the total and its three scores for the period,
// the mistakes they keep repeating, and everything behind it in tabs: the
// feedback on their work (each Frame.io comment with a picture of its
// frame), core's praise and negative feedback, their videos, and their
// history. Core can add feedback, re-sort any of it, set a video's type and
// record leave. An editor sees their own, the same but read-only.
export default async function EditorPerformancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const sessionId = await getSessionUserId();
  const me = sessionId ? await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, role: true } }) : null;
  if (!me) redirect("/login");
  // an editor sees only their own
  if (me.role === "employee" && me.id !== id) redirect(`/performance/${me.id}`);
  const canEdit = me.role !== "employee";

  const today = dayOf(new Date());
  const scoring = await loadScoring();
  const period = periodFrom(q, today, scoring.workDays);
  const spans = trendSpans(period.kind === "range" ? "week" : period.kind, period.to, period.kind === "day" ? 12 : period.kind === "month" ? 6 : 8, scoring.workDays);
  const [data, kinds] = await Promise.all([
    loadPerformance({ from: [period.prev.from, spans[0].from, period.from].sort()[0], editorId: id }),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const editor = data.editors[0];
  if (!editor) notFound();

  const now = data.score(period.from, period.to, id);
  const before = data.score(period.prev.from, period.prev.to, id);
  const history = spans.map((s) => ({ ...s, k: data.score(s.from, s.to, id) }));
  const repeated = repeatedMistakes(data.feedback, period.from, period.to, id);

  const inPeriod = data.feedback.filter((e) => e.day >= period.from && e.day <= period.to);
  const mistakes = inPeriod.filter((e) => e.kind === "mistake" || e.kind === "praise" || e.kind === "note");
  const praise = inPeriod.filter((e) => e.kind === "positive" || e.kind === "negative");
  const videos: VideoRow[] = data.videos
    .filter((v) => v.completedDay && v.completedDay >= period.from && v.completedDay <= period.to)
    .sort((a, b) => (b.completedDay ?? "").localeCompare(a.completedDay ?? ""))
    .map((v) => ({
      id: v.id,
      title: v.title,
      where: [v.client, v.project].filter(Boolean).join(" · "),
      type: v.type,
      guessed: v.guessed,
      completed: v.completedDay,
      editHours: v.editHours,
      standardHours: v.standardHours,
      withinStandard: v.withinStandard,
      revisions: v.internalRevisions + v.clientRevisions,
      excluded: v.excluded,
    }));
  const open = data.open.filter((t) => t.assignedToId === id);
  const tasks = [...new Map([...open, ...data.videos].map((t) => [t.id, { id: t.id, title: t.title }])).values()];
  const leave = data.leave.filter((l) => l.day >= addDays(today, -120)).map((l) => ({ id: l.id, day: l.day, note: l.note }));
  const dialog = { editorId: id, tasks, categories: data.categories, scoring: data.scoring, today };

  const query = periodQuery(period);
  const card = "rounded-2xl border border-border bg-surface-2/30 p-5";
  const HISTORY_ROW = "grid grid-cols-[minmax(0,1fr)_4.5rem_4rem_4rem_4rem] items-center gap-3 px-4 sm:grid-cols-[minmax(0,1fr)_5rem_4.5rem_4.5rem_4.5rem_4rem_4.5rem]";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {canEdit && (
          <Link href={`/performance${query ? `?${query}` : ""}`} className="flex w-fit items-center gap-1.5 text-xs text-muted hover:text-foreground">
            <ArrowLeft size={13} /> Editor performance
          </Link>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={editor.name} size={48} presence={false} />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{canEdit ? editor.name : "My scorecard"}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {editor.jobTitle?.name ?? "Editor"} · {open.length} open now
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodBar period={period} today={today} workDays={scoring.workDays} />
            {canEdit && <AddFeedbackButton {...dialog} />}
          </div>
        </div>
      </div>

      <section className={`${card} grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]`}>
        <div className="flex flex-col justify-between gap-3 md:border-r md:border-border/60 md:pr-6">
          <div>
            <p className="text-xs text-muted">
              {period.current ? { day: "Today", week: "This week", month: "This month", range: period.label }[period.kind] : period.label}
              {period.current && period.kind !== "range" ? " so far" : ""}
            </p>
            <div className="mt-1">
              <Total total={now.total} max={now.max} size="lg" />
            </div>
            <div className="mt-1.5">
              <Delta now={now} before={before} against={AGAINST[period.kind]} />
            </div>
          </div>
          <TrendStrip values={history.map((h) => h.k.pct)} labels={history.map((h) => h.label)} height={40} />
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <PartScore part="quantity" value={now.quantity} lines={quantityLines(now)} />
          <PartScore part="quality" value={now.quality} lines={qualityLines(now)} />
          <PartScore part="feedback" value={now.feedback} lines={feedbackLines(now)} />
        </div>
      </section>

      <section className={card}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Repeat2 size={14} className="text-rose-300" /> Mistakes by category
        </h2>
        <p className="mt-0.5 text-xs text-muted">A repeat is the same kind of mistake again, on another video, within 90 days. It counts {scoring.repeatWeight}× against Quality.</p>
        {repeated.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No mistakes in this period.</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {repeated.map((r) => (
              <li key={r.category} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${r.repeats ? "border-rose-300/25 bg-rose-300/[0.04]" : "border-border bg-surface/40"}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.category}</span>
                  <span className="block text-xs text-muted">
                    {r.videos} video{r.videos === 1 ? "" : "s"} · last {shortDay(r.last)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-lg font-semibold tabular-nums">{r.count}</span>
                  {r.repeats > 0 && <span className="block text-[11px] text-rose-300">{r.repeats} repeated</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClientTabs
        width=""
        initialTab={q.tab}
        tabs={[
          { key: "mistakes", label: "Feedback on the work", count: mistakes.filter((e) => e.kind === "mistake").length, content: <MistakeList entries={mistakes} canEdit={canEdit} {...dialog} /> },
          { key: "feedback", label: "Praise and concerns", count: praise.length, content: <PraiseList entries={praise} canEdit={canEdit} {...dialog} /> },
          { key: "videos", label: "Videos", count: videos.length, content: <VideoTable rows={videos} types={kinds.map((k) => k.name)} canEdit={canEdit} /> },
          {
            key: "history",
            label: "History",
            content: (
              <div className="overflow-hidden rounded-2xl border border-border text-sm">
                <div className={`${HISTORY_ROW} py-2.5 text-xs text-muted`}>
                  <span>{{ day: "Day", week: "Week", month: "Month", range: "Week" }[period.kind]}</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Quantity</span>
                  <span className="text-right">Quality</span>
                  <span className="text-right">Feedback</span>
                  <span className="hidden text-right sm:block">Videos</span>
                  <span className="hidden text-right sm:block">Mistakes</span>
                </div>
                {[...history].reverse().map((h) => (
                  <div key={h.from} className={`${HISTORY_ROW} border-t border-border/50 py-2.5`}>
                    <span className="truncate">{h.label}</span>
                    <span className="text-right font-medium tabular-nums">
                      {h.k.total ?? "–"}
                      {h.k.total !== null && <span className="text-xs font-normal text-muted"> /{h.k.max}</span>}
                    </span>
                    <span className="text-right tabular-nums">{h.k.quantity ?? "–"}</span>
                    <span className="text-right tabular-nums">{h.k.quality ?? "–"}</span>
                    <span className="text-right tabular-nums">{h.k.feedback ?? "–"}</span>
                    <span className="hidden text-right tabular-nums sm:block">{h.k.completed}</span>
                    <span className="hidden text-right tabular-nums sm:block">
                      {h.k.mistakes}
                      {h.k.repeated > 0 && <span className="text-xs text-rose-300"> ({h.k.repeated})</span>}
                    </span>
                  </div>
                ))}
              </div>
            ),
          },
          ...(canEdit ? [{ key: "leave", label: "Leave", count: leave.length, content: <LeavePanel editorId={id} days={leave} today={today} /> }] : []),
        ]}
      />
    </div>
  );
}
