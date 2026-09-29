import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CircleAlert, Clapperboard, Crosshair, Timer, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { dayOf, PART_LABEL, PART_ORDER, periodFrom, trendSpans } from "@/lib/editorKpi";
import { StatTile } from "../StatTile";
import { Avatar } from "../TaskCard";
import { Delta, GradeBadge, PartBar, PeriodBar, TargetsEditor, TrendStrip } from "./ui";
import { SyncFrameio } from "./SyncFrameio";
import { loadPerformance } from "./data";
import { AGAINST, partNote, partText, periodQuery } from "./shared";

export const dynamic = "force-dynamic";

// The editing team at a glance, for core: each editor's grade for the week,
// month or range chosen, whether it's up or down on the one before, the
// five parts it's made of, and the issue most worth talking about. An
// editor opens to everything behind it; an editor who comes here is taken
// to their own page.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!me) redirect("/login");
  if (me.role === "employee") redirect(`/performance/${me.id}`);

  const today = dayOf(new Date());
  const period = periodFrom(await searchParams, today);
  const spans = trendSpans(period.kind === "month" ? "month" : "week", period.to, 6);
  const [data, kinds] = await Promise.all([
    loadPerformance({ from: [period.prev.from, spans[0].from].sort()[0] }),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const t = data.targets;
  const query = periodQuery(period);

  const rows = data.editors.map((e) => {
    const now = data.score(period.from, period.to, e.id);
    const before = data.score(period.prev.from, period.prev.to, e.id);
    const open = data.open.filter((x) => x.assignedToId === e.id);
    const issues = data.issues.filter((i) => i.editorId === e.id && !i.resolvedDay).sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
    return {
      e,
      now,
      delta: now.score !== null && before.score !== null ? now.score - before.score : null,
      series: spans.map((s) => data.score(s.from, s.to, e.id).score),
      open: open.length,
      overdue: open.filter((x) => x.dueDate && !x.handedOffAt && dayOf(x.dueDate) < today).length,
      issues,
    };
  });
  const team = data.score(period.from, period.to);
  const pending = rows.filter((r) => r.now.toConfirm > 0);
  const openIssues = rows.reduce((n, r) => n + r.issues.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
        <div className="mr-auto pr-4">
          <h1 className="text-2xl font-semibold tracking-tight">Editor performance</h1>
          <p className="mt-1.5 text-sm text-muted">How each editor is doing, what keeps coming back, and where they need help.</p>
        </div>
        <SyncFrameio />
        {canEditPeople(me) && <TargetsEditor targets={t} kinds={kinds.map((k) => k.name)} />}
        <PeriodBar period={period} today={today} />
      </div>

      {pending.length > 0 && (
        <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-2/40 px-4 py-2.5 text-sm">
          <CircleAlert size={14} className="shrink-0 text-muted" />
          <span className="text-muted">Mistakes found in Frame.io comments count once you confirm them:</span>
          {pending.map((r) => (
            <Link key={r.e.id} href={`/performance/${r.e.id}?${query}${query ? "&" : ""}tab=feedback`} className="font-medium hover:underline">
              {r.e.name.split(" ")[0]} {r.now.toConfirm}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Completed" value={team.completed} Icon={Clapperboard} note={<span className="text-xs text-muted">{team.units} of {team.outputTarget} reel-equivalents</span>} />
        <StatTile
          label="Within standard"
          value={team.onStandardPct === null ? "–" : `${team.onStandardPct}%`}
          lit={team.onStandardPct !== null}
          Icon={Timer}
          note={<span className="text-xs text-muted">Edit time against each type · aim {t.onStandardPct}%</span>}
        />
        <StatTile label="Mistakes a video" value={team.mistakesPerVideo ?? "–"} lit={team.mistakesPerVideo !== null} Icon={TriangleAlert} note={<span className="text-xs text-muted">Aim for {t.mistakesPerVideo} or fewer</span>} />
        <StatTile label="Open issues" value={openIssues} Icon={Crosshair} note={<span className="text-xs text-muted">Recurring mistakes, across the team</span>} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No editors on the team yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.e.id}>
              <Link
                href={`/performance/${r.e.id}${query ? `?${query}` : ""}`}
                className="group grid items-center gap-x-8 gap-y-4 rounded-2xl panel-soft panel-hover p-5 md:grid-cols-[minmax(13rem,1fr)_minmax(0,2.6fr)_auto]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <GradeBadge score={r.now.score} grade={r.now.grade} light={!r.now.enough && r.now.completed > 0} />
                  <Avatar name={r.e.name} size={36} presence={false} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.e.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.now.completed} completed · {r.open} open
                      {r.overdue > 0 && <span className="text-rose-300"> · {r.overdue} overdue</span>}
                    </span>
                    <span className="mt-0.5 block">
                      <Delta delta={r.delta} against={AGAINST[period.kind]} />
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
                  {PART_ORDER.map((p) => (
                    <PartBar key={p} label={PART_LABEL[p]} text={partText(p, r.now)} points={r.now.parts[p].points} note={partNote(p, r.now)} />
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden flex-col items-end gap-1 lg:flex">
                    <TrendStrip scores={r.series} labels={spans.map((s) => s.label)} />
                    <span className="text-[10px] text-muted">{period.kind === "month" ? "Last six months" : "Last six weeks"}</span>
                  </div>
                  <ChevronRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
                </div>

                {r.issues.length > 0 && (
                  <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-xs text-foreground/80 md:col-span-3">
                    <Crosshair size={12} className="mt-0.5 shrink-0 text-accent" />
                    <span>
                      <span className="text-muted">Keeps coming back: </span>
                      {r.issues.map((i) => i.title).join(", ")}
                    </span>
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        A part scores 100 at its target or better, less the further it falls short. Grades: A from {t.grades.A}, B {t.grades.B}, C {t.grades.C}, D below. Fewer than two videos
        completed isn&apos;t graded. Only confirmed mistakes count; creative direction never does.
      </p>
    </div>
  );
}
