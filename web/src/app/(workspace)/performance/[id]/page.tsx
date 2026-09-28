import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { draftHours, editorKpis, focusStatus, hoursLabel, monthName, onTime, PART_LABEL, sentBack, settle, shiftMonth, unitsOf, type Kpis, type Part } from "@/lib/editorKpi";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { FeedbackPanel, FocusAreas, LogFeedbackButton, MonthSwitch, PartBar, ScoreBadge, TaskTable, type EntryRow, type FocusRow, type TaskRow } from "../ui";
import { kpiTargets, loadPerformance, monthShare, PART_NOTE, partText, pickMonth, recentWeeks } from "../data";

export const dynamic = "force-dynamic";

// One editor, kept to what's worth reading: the month's score and the four
// parts it's made of; the last four weeks, by date; what they're working
// on improving, which stays until they have; and the detail behind it all
// in tabs.
export default async function EditorPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; tab?: string }>;
}) {
  if (!(await requireOps())) redirect("/board");
  const { id } = await params;
  const { month: asked, tab } = await searchParams;

  const today = indiaDay(new Date());
  const thisMonth = today.slice(0, 7);
  const month = pickMonth(asked, thisMonth);
  const [data, targets, focus] = await Promise.all([
    loadPerformance(month, 12, id),
    kpiTargets(),
    prisma.focusArea.findMany({ where: { editorId: id }, orderBy: { openedAt: "asc" } }),
  ]);
  const editor = data.editors[0];
  if (!editor) notFound();

  const now = editorKpis(...data.slice(month), targets, monthShare(month, today));
  const weeks = recentWeeks(data, month, today, targets);

  // confirmed mistakes, to tell whether a focus area is still coming up
  const confirmed = data.entries.filter((e) => e.kind === "mistake" && e.reviewed);
  const focusRows: FocusRow[] = focus.map((f) => ({
    id: f.id,
    title: f.title,
    category: f.category,
    since: indiaDay(f.openedAt),
    improved: f.resolvedAt ? indiaDay(f.resolvedAt) : null,
    ...focusStatus({ category: f.category, opened: indiaDay(f.openedAt) }, confirmed, today),
  }));

  const taskRows: TaskRow[] = data.tasks
    .filter((t) => t.month === month)
    .map((t) => {
      const moves = settle(t.moves);
      const back = sentBack(moves);
      const hours = draftHours({ ...t, moves });
      return {
        id: t.id,
        title: t.title,
        where: [t.client, t.project].filter(Boolean).join(" · "),
        type: `${t.tags[0] ?? "Untagged"} · ${unitsOf(t, targets.typeWeights)}`,
        assigned: indiaDay(t.createdAt),
        reached: t.handedOffAt ? indiaDay(t.handedOffAt) : null,
        turnaround: hours === null ? "–" : hoursLabel(hours),
        revisions: back.internal + back.client,
        onTime: onTime({ ...t, moves }),
        excluded: t.excluded,
      };
    });

  const entries: EntryRow[] = data.entries
    .filter((e) => e.day.startsWith(month))
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      category: e.category,
      body: e.body,
      count: e.count,
      day: e.day,
      source: e.source,
      by: e.by ?? e.loggedBy?.name ?? null,
      fromClient: e.fromClient,
      reviewed: e.reviewed,
      taskId: e.taskId,
      taskTitle: e.task?.title ?? null,
    }));
  const toConfirm = entries.filter((e) => !e.reviewed && e.kind === "mistake").length;
  const taskOptions = [...new Map([...data.open, ...data.tasks].map((t) => [t.id, { id: t.id, title: t.title }])).values()];

  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, -i));
  const history = months
    .map((m) => ({ m, k: editorKpis(...data.slice(m), targets, monthShare(m, today)) as Kpis }))
    .filter(({ k }) => k.delivered || k.mistakes);

  const base = `/performance/${editor.id}`;
  const card = "rounded-2xl border border-border bg-surface-2/30 p-5";
  const WEEK_ROW = "grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_4.5rem] items-center gap-3";
  const HISTORY_ROW = "grid grid-cols-[minmax(0,1fr)_4rem_4rem_5rem] items-center gap-4 px-4 sm:grid-cols-[minmax(0,1fr)_4rem_5rem_6rem_5rem_5rem]";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link href={`/performance${month === thisMonth ? "" : `?month=${month}`}`} className="flex w-fit items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft size={13} /> Editor performance
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={editor.name} size={48} presence={false} />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{editor.name}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {editor.jobTitle?.name ?? "Editor"} · {data.open.length} open now
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LogFeedbackButton editorId={editor.id} tasks={taskOptions} today={today} />
            <MonthSwitch month={month} thisMonth={thisMonth} base={base} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center gap-4">
            <ScoreBadge score={now.score} grade={now.grade} size="lg" />
            <div>
              <p className="text-sm font-semibold">{monthName(month)}</p>
              <p className="text-xs text-muted">
                {now.delivered} video{now.delivered === 1 ? "" : "s"} delivered{month === thisMonth ? " so far" : ""}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
            {(Object.keys(PART_LABEL) as Part[]).map((p) => (
              <PartBar key={p} label={`${PART_LABEL[p]} · ${now.parts[p].weight}%`} text={partText(p, now)} points={now.parts[p].points} note={PART_NOTE[p](now.parts[p].target)} />
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold">Past four weeks</h2>
          <div className="mt-4 text-sm">
            <div className={`${WEEK_ROW} pb-2 text-xs text-muted`}>
              <span>Week</span>
              <span className="text-right">Videos</span>
              <span className="text-right">Mistakes</span>
              <span className="text-right">Score</span>
            </div>
            {weeks.map((w, i) => (
              <div key={w.from} className={`${WEEK_ROW} border-t border-border/50 py-2.5`}>
                <span className="truncate">
                  {w.label}
                  {i === 0 && <span className="ml-1.5 text-xs text-muted">this week</span>}
                </span>
                <span className="text-right tabular-nums">{w.k.delivered}</span>
                <span className="text-right tabular-nums">{w.k.mistakes}</span>
                <span className="text-right font-medium tabular-nums">
                  {w.k.score ?? "–"} {w.k.grade && <span className="text-xs font-normal text-muted">{w.k.grade}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <FocusAreas editorId={editor.id} rows={focusRows} />

      <ClientTabs
        width=""
        initialTab={tab ?? (toConfirm ? "feedback" : undefined)}
        tabs={[
          {
            key: "feedback",
            label: toConfirm ? `Feedback · ${toConfirm} to confirm` : "Feedback",
            count: toConfirm ? undefined : entries.length,
            content: <FeedbackPanel editorId={editor.id} entries={entries} tasks={taskOptions} today={today} />,
          },
          { key: "videos", label: "Videos", count: taskRows.length, content: <TaskTable rows={taskRows} /> },
          {
            key: "history",
            label: "History",
            content:
              history.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No record yet.</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border text-sm">
                  <div className={`${HISTORY_ROW} py-2.5 text-xs text-muted`}>
                    <span>Month</span>
                    <span className="text-right">Score</span>
                    <span className="text-right">Videos</span>
                    <span className="hidden text-right sm:block">Mistakes a video</span>
                    <span className="hidden text-right sm:block">On time</span>
                    <span className="text-right">Turnaround</span>
                  </div>
                  {history.map(({ m, k }) => (
                    <Link key={m} href={`${base}?month=${m}`} className={`${HISTORY_ROW} border-t border-border/50 py-2.5 transition-colors hover:bg-foreground/[0.02] ${m === month ? "bg-accent/[0.06]" : ""}`}>
                      <span>{monthName(m)}</span>
                      <span className="text-right font-medium tabular-nums">
                        {k.score ?? "–"} <span className="text-xs font-normal text-muted">{k.grade}</span>
                      </span>
                      <span className="text-right tabular-nums">{k.delivered}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.mistakesPerVideo ?? "–"}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.onTimePct === null ? "–" : `${k.onTimePct}%`}</span>
                      <span className="text-right tabular-nums">{k.draftHours === null ? "–" : hoursLabel(k.draftHours)}</span>
                    </Link>
                  ))}
                </div>
              ),
          },
        ]}
      />
    </div>
  );
}
