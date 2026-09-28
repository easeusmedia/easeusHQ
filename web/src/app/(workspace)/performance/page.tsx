import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, CircleAlert, Clapperboard, Clock, Gauge, ThumbsUp, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { indiaDay } from "@/lib/due";
import { editorKpis, insights, letter, PART_LABEL, shiftMonth, type Part } from "@/lib/editorKpi";
import { StatTile } from "../StatTile";
import { Avatar } from "../TaskCard";
import { MonthSwitch, PartBar, ScoreBadge, TargetsEditor, WeekStrip } from "./ui";
import { SyncFrameio } from "./SyncFrameio";
import { kpiTargets, loadPerformance, monthShare, PART_NOTE, partText, pickMonth, weeklyScores } from "./data";

export const dynamic = "force-dynamic";

// The editing team, a month at a time. Each editor is one row: their score
// out of 100, the four parts it's made of against their targets, how the
// month has gone week by week, and the one thing most worth talking about.
// Everything behind it is a click away.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireOps();
  if (!me) redirect("/board");

  const today = indiaDay(new Date());
  const thisMonth = today.slice(0, 7);
  const month = pickMonth((await searchParams).month, thisMonth);
  const prev = shiftMonth(month, -1);
  const share = monthShare(month, today);
  const [data, targets, kinds] = await Promise.all([
    loadPerformance(month, 2),
    kpiTargets(),
    prisma.taskTag.findMany({ where: { team: { slug: "operations" } }, select: { name: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // the month so far, week by week: the score as it stood at each week's end
  const weeks = (who?: string) => weeklyScores(data, month, today, targets, who);

  const rows = data.editors.map((e) => {
    const now = editorKpis(...data.slice(month, e.id), targets, share);
    const open = data.open.filter((t) => t.assignedToId === e.id);
    const said = insights(now, editorKpis(...data.slice(prev, e.id), targets));
    return {
      e,
      now,
      weeks: weeks(e.id),
      line: said.watch[0] ? { good: false, text: said.watch[0] } : said.good[0] ? { good: true, text: said.good[0] } : null,
      open: open.length,
      overdue: open.filter((t) => t.dueDate && indiaDay(t.dueDate) < today).length,
      toReview: data.entries.filter((x) => x.editorId === e.id && !x.reviewed && x.kind === "mistake" && x.day.startsWith(month)).length,
    };
  });
  const team = editorKpis(...data.slice(month), targets, share);
  const scored = rows.filter((r) => r.now.score !== null);
  const teamScore = scored.length ? Math.round(scored.reduce((n, r) => n + r.now.score!, 0) / scored.length) : null;
  const pending = rows.filter((r) => r.toReview > 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editor performance</h1>
          <p className="mt-1.5 text-sm text-muted">Each editor&apos;s month as a score out of 100: quality, deadlines, revisions and output.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncFrameio />
          {canEditPeople(me) && <TargetsEditor targets={targets} kinds={kinds.map((k) => k.name)} />}
          <MonthSwitch month={month} thisMonth={thisMonth} base="/performance" />
        </div>
      </div>

      {pending.length > 0 && (
        <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-2/40 px-4 py-2.5 text-sm">
          <CircleAlert size={14} className="shrink-0 text-muted" />
          <span className="text-muted">Mistakes found in Frame.io comments count once you confirm them:</span>
          {pending.map((r) => (
            <Link key={r.e.id} href={`/performance/${r.e.id}?tab=feedback${month === thisMonth ? "" : `&month=${month}`}`} className="font-medium hover:underline">
              {r.e.name.split(" ")[0]} {r.toReview}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={teamScore === null ? "Team score" : `Team score · ${letter(teamScore)}`} value={teamScore ?? "–"} lit={teamScore !== null} Icon={Gauge} />
        <StatTile label="Videos delivered" value={team.delivered} Icon={Clapperboard} note={<span className="text-xs text-muted">{team.units} weighted</span>} />
        <StatTile label="Mistakes per video" value={team.mistakesPerVideo ?? "–"} lit={team.mistakesPerVideo !== null} Icon={TriangleAlert} note={<span className="text-xs text-muted">Aim for {targets.mistakesPerVideo} or fewer</span>} />
        <StatTile label="First drafts on time" value={team.onTimePct === null ? "–" : `${team.onTimePct}%`} lit={team.onTimePct !== null} Icon={Clock} note={<span className="text-xs text-muted">Aim for {targets.onTimePct}%</span>} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No editors on the team yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.e.id}>
              <Link
                href={`/performance/${r.e.id}${month === thisMonth ? "" : `?month=${month}`}`}
                className="group grid items-center gap-x-8 gap-y-4 rounded-2xl panel-soft panel-hover p-5 md:grid-cols-[minmax(12rem,1fr)_minmax(0,2.4fr)_auto]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ScoreBadge score={r.now.score} grade={r.now.grade} />
                  <Avatar name={r.e.name} size={36} presence={false} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.e.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.open} open{r.overdue > 0 && <span className="text-red-300"> · {r.overdue} overdue</span>} · {r.now.delivered} delivered
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                  {(Object.keys(PART_LABEL) as Part[]).map((p) => (
                    <PartBar key={p} label={`${PART_LABEL[p]} · ${r.now.parts[p].weight}%`} text={partText(p, r.now)} points={r.now.parts[p].points} note={PART_NOTE[p](r.now.parts[p].target)} />
                  ))}
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden flex-col items-end gap-1 lg:flex">
                    <WeekStrip weeks={r.weeks} />
                    <span className="text-[10px] text-muted">By week</span>
                  </div>
                  <ChevronRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
                </div>

                {r.line && (
                  <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-xs text-foreground/80 md:col-span-3">
                    {r.line.good ? <ThumbsUp size={12} className="mt-0.5 shrink-0 text-muted" /> : <CircleAlert size={12} className="mt-0.5 shrink-0 text-muted" />}
                    {r.line.text}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Each part scores 100 at its target or better and less the further it falls short. Quality counts mistakes per video; deadlines, first drafts sent for our
        review by the due date; output weighs each kind of work ({Object.entries(targets.typeWeights).map(([k, w]) => `${k.toLowerCase()} ${w}`).join(", ")}, anything else 1). A month still running is judged on the days so far. Grades: A+ 95, A 85, B 75, C 65, D 50.
      </p>
    </div>
  );
}
