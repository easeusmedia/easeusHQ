import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, ThumbsUp } from "lucide-react";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { STAGE } from "@/lib/stages";
import {
  draftHours,
  editorKpis,
  hoursLabel,
  insights,
  monthName,
  onTime,
  PART_LABEL,
  sentBack,
  settle,
  shiftMonth,
  unitsOf,
  weekEnd,
  type Kpis,
  type Part,
} from "@/lib/editorKpi";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { CategoryBars, FeedbackPanel, LogFeedbackButton, MonthSwitch, PartBar, ScoreBadge, TaskTable, TrendBars, type EntryRow, type TaskRow } from "../ui";
import { kpiTargets, loadPerformance, monthShare, PART_NOTE, partText, pickMonth, weeklyScores } from "../data";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
const dayLabel = (iso: string) => `${Number(iso.slice(8, 10))} ${short(iso.slice(0, 7))}`;

// One editor, one month: the score and what it's made of, how the month went
// week by week, what's going well and where they could use support; then
// the feedback, the videos, trends and their record in tabs.
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
  const prev = shiftMonth(month, -1);
  const [data, targets] = await Promise.all([loadPerformance(month, 12, id), kpiTargets()]);
  const editor = data.editors[0];
  if (!editor) notFound();

  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
  const byMonth = new Map<string, Kpis>(months.map((m) => [m, editorKpis(...data.slice(m), targets, monthShare(m, today))]));
  const now = byMonth.get(month)!;
  const said = insights(now, byMonth.get(prev)!);
  const six = months.slice(-6);
  const scores = weeklyScores(data, month, today, targets);

  // each week on its own: what was delivered and found in it
  const weeks = [1, 2, 3, 4, 5].map((w, i) => {
    const from = `${month}-${String((w - 1) * 7 + 1).padStart(2, "0")}`;
    const to = `${month}-${String(weekEnd(month, w)).padStart(2, "0")}`;
    const k = editorKpis(...data.slice(month, undefined, { from, to }), targets);
    return { w, from, to, k, score: scores[i], future: from > today };
  });

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
  const toReview = entries.filter((e) => !e.reviewed).length;
  const taskOptions = [...new Map([...data.open, ...data.tasks].map((t) => [t.id, { id: t.id, title: t.title }])).values()];
  const history = months
    .slice()
    .reverse()
    .map((m) => ({ m, k: byMonth.get(m)! }))
    .filter(({ k }) => k.delivered || k.mistakes);
  const base = `/performance/${editor.id}`;
  const card = "rounded-2xl border border-border bg-surface-2/30 p-5";
  const HISTORY_ROW = "grid grid-cols-[minmax(0,1fr)_4rem_4rem_5rem] items-center gap-4 px-4 sm:grid-cols-[minmax(0,1fr)_4rem_5rem_6rem_5rem_5rem_5rem]";

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

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className={card}>
          <div className="flex items-center gap-4">
            <ScoreBadge score={now.score} grade={now.grade} size="lg" />
            <div>
              <p className="text-sm font-semibold">{monthName(month)}</p>
              <p className="text-xs text-muted">
                {now.delivered} video{now.delivered === 1 ? "" : "s"} delivered ({now.units} weighted){month === thisMonth ? " · so far this month" : ""}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            {(Object.keys(PART_LABEL) as Part[]).map((p) => {
              const part = now.parts[p];
              return (
                <div key={p} className="grid grid-cols-[minmax(0,1fr)_3rem] items-end gap-4">
                  <PartBar label={`${PART_LABEL[p]} · counts ${part.weight}%`} text={partText(p, now)} points={part.points} note={PART_NOTE[p](part.target)} />
                  <span className="pb-4 text-right text-xs tabular-nums text-muted">{part.points === null ? "–" : `${part.points} pts`}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold">This month by week</h2>
          <div className="mt-4 text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_4rem_3.5rem] gap-3 pb-2 text-xs text-muted">
              <span>Week</span>
              <span className="text-right">Videos</span>
              <span className="text-right">Mistakes</span>
              <span className="text-right">Sent back</span>
              <span className="text-right">Score</span>
            </div>
            {weeks.map(({ w, from, to, k, score, future }) => (
              <div key={w} className={`grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_4rem_3.5rem] gap-3 border-t border-border/50 py-2.5 ${future ? "text-muted/50" : ""}`}>
                <span className="truncate">
                  Week {w} <span className="text-xs text-muted">{dayLabel(from)}–{Number(to.slice(8))}</span>
                </span>
                <span className="text-right tabular-nums">{future ? "" : k.delivered}</span>
                <span className="text-right tabular-nums">{future ? "" : k.mistakes}</span>
                <span className="text-right tabular-nums">{future ? "" : k.internalRevisions + k.clientRevisions}</span>
                <span className="text-right font-medium tabular-nums">{future ? "" : (score ?? "–")}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Score is the month so far at the end of each week.</p>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { title: "Going well", Icon: ThumbsUp, items: said.good, empty: "Nothing stands out yet this month." },
          { title: "Could use support", Icon: CircleAlert, items: said.watch, empty: "Nothing to raise this month." },
        ].map(({ title, Icon, items, empty }) => (
          <section key={title} className={card}>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon size={14} className="text-muted" /> {title}
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {items.length ? items.map((t) => <li key={t}>{t}</li>) : <li className="text-muted">{empty}</li>}
            </ul>
          </section>
        ))}
      </div>

      <ClientTabs
        width=""
        initialTab={tab ?? (toReview ? "feedback" : undefined)}
        tabs={[
          {
            key: "feedback",
            label: toReview ? `Feedback · ${toReview} to confirm` : "Feedback",
            count: toReview ? undefined : entries.length,
            content: <FeedbackPanel editorId={editor.id} entries={entries} tasks={taskOptions} today={today} />,
          },
          { key: "videos", label: "Videos", count: taskRows.length, content: <TaskTable rows={taskRows} /> },
          {
            key: "trends",
            label: "Trends",
            content: (
              <div className="grid gap-3 md:grid-cols-2">
                <TrendBars title="Score, by month" empty="No score yet" points={six.map((m) => ({ label: short(m), value: byMonth.get(m)!.score, text: String(byMonth.get(m)!.score ?? "–") }))} />
                <TrendBars
                  title="Mistakes per video, by month"
                  empty="No mistakes logged"
                  points={six.map((m) => ({ label: short(m), value: byMonth.get(m)!.mistakesPerVideo, text: String(byMonth.get(m)!.mistakesPerVideo ?? "–") }))}
                />
                <TrendBars title="Weighted videos, by month" points={six.map((m) => ({ label: short(m), value: byMonth.get(m)!.units, text: String(byMonth.get(m)!.units) }))} />
                <CategoryBars rows={now.byCategory} />
              </div>
            ),
          },
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
                    <span className="hidden text-right sm:block">Sent back a video</span>
                    <span className="hidden text-right sm:block">On time</span>
                    <span className="text-right">Turnaround</span>
                  </div>
                  {history.map(({ m, k }) => (
                    <Link key={m} href={`${base}?month=${m}`} className={`${HISTORY_ROW} border-t border-border/50 py-2.5 transition-colors hover:bg-foreground/[0.02] ${m === month ? "bg-accent/[0.06]" : ""}`}>
                      <span>{monthName(m)}</span>
                      <span className="text-right font-medium tabular-nums">
                        {k.score ?? "–"} <span className="text-xs text-muted">{k.grade}</span>
                      </span>
                      <span className="text-right tabular-nums">{k.delivered}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.mistakesPerVideo ?? "–"}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.revisions ?? "–"}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.onTimePct === null ? "–" : `${k.onTimePct}%`}</span>
                      <span className="text-right tabular-nums">{k.draftHours === null ? "–" : hoursLabel(k.draftHours)}</span>
                    </Link>
                  ))}
                </div>
              ),
          },
        ]}
      />

      {data.open.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">On their plate now</h2>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border text-sm">
            {data.open.map((t) => {
              const late = t.dueDate && indiaDay(t.dueDate) < today;
              return (
                <li key={t.id} className="flex items-center gap-3 bg-surface/40 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.title}</span>
                    <span className="block truncate text-xs text-muted">{[t.project.client.name, t.project.name || t.project.type].join(" · ")}</span>
                  </span>
                  {t.dueDate && <span className={`shrink-0 text-xs ${late ? "text-red-300" : "text-muted"}`}>{late ? "Was due" : "Due"} {dayLabel(indiaDay(t.dueDate))}</span>}
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STAGE[t.status].pill}`}>{STAGE[t.status].label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
