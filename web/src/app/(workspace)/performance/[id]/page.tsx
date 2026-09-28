import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, CircleCheck, Clapperboard, Clock, RotateCcw, Sparkles, Timer, TriangleAlert } from "lucide-react";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { STAGE } from "@/lib/stages";
import { editorKpis, hoursLabel, insights, meets, monthName, shiftMonth, turnaroundHours, scoredOnTime, settle, sentBack, type Kpis } from "@/lib/editorKpi";
import { StatTile } from "../../StatTile";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { CategoryBars, FeedbackPanel, GradeBadge, LogFeedbackButton, MonthSwitch, TaskTable, TrendBars, type EntryRow, type TaskRow } from "../ui";
import { kpiTargets, loadPerformance, pickMonth } from "../data";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

// One editor, one month, top to bottom: their grade and numbers, what's
// going well and where they could use support, then the detail behind it
// all in tabs: trends, the videos, every piece of feedback, and their
// record month by month.
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
  const byMonth = new Map<string, Kpis>(months.map((m) => [m, editorKpis(...data.slice(m))]));
  const now = byMonth.get(month)!;
  const before = byMonth.get(prev)!;
  const said = insights(now, before, targets);
  const six = months.slice(-6);

  // the videos this month, with the numbers each one feeds
  const taskRows: TaskRow[] = data.tasks
    .filter((t) => t.month === month)
    .map((t) => {
      const moves = settle(t.moves);
      const back = sentBack(moves);
      const hours = turnaroundHours(t);
      return {
        id: t.id,
        title: t.title,
        where: [t.client, t.project].filter(Boolean).join(" · "),
        type: t.tags.join(", ") || "Untagged",
        assigned: indiaDay(t.createdAt),
        reached: t.handedOffAt ? indiaDay(t.handedOffAt) : null,
        turnaround: hours === null ? "–" : hoursLabel(hours),
        revisions: back.internal + back.client,
        onTime: scoredOnTime(t),
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

  // their videos to pin feedback to: what they're on now, then what they delivered
  const taskOptions = [...new Map([...data.open, ...data.tasks].map((t) => [t.id, { id: t.id, title: t.title }])).values()];

  const change = (a: number | null, b: number | null, fmt: (n: number) => string, better: "up" | "down") => {
    if (a === null || b === null || a === b) return <span className="text-xs text-muted">Same as {short(prev)}</span>;
    const up = a > b;
    const good = better === "up" ? up : !up;
    return <span className={`text-xs ${good ? "text-emerald-300" : "text-amber-300"}`}>{`${up ? "Up" : "Down"} from ${fmt(b)} in ${short(prev)}`}</span>;
  };

  const history = months
    .slice()
    .reverse()
    .map((m) => ({ m, k: byMonth.get(m)! }))
    .filter(({ k }) => k.delivered || k.mistakes);

  const base = `/performance/${editor.id}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link href={`/performance${month === thisMonth ? "" : `?month=${month}`}`} className="flex w-fit items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft size={13} /> Editor performance
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={editor.name} size={52} presence={false} />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{editor.name}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {editor.jobTitle?.name ?? "Editor"} · {monthName(month)}
              </p>
            </div>
            <GradeBadge grade={now.grade} size="lg" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LogFeedbackButton editorId={editor.id} tasks={taskOptions} today={today} />
            <MonthSwitch month={month} thisMonth={thisMonth} base={base} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Videos delivered" value={now.delivered} Icon={Clapperboard} note={change(now.delivered, before.delivered, String, "up")} />
        <StatTile
          label="Turnaround, typical"
          value={now.turnaroundHours === null ? "–" : hoursLabel(now.turnaroundHours)}
          lit={now.turnaroundHours !== null}
          Icon={Timer}
          note={change(now.turnaroundHours, before.turnaroundHours, hoursLabel, "down")}
        />
        <StatTile
          label="Mistakes"
          value={now.mistakes}
          lit={now.mistakes > 0}
          Icon={CircleAlert}
          note={
            <span className={`text-xs ${meets("mistakes", now.mistakes, targets) === false ? "text-amber-300" : "text-muted"}`}>
              {now.mistakesPerVideo === null ? `Target ${targets.mistakes} or fewer` : `${now.mistakesPerVideo} per video`}
            </span>
          }
        />
        <StatTile
          label="Revisions per video"
          value={now.revisions ?? "–"}
          lit={now.revisions !== null}
          Icon={RotateCcw}
          note={change(now.revisions, before.revisions, String, "down")}
        />
        <StatTile
          label="On time"
          value={now.onTimePct === null ? "–" : `${now.onTimePct}%`}
          lit={now.onTimePct !== null}
          tone={meets("onTimePct", now.onTimePct, targets) ? "emerald" : "accent"}
          Icon={Clock}
          note={<span className="text-xs text-muted">Target {targets.onTimePct}%</span>}
        />
        <StatTile
          label="Approved first time"
          value={now.firstPassPct === null ? "–" : `${now.firstPassPct}%`}
          lit={now.firstPassPct !== null}
          Icon={CircleCheck}
          note={<span className="text-xs text-muted">{now.internalRevisions} sent back by us, {now.clientRevisions} by clients</span>}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={14} className="text-emerald-300" /> Going well
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {said.good.length ? said.good.map((g) => <li key={g}>{g}</li>) : <li className="text-muted">Nothing stands out yet this month.</li>}
          </ul>
        </section>
        <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert size={14} className="text-amber-300" /> Could use support
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {said.watch.length ? said.watch.map((w) => <li key={w}>{w}</li>) : <li className="text-muted">Nothing to raise this month.</li>}
          </ul>
        </section>
      </div>

      <ClientTabs
        width=""
        initialTab={tab}
        tabs={[
          {
            key: "overview",
            label: "Trends",
            content: (
              <div className="grid gap-3 md:grid-cols-2">
                <TrendBars title="Videos delivered, by month" points={six.map((m) => ({ label: short(m), value: byMonth.get(m)!.delivered, text: String(byMonth.get(m)!.delivered) }))} />
                <TrendBars title="Mistakes, by month" empty="No mistakes logged" points={six.map((m) => ({ label: short(m), value: byMonth.get(m)!.mistakes, text: String(byMonth.get(m)!.mistakes) }))} />
                <TrendBars
                  title="Typical turnaround, by month"
                  points={six.map((m) => {
                    const h = byMonth.get(m)!.turnaroundHours;
                    return { label: short(m), value: h, text: h === null ? "–" : hoursLabel(h) };
                  })}
                />
                <TrendBars
                  title="Revisions per video, by month"
                  empty="Never sent back"
                  points={six.map((m) => {
                    const r = byMonth.get(m)!.revisions;
                    return { label: short(m), value: r, text: r === null ? "–" : String(r) };
                  })}
                />
                <TrendBars
                  title={`Mistakes by week, ${monthName(month, false)}`}
                  empty="No mistakes this month"
                  points={now.weeks.map((n, i) => ({ label: `W${i + 1}`, value: n, text: String(n) }))}
                />
                <CategoryBars rows={now.byCategory} />
              </div>
            ),
          },
          { key: "tasks", label: "Videos", count: taskRows.length, content: <TaskTable rows={taskRows} /> },
          {
            key: "feedback",
            label: toReview ? `Feedback · ${toReview} to review` : "Feedback",
            count: entries.length,
            content: <FeedbackPanel editorId={editor.id} entries={entries} tasks={taskOptions} today={today} />,
          },
          {
            key: "history",
            label: "History",
            content:
              history.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No record yet.</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border text-sm">
                  <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_4rem] gap-4 px-4 py-2.5 text-xs text-muted sm:grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_5rem_4.5rem_4.5rem_4rem]">
                    <span>Month</span>
                    <span>Grade</span>
                    <span className="text-right">Delivered</span>
                    <span className="hidden text-right sm:block">Turnaround</span>
                    <span className="text-right">Mistakes</span>
                    <span className="hidden text-right sm:block">Revisions</span>
                    <span className="hidden text-right sm:block">On time</span>
                  </div>
                  {history.map(({ m, k }) => (
                    <Link
                      key={m}
                      href={`${base}?month=${m}`}
                      className={`grid grid-cols-[minmax(0,1fr)_3.5rem_4rem_4rem] items-center gap-4 border-t border-border/50 px-4 py-2.5 transition-colors hover:bg-foreground/[0.02] sm:grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_5rem_4.5rem_4.5rem_4rem] ${m === month ? "bg-accent/[0.05]" : ""}`}
                    >
                      <span>{monthName(m)}</span>
                      <span className="font-semibold">{k.grade ?? "–"}</span>
                      <span className="text-right tabular-nums">{k.delivered}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.turnaroundHours === null ? "–" : hoursLabel(k.turnaroundHours)}</span>
                      <span className="text-right tabular-nums">{k.mistakes}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.revisions ?? "–"}</span>
                      <span className="hidden text-right tabular-nums sm:block">{k.onTimePct === null ? "–" : `${k.onTimePct}%`}</span>
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
                  {t.dueDate && <span className={`shrink-0 text-xs ${late ? "text-red-300" : "text-muted"}`}>{late ? "Was due" : "Due"} {indiaDay(t.dueDate).slice(8)} {short(indiaDay(t.dueDate).slice(0, 7))}</span>}
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
