import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleCheck, LifeBuoy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { addDays, dayOf, PART_LABEL, PART_ORDER, periodFrom, trendSpans } from "@/lib/editorKpi";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { AddFeedbackButton, Delta, FeedbackPanel, GradeBadge, IssueQueue, LeavePanel, PartBar, PeriodBar, TrendStrip, VideoTable, type EntryRow, type VideoRow } from "../ui";
import { loadPerformance, needsHelp } from "../data";
import { AGAINST, hours, partNote, partText, periodQuery } from "../shared";

export const dynamic = "force-dynamic";

// One editor, most important first: their grade for the period and whether
// it's up or down, what they need help with, and the issues that keep
// coming back; then the detail behind it in tabs. Core can add feedback,
// raise and resolve issues, confirm what Frame.io found, set a video's type
// and record leave. An editor sees their own page, the same but read-only.
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
  const period = periodFrom(q, today);
  const spans = trendSpans(period.kind === "month" ? "month" : "week", period.to, period.kind === "month" ? 6 : 8);
  const [data, kinds] = await Promise.all([
    loadPerformance({ from: [period.prev.from, spans[0].from].sort()[0], editorId: id }),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const editor = data.editors[0];
  if (!editor) notFound();
  const t = data.targets;

  const now = data.score(period.from, period.to, id);
  const before = data.score(period.prev.from, period.prev.to, id);
  const delta = now.score !== null && before.score !== null ? now.score - before.score : null;
  const series = spans.map((s) => ({ ...s, k: data.score(s.from, s.to, id) }));
  const help = needsHelp(now, data.issues, t);
  const open = data.open.filter((x) => x.assignedToId === id);
  const overdue = open.filter((x) => x.dueDate && !x.handedOffAt && dayOf(x.dueDate) < today).length;

  const videoRows: VideoRow[] = data.videos
    .filter((v) => v.completedDay && v.completedDay >= period.from && v.completedDay <= period.to)
    .sort((a, b) => (b.completedDay ?? "").localeCompare(a.completedDay ?? ""))
    .map((v) => ({
      id: v.id,
      title: v.title,
      where: [v.client, v.project].filter(Boolean).join(" · "),
      type: v.type,
      guessed: v.guessed,
      units: v.units,
      assigned: v.assignedDay,
      completed: v.completedDay,
      edit: hours(v.editHours, t),
      standard: hours(v.standardHours, t),
      onStandard: v.onStandard,
      revisions: v.internalRevisions + v.clientRevisions,
      due: v.due,
      excluded: v.excluded,
    }));
  const entries: EntryRow[] = data.entries.filter((e) => e.day >= period.from && e.day <= period.to);
  const taskOptions = [...new Map([...open, ...data.videos].map((x) => [x.id, { id: x.id, title: x.title }])).values()];
  const leave = data.leave.filter((l) => l.day >= addDays(today, -120)).map((l) => ({ id: l.id, day: l.day, note: l.note }));

  const query = periodQuery(period);
  const card = "rounded-2xl border border-border bg-surface-2/30 p-5";
  const TREND_ROW = "grid grid-cols-[minmax(0,1fr)_4.5rem_4rem_4rem] items-center gap-3 px-4 sm:grid-cols-[minmax(0,1fr)_4.5rem_4rem_5rem_5.5rem_5rem]";

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
              <h1 className="text-2xl font-semibold tracking-tight">{canEdit ? editor.name : "My performance"}</h1>
              <p className="mt-0.5 text-sm text-muted">
                {editor.jobTitle?.name ?? "Editor"} · {open.length} open now
                {overdue > 0 && <span className="text-rose-300"> · {overdue} overdue</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodBar period={period} today={today} />
            {canEdit && <AddFeedbackButton editorId={id} tasks={taskOptions} today={today} />}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className={card}>
          <div className="flex items-center gap-4">
            <GradeBadge score={now.score} grade={now.grade} size="lg" light={!now.enough && now.completed > 0} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{period.current ? (period.kind === "week" ? "This week" : period.kind === "month" ? "This month" : period.label) : period.label}</p>
              <p className="text-xs text-muted">
                {now.completed} of {now.assigned} given completed · {now.units} reel-equivalents
              </p>
              <p className="mt-1">
                {now.enough ? <Delta delta={delta} against={AGAINST[period.kind]} /> : <span className="text-xs text-muted">Fewer than two videos completed, so not graded.</span>}
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {PART_ORDER.map((p) => (
              <PartBar key={p} label={`${PART_LABEL[p]} · ${now.parts[p].weight}%`} text={partText(p, now)} points={now.parts[p].points} note={partNote(p, now)} />
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <LifeBuoy size={14} className="text-accent" /> {canEdit ? "Where to help" : "What to work on"}
          </h2>
          {help.length === 0 ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-muted">
              <CircleCheck size={14} className="mt-0.5 shrink-0 text-accent" /> Nothing stands out. Keep it going.
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3">
              {help.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-medium text-accent">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{h.title}</span>
                    <span className="block text-xs text-muted">{h.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/60 pt-4 text-center">
            <div>
              <p className="text-lg font-semibold tabular-nums">{now.feedback}</p>
              <p className="text-[11px] text-muted">Feedback points</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{now.unresolved}</p>
              <p className="text-[11px] text-muted">Unresolved</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{now.firstPassPct === null ? "–" : `${now.firstPassPct}%`}</p>
              <p className="text-[11px] text-muted">Right first time</p>
            </div>
          </div>
        </section>
      </div>

      <IssueQueue editorId={id} issues={data.issues} canEdit={canEdit} />

      <ClientTabs
        width=""
        initialTab={q.tab}
        tabs={[
          { key: "videos", label: "Videos", count: videoRows.length, content: <VideoTable rows={videoRows} types={kinds.map((k) => k.name)} canEdit={canEdit} /> },
          {
            key: "feedback",
            label: canEdit && now.toConfirm ? `Feedback · ${now.toConfirm} to confirm` : "Feedback",
            count: canEdit && now.toConfirm ? undefined : entries.length,
            content: <FeedbackPanel editorId={id} entries={entries} tasks={taskOptions} today={today} canEdit={canEdit} />,
          },
          {
            key: "trend",
            label: "Trend",
            content: (
              <div className="flex flex-col gap-4">
                <div className="flex items-end gap-4">
                  <TrendStrip scores={series.map((s) => s.k.score)} labels={series.map((s) => s.label)} height={56} />
                  <p className="pb-1 text-xs text-muted">{period.kind === "month" ? "Score by month" : "Score by week"}, oldest on the left</p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border text-sm">
                  <div className={`${TREND_ROW} py-2.5 text-xs text-muted`}>
                    <span>{period.kind === "month" ? "Month" : "Week"}</span>
                    <span className="text-right">Grade</span>
                    <span className="text-right">Videos</span>
                    <span className="text-right">Mistakes</span>
                    <span className="hidden text-right sm:block">In standard</span>
                    <span className="hidden text-right sm:block">Revisions</span>
                  </div>
                  {[...series].reverse().map((s) => (
                    <div key={s.from} className={`${TREND_ROW} border-t border-border/50 py-2.5`}>
                      <span className="truncate">{s.label}</span>
                      <span className="text-right font-medium tabular-nums">
                        {s.k.grade ?? "–"} <span className="text-xs font-normal text-muted">{s.k.score ?? ""}</span>
                      </span>
                      <span className="text-right tabular-nums">{s.k.completed}</span>
                      <span className="text-right tabular-nums">{s.k.mistakes}</span>
                      <span className="hidden text-right tabular-nums sm:block">{s.k.onStandardPct === null ? "–" : `${s.k.onStandardPct}%`}</span>
                      <span className="hidden text-right tabular-nums sm:block">{s.k.revisions ?? "–"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ),
          },
          ...(canEdit ? [{ key: "leave", label: "Leave", count: leave.length, content: <LeavePanel editorId={id} days={leave} today={today} /> }] : []),
        ]}
      />
    </div>
  );
}
