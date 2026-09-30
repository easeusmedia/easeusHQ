import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { dayOf, GRADE_LABEL, partMax, periodFrom, trendSpans } from "@/lib/editorKpi";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { AddFeedbackButton, Delta, GradeBadge, GuidanceList, MistakeList, PartScore, PeriodBar, PraiseList, Total, type VideoRow, VideoTable } from "../ui";
import { MistakeBars, ScoreChart } from "../charts";
import { loadPerformance, loadScoring, repeatedMistakes } from "../data";
import { AGAINST, periodQuery, qualityLines, quantityLines, ratingLines } from "../shared";

export const dynamic = "force-dynamic";

// One editor's scorecard: the grade and the total out of 10 for the period,
// its three parts, a chart of it week by week, their mistakes by type, and
// everything behind it in tabs: the mistakes (each Frame.io comment with a
// picture of its frame), the feedback given to help them grow, praise and
// concerns, their videos and their history. Core can add and correct any
// of it and set a video's type. An editor sees their own, read-only.
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
  const period = periodFrom(q, today);
  const spans = trendSpans(period.kind === "range" ? "week" : period.kind, period.to, period.kind === "month" ? 6 : 10);
  const [data, kinds, clients] = await Promise.all([
    loadPerformance({ from: [period.prev.from, spans[0].from, period.from].sort()[0], editorId: id }),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
    // for tying feedback to a client or project, which only core does
    canEdit
      ? prisma.client.findMany({
          where: { status: { not: "previous" } },
          select: { id: true, name: true, projects: { select: { id: true, name: true, type: true }, orderBy: { createdAt: "desc" } } },
          orderBy: { name: "asc" },
        })
      : [],
  ]);
  const editor = data.editors[0];
  if (!editor) notFound();

  const now = data.score(period.from, period.to, id);
  const before = data.score(period.prev.from, period.prev.to, id);
  const history = spans.map((s) => ({ ...s, k: data.score(s.from, s.to, id) }));
  const max = partMax(scoring);
  const describe = new Map(data.categories.map((c) => [c.name, c.description]));
  const byType = repeatedMistakes(data.feedback, period.from, period.to, id).map((r) => ({ ...r, description: describe.get(r.category) ?? null }));

  const inPeriod = data.feedback.filter((e) => e.day >= period.from && e.day <= period.to);
  const mistakes = inPeriod.filter((e) => e.kind === "mistake" || e.kind === "note");
  const guidance = inPeriod.filter((e) => e.kind === "guidance");
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
  const dialog = {
    editorId: id,
    tasks,
    clients: clients.map((c) => ({ id: c.id, name: c.name, projects: c.projects.map((p) => ({ id: p.id, name: p.name || p.type })) })),
    categories: data.categories,
    scoring,
    today,
  };

  const query = periodQuery(period);
  const card = "rounded-2xl border border-border bg-surface-2/30 p-5";
  const unit = period.kind === "month" ? "Month" : "Week";
  const HISTORY_ROW = "grid grid-cols-[minmax(0,1fr)_3rem_4rem_4rem_4rem] items-center gap-3 px-4 sm:grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_4.5rem_4.5rem_4.5rem_4rem_4.5rem]";

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
            <PeriodBar period={period} today={today} />
            {canEdit && <AddFeedbackButton {...dialog} />}
          </div>
        </div>
      </div>

      <section className={`${card} grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]`}>
        <div className="flex flex-col gap-3 md:border-r md:border-border/60 md:pr-6">
          <p className="text-xs text-muted">
            {period.current ? { week: "This week", month: "This month", range: period.label }[period.kind] : period.label}
            {period.current && period.kind !== "range" ? " so far" : ""}
          </p>
          <div className="flex items-center gap-4">
            <GradeBadge grade={now.grade} size="lg" />
            <div>
              <Total total={now.total} />
              <p className="text-sm text-muted">{now.grade ? GRADE_LABEL[now.grade] : "Nothing to score yet"}</p>
            </div>
          </div>
          <Delta now={now.total} before={before.total} against={AGAINST[period.kind]} />
          {now.weeks > 1 && <p className="text-[11px] text-muted">The average of {now.weeks} weeks, metric by metric.</p>}
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <PartScore part="quantity" value={now.quantity} max={max.quantity} lines={quantityLines(now)} />
          <PartScore part="quality" value={now.quality} max={max.quality} lines={qualityLines(now)} />
          <PartScore part="rating" value={now.rating} max={max.rating} lines={ratingLines(now)} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={card}>
          <h2 className="text-sm font-semibold">{unit} by {unit.toLowerCase()}</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted">Each bar is the total out of 10, split by what each part gave it. The dashed lines are where each grade starts.</p>
          <ScoreChart
            weeks={history.map((h) => ({ label: h.label, total: h.k.total, grade: h.k.grade, quantity: h.k.quantity, quality: h.k.quality, rating: h.k.rating }))}
            grades={scoring.grades}
            max={max}
          />
        </section>
        <section className={card}>
          <h2 className="text-sm font-semibold">Mistakes by type</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted">A repeat is the same type again, on another video, within 90 days. It counts {scoring.repeatWeight}× against Quality.</p>
          {byType.length === 0 ? <p className="text-sm text-muted">No mistakes in this period.</p> : <MistakeBars rows={byType} />}
        </section>
      </div>

      <ClientTabs
        width=""
        initialTab={q.tab}
        tabs={[
          { key: "mistakes", label: "Mistakes", count: mistakes.filter((e) => e.kind === "mistake").length, content: <MistakeList entries={mistakes} canEdit={canEdit} {...dialog} /> },
          { key: "feedback", label: "Feedback", count: guidance.length, content: <GuidanceList entries={guidance} canEdit={canEdit} from="Abhishek" {...dialog} /> },
          { key: "praise", label: "Praise and concerns", count: praise.length, content: <PraiseList entries={praise} canEdit={canEdit} {...dialog} /> },
          { key: "videos", label: "Videos", count: videos.length, content: <VideoTable rows={videos} types={kinds.map((k) => k.name)} canEdit={canEdit} /> },
          {
            key: "history",
            label: "History",
            content: (
              <div className="overflow-hidden rounded-2xl border border-border text-sm">
                <div className={`${HISTORY_ROW} py-2.5 text-xs text-muted`}>
                  <span>{unit}</span>
                  <span>Grade</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Quantity</span>
                  <span className="text-right">Quality</span>
                  <span className="hidden text-right sm:block">Rating</span>
                  <span className="hidden text-right sm:block">Videos</span>
                  <span className="hidden text-right sm:block">Mistakes</span>
                </div>
                {[...history].reverse().map((h) => (
                  <div key={h.from} className={`${HISTORY_ROW} border-t border-border/50 py-2.5`}>
                    <span className="truncate">{h.label}</span>
                    <GradeBadge grade={h.k.grade} size="sm" />
                    <span className="text-right font-medium tabular-nums">{h.k.total ?? "–"}</span>
                    <span className="text-right tabular-nums">{h.k.quantity ?? "–"}</span>
                    <span className="text-right tabular-nums">{h.k.quality ?? "–"}</span>
                    <span className="hidden text-right tabular-nums sm:block">{h.k.rating ?? "–"}</span>
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
        ]}
      />
    </div>
  );
}
