import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { chartSpans, dayOf, partMax, periodFrom } from "@/lib/editorKpi";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { AddFeedbackButton, Delta, FeedbackList, GradeBadge, MistakeList, PartScore, PeriodBar, Total, type VideoRow, VideoTable } from "../ui";
import { MistakeBars, ScoreBars } from "../charts";
import { firstDay, loadPerformance, loadScoring, repeatedMistakes } from "../data";
import { AGAINST, facts, periodQuery } from "../shared";

export const dynamic = "force-dynamic";

// One editor's scorecard: the grade and total out of 10 for the period and
// its three parts, their score over time, their mistakes by type, and then
// the mistakes, feedback and videos themselves. Core can add and correct
// any of it. An editor sees their own, read-only.
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
  const [scoring, first] = await Promise.all([loadScoring(), q.view === "all" ? firstDay(id) : undefined]);
  const period = periodFrom(q, today, first);
  const spans = chartSpans(period);
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
  const before = period.kind === "all" ? null : data.score(period.prev.from, period.prev.to, id);
  const max = partMax(scoring);
  const f = facts(now);
  const describe = new Map(data.categories.map((c) => [c.name, c.description]));
  const byType = repeatedMistakes(data.feedback, period.from, period.to, id).map((r) => ({ ...r, description: describe.get(r.category) ?? null }));

  const inPeriod = data.feedback.filter((e) => e.day >= period.from && e.day <= period.to);
  const mistakes = inPeriod.filter((e) => e.kind === "mistake" || e.kind === "note");
  const said = inPeriod.filter((e) => e.kind === "positive" || e.kind === "negative" || e.kind === "guidance");
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

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <Link href={`/performance${query ? `?${query}` : ""}`} className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft size={14} /> Editor performance
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={editor.name} size={48} presence={false} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{canEdit ? editor.name : "My scorecard"}</h1>
            <p className="text-sm text-muted">{editor.jobTitle?.name ?? "Editor"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodBar period={period} today={today} />
          {canEdit && <AddFeedbackButton {...dialog} />}
        </div>
      </div>

      <section className={`${card} grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-10`}>
        <div className="flex items-center gap-4">
          <GradeBadge grade={now.grade} size="lg" />
          <div className="flex flex-col gap-1">
            <Total total={now.total} grade={now.grade} size="lg" />
            <Delta now={now.total} before={before?.total ?? null} against={AGAINST[period.kind]} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-8">
          <PartScore part="quantity" value={now.quantity} max={max.quantity} fact={f.quantity} />
          <PartScore part="quality" value={now.quality} max={max.quality} fact={f.quality} />
          <PartScore part="feedback" value={now.feedback} max={max.feedback} fact={f.feedback} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={card}>
          <h2 className="mb-5 text-base font-semibold">Score over time</h2>
          <ScoreBars
            spans={spans.map((s) => {
              const k = data.score(s.from, s.to, id);
              return { label: s.label, title: s.title, total: k.total, grade: k.grade, quantity: k.quantity, quality: k.quality, feedback: k.feedback };
            })}
            max={max}
          />
        </section>
        <section className={card}>
          <h2 className="mb-5 text-base font-semibold">Mistakes by type</h2>
          <MistakeBars rows={byType.slice(0, 6)} />
        </section>
      </div>

      <ClientTabs
        width=""
        initialTab={q.tab}
        tabs={[
          { key: "mistakes", label: "Mistakes", count: mistakes.filter((e) => e.kind === "mistake").length, content: <MistakeList entries={mistakes} canEdit={canEdit} {...dialog} /> },
          { key: "feedback", label: "Feedback", count: said.length, content: <FeedbackList entries={said} canEdit={canEdit} {...dialog} /> },
          { key: "videos", label: "Videos", count: videos.length, content: <VideoTable rows={videos} types={kinds.map((k) => k.name)} canEdit={canEdit} /> },
        ]}
      />
    </div>
  );
}
