import { PrefetchLink as Link } from "@/app/(workspace)/PrefetchLink";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { isFounder } from "@/lib/scope";
import { dayOf, hoursLabel, shortDay } from "@/lib/editorKpi";
import { STAGE } from "@/lib/stages";
import { LETTER_LABEL, PART_LABEL, type Letter, type Part } from "@/lib/videoScore";
import { TierMark } from "../../../TaskCard";
import { FeedbackList, GradeBadge, GradeControl, MistakeList } from "../../ui";
import { loadVideo } from "../../data";
import { videoFacts } from "../../shared";

export const dynamic = "force-dynamic";

// a moment, as people here read it: "Tue 29 Sep, 4:30 pm"
const when = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// One video, the unit everything is scored on: its overall letter, the
// quality inspection's grade (core can change it), its three scores with
// exactly what made each, and the mistakes, creative changes and feedback
// on it, each Frame.io comment with its frame. An editor sees their own
// videos, in letters only.
export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = await getSessionUserId();
  const me = sessionId ? await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, role: true, email: true } }) : null;
  if (!me) redirect("/login");
  // grading is a Founder's: a Lead has no Performance page
  if (me.role === "core" && !isFounder(me)) redirect("/board");
  const canEdit = isFounder(me);
  const numbers = canEdit;

  const [loaded, task] = await Promise.all([
    loadVideo(id),
    prisma.task.findUnique({ where: { id }, select: { assignedTo: { select: { id: true, name: true } }, status: true, frameioLink: true, project: { select: { name: true, type: true } } } }),
  ]);
  if (!loaded || !task?.assignedTo) notFound();
  // an editor sees only their own
  if (me.role === "employee" && task.assignedTo.id !== me.id) redirect(`/performance/${me.id}`);
  const { video, scoring, categories, feedback } = loaded;
  const s = video.score;
  const inspector = video.inspectedById ? await prisma.user.findUnique({ where: { id: video.inspectedById }, select: { name: true } }) : null;
  const facts = videoFacts(s);
  const tier = s.letter.quality === "S" || s.letter.quality === "A+" ? s.letter.quality : null;

  // each score's lines: what it is, and (for core) what it gave or took
  type Line = { what: string; pts?: string };
  const pts = (n: number, sign: "+" | "−") => (numbers && n ? `${sign}${n}` : undefined);
  const q = s.quality;
  const quality: Line[] = q.grade
    ? [
        { what: `Inspection: ${q.grade}${inspector ? `, by ${inspector.name}` : ""}`, pts: numbers && q.base !== null ? String(q.base) : undefined },
        ...(q.mistakes ? [{ what: `${plural(q.mistakes, "mistake")} we found${q.repeats ? `, ${q.repeats} repeated` : ""}${q.lost > q.taken ? ` (at most ${scoring.mistakeCap} off)` : ""}`, pts: pts(q.taken, "−") }] : []),
        ...(q.praise ? [{ what: plural(q.praise, "praise", "praise"), pts: pts(q.praised, "+") }] : []),
        ...(q.concerns ? [{ what: plural(q.concerns, "concern"), pts: pts(q.concerned, "−") }] : []),
      ]
    : [{ what: canEdit ? "Not graded yet. Grade it above." : "Not graded yet" }];
  const e = s.efficiency;
  const efficiency: Line[] = [
    { what: `Due by the end of ${shortDay(e.due)}` },
    e.sentAt ? { what: `Handed over ${when(e.sentAt)}${e.late ? `, ${plural(e.late, "working day")} late` : ", on time"}`, pts: pts(e.late * scoring.lateDay, "−") } : { what: "Not handed over yet" },
    ...e.rounds.map((r, i) => ({
      what: `Revision ${i + 1} (${r.byClient ? "the client's" : "ours"}): asked ${when(r.requestedAt)}${r.backAt ? `, back ${when(r.backAt)}${r.hours !== null ? ` after ${hoursLabel(r.hours)}` : ""}${r.late ? `, ${plural(r.late, "day")} late` : ""}` : ", not back yet"}`,
      pts: pts((r.byClient ? 0 : scoring.revision) + r.late * scoring.lateRevisionDay, "−"),
    })),
  ];
  const c = s.client;
  const client: Line[] = c.reached
    ? [
        ...(c.creative ? [{ what: `${plural(c.creative, "creative change")} asked for`, pts: pts(c.creative * scoring.clientCreative, "−") }] : []),
        ...(c.mistakes ? [{ what: `${plural(c.mistakes, "mistake")} the client found`, pts: pts(c.mistakes * scoring.clientMistake, "−") }] : []),
        ...(!c.creative && !c.mistakes ? [{ what: "Accepted as it was" }] : []),
      ]
    : [{ what: "Not with the client yet" }];
  const parts: { part: Part; letter: Letter | null; score: number | null; lines: Line[] }[] = [
    { part: "quality", letter: s.letter.quality, score: q.score, lines: quality },
    { part: "efficiency", letter: s.letter.efficiency, score: e.score, lines: efficiency },
    { part: "client", letter: s.letter.client, score: c.score, lines: client },
  ];

  const mistakes = feedback.filter((f) => f.kind === "mistake" || f.kind === "creative");
  const said = feedback.filter((f) => f.kind === "positive" || f.kind === "negative" || f.kind === "guidance");
  const dialog = { editorId: task.assignedTo.id, tasks: [{ id: video.id, title: video.title }], clients: [], categories, scoring, today: dayOf(new Date()) };
  const card = "rounded-2xl border border-border bg-surface-2/30 p-5";
  const stage = STAGE[task.status];

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/performance/${task.assignedTo.id}`} className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> {canEdit ? task.assignedTo.name : "My scorecard"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <TierMark tier={tier} />
            <span className="min-w-0 break-words">{video.title}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{[video.client, task.project.name || task.project.type].filter(Boolean).join(" · ")}</span>
            {canEdit && <span>{task.assignedTo.name}</span>}
            <span className={`rounded-full border px-2.5 py-0.5 ${stage.pill}`}>{stage.label}</span>
            <span>{s.type}</span>
          </p>
        </div>
        {task.frameioLink && (
          <a href={task.frameioLink} target="_blank" rel="noreferrer" className="btn btn-ghost flex items-center gap-1.5">
            <ExternalLink size={14} /> Frame.io
          </a>
        )}
      </div>

      <section className={`${card} grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-10`}>
        <div className="flex items-center gap-4">
          <GradeBadge grade={s.letter.overall} size="lg" />
          <div className="flex flex-col gap-0.5">
            <span className="text-2xl font-semibold tracking-tight">
              {s.letter.overall ? LETTER_LABEL[s.letter.overall] : "Awaiting grade"}
              {numbers && s.overall !== null && <span className="ml-2 text-base font-normal text-muted tabular-nums">{s.overall}</span>}
            </span>
            <span className="text-sm text-muted">{[facts.quality, facts.efficiency].join(" · ")}</span>
          </div>
        </div>
        {canEdit ? (
          <div className="max-w-sm">
            <GradeControl taskId={video.id} grade={q.grade} />
          </div>
        ) : (
          <p className="self-center text-sm text-muted">{q.grade ? `Graded ${q.grade}${inspector ? ` by ${inspector.name}` : ""}${video.inspectedAt ? ` on ${shortDay(dayOf(video.inspectedAt))}` : ""}.` : "Not graded yet."}</p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {parts.map((p) => (
          <section key={p.part} className={`${card} flex flex-col gap-4`}>
            <div className="flex items-center gap-3">
              <GradeBadge grade={p.letter} />
              <div>
                <h2 className="text-base font-semibold">{PART_LABEL[p.part]}</h2>
                <p className="text-sm text-muted">
                  {p.letter ? LETTER_LABEL[p.letter] : "Pending"}
                  {numbers && p.score !== null && <span className="ml-1.5 tabular-nums">{p.score}</span>}
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-2 border-t border-border/60 pt-3 text-sm">
              {p.lines.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-foreground/85">{l.what}</span>
                  {l.pts && <span className={`shrink-0 tabular-nums ${l.pts.startsWith("−") ? "text-rose-300" : l.pts.startsWith("+") ? "text-accent" : "text-muted"}`}>{l.pts}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Mistakes and changes</h2>
        <MistakeList entries={mistakes} canEdit={canEdit} {...dialog} />
      </section>
      {said.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Feedback</h2>
          <FeedbackList entries={said} canEdit={canEdit} {...dialog} />
        </section>
      )}
    </div>
  );
}
