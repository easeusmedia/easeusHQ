import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { chartSpans, dayOf, periodFrom } from "@/lib/editorKpi";
import { LETTER_LABEL } from "@/lib/videoScore";
import { Avatar } from "../../TaskCard";
import { ClientTabs } from "../../clients/ClientTabs";
import { AddFeedbackButton, Delta, FeedbackList, GradeBadge, MistakeList, PeriodBar, ScoreTile, VideoGrid } from "../ui";
import { MistakeBars, WeeklyLine } from "../charts";
import { firstDay, loadPerformance, repeatedMistakes } from "../data";
import { AGAINST, bandMiddle, periodQuery, summaryFacts, videoCard } from "../shared";

export const dynamic = "force-dynamic";

// One editor's scorecard, built from their videos: their average letter
// for the period and its three parts, their weeks,
// their mistakes by type, and then the videos, the mistakes and the
// feedback themselves. Core adds and corrects; an editor sees their own,
// in letters only.
export default async function EditorPerformancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const sessionId = await getSessionUserId();
  const me = sessionId ? await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, role: true } }) : null;
  if (!me) redirect("/login");
  // an editor sees only their own
  if (me.role === "employee" && me.id !== id) redirect(`/performance/${me.id}`);
  const canEdit = me.role !== "employee";
  // numbers are for core; an editor sees letters
  const numbers = canEdit;

  const today = dayOf(new Date());
  const first = q.view === "all" ? await firstDay(id) : undefined;
  const period = periodFrom(q, today, first);
  const spans = chartSpans(period);
  const [data, clients] = await Promise.all([
    loadPerformance({ from: [period.prev.from, spans[0].from, period.from].sort()[0], editorId: id }),
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
  const s = data.scoring;

  const now = data.summary(period.from, period.to, id);
  const before = period.kind === "all" ? null : data.summary(period.prev.from, period.prev.to, id);
  const facts = summaryFacts(now);
  const videos = data
    .videosIn(period.from, period.to, id)
    .sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""))
    .map((v) => videoCard(v, numbers));
  // still with them, in a period running to today
  const inProgress = period.to >= today ? data.videos.filter((v) => v.editorId === id && !v.day && !v.excluded).map((v) => videoCard(v, numbers)) : [];
  const weeks = spans.map((w) => {
    const sum = data.summary(w.from, w.to, id);
    return { label: w.label, title: w.title, score: numbers ? sum.overall : bandMiddle(sum.letter.overall, s.bands), letter: sum.letter.overall, videos: sum.videos };
  });
  const describe = new Map(data.categories.map((c) => [c.name, c.description]));
  const byType = repeatedMistakes(data.feedback, period.from, period.to, id).map((r) => ({ ...r, description: describe.get(r.category) ?? null }));

  const inPeriod = data.feedback.filter((e) => e.day >= period.from && e.day <= period.to);
  const mistakes = inPeriod.filter((e) => e.kind === "mistake" || e.kind === "creative");
  const said = inPeriod.filter((e) => e.kind === "positive" || e.kind === "negative" || e.kind === "guidance");
  const open = data.open.filter((t) => t.assignedToId === id);
  const tasks = [...new Map([...open, ...data.videos.filter((v) => v.editorId === id)].map((t) => [t.id, { id: t.id, title: t.title }])).values()];
  const dialog = {
    editorId: id,
    tasks,
    clients: clients.map((c) => ({ id: c.id, name: c.name, projects: c.projects.map((p) => ({ id: p.id, name: p.name || p.type })) })),
    categories: data.categories,
    scoring: s,
    today,
  };

  const query = periodQuery(period);
  const here = (extra: Record<string, string>) => `/performance/${id}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), ...extra })}`;
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
          <GradeBadge grade={now.letter.overall} size="lg" />
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold tracking-tight">
              {now.letter.overall ? LETTER_LABEL[now.letter.overall] : "No grade yet"}
              {numbers && now.overall !== null && <span className="ml-2 text-base font-normal text-muted tabular-nums">{now.overall}</span>}
            </span>
            <span className="text-sm text-muted">
              {now.videos} video{now.videos === 1 ? "" : "s"}
            </span>
            {numbers && <Delta now={now.overall} before={before?.overall ?? null} against={AGAINST[period.kind]} />}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
          <ScoreTile part="quality" letter={now.letter.quality} score={numbers ? now.quality : undefined} fact={facts.quality} />
          <ScoreTile part="efficiency" letter={now.letter.efficiency} score={numbers ? now.efficiency : undefined} fact={facts.efficiency} />
          <ScoreTile part="client" letter={now.letter.client} score={numbers ? now.client : undefined} fact={facts.client || undefined} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={card}>
          <h2 className="mb-5 text-base font-semibold">Week by week</h2>
          <WeeklyLine spans={weeks} bands={s.bands} showScore={numbers} />
        </section>
        <section className={card}>
          <h2 className="mb-4 text-base font-semibold">Mistakes by type</h2>
          <MistakeBars rows={byType.slice(0, 6)} href={here({ tab: "mistakes" })} />
        </section>
      </div>

      <ClientTabs
        key={`${q.tab ?? ""}:${q.type ?? ""}`}
        width=""
        initialTab={q.tab}
        tabs={[
          {
            key: "videos",
            label: "Videos",
            count: videos.length,
            content: (
              <div className="flex flex-col gap-6">
                <VideoGrid videos={videos} showScore={numbers} empty="No videos handed over in this period." />
                {inProgress.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-medium text-muted">In progress</h3>
                    <VideoGrid videos={inProgress} showScore={numbers} />
                  </div>
                )}
              </div>
            ),
          },
          { key: "mistakes", label: "Mistakes", count: mistakes.filter((e) => e.kind === "mistake").length, content: <MistakeList entries={mistakes} canEdit={canEdit} initialType={q.type} {...dialog} /> },
          { key: "feedback", label: "Feedback", count: said.length, content: <FeedbackList entries={said} canEdit={canEdit} {...dialog} /> },
        ]}
      />
    </div>
  );
}
