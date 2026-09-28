import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CircleAlert, Clapperboard, Clock, RotateCcw, ThumbsUp, Timer } from "lucide-react";
import { requireOps } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { indiaDay } from "@/lib/due";
import { editorKpis, hoursLabel, insights, meets, monthName, shiftMonth } from "@/lib/editorKpi";
import { StatTile } from "../StatTile";
import { Avatar } from "../TaskCard";
import { GradeBadge, MonthSwitch, TargetDot, TargetNote, TargetsEditor } from "./ui";
import { SyncFrameio } from "./SyncFrameio";
import { headline, kpiTargets, loadPerformance, pickMonth } from "./data";

export const dynamic = "force-dynamic";

// The editing team, a month at a time: the team's numbers, then each editor
// as a card with their grade, the five numbers against their targets, and
// the one thing going well and the one to talk about. Everything else is a
// click away on their own page.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireOps();
  if (!me) redirect("/board");

  const today = indiaDay(new Date());
  const thisMonth = today.slice(0, 7);
  const month = pickMonth((await searchParams).month, thisMonth);
  const prev = shiftMonth(month, -1);
  const [data, targets] = await Promise.all([loadPerformance(month, 2), kpiTargets()]);

  const team = editorKpis(...data.slice(month));
  const before = editorKpis(...data.slice(prev));
  const cards = data.editors.map((e) => {
    const now = editorKpis(...data.slice(month, e.id));
    const open = data.open.filter((t) => t.assignedToId === e.id);
    return {
      e,
      now,
      said: insights(now, editorKpis(...data.slice(prev, e.id)), targets),
      open: open.length,
      overdue: open.filter((t) => t.dueDate && indiaDay(t.dueDate) < today).length,
      toReview: data.entries.filter((x) => x.editorId === e.id && !x.reviewed && x.day.startsWith(month)).length,
    };
  });

  const change = team.delivered - before.delivered;
  const note = (ok: boolean | null, text: string) => <TargetNote ok={ok} text={text} />;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editor performance</h1>
          <p className="mt-1.5 text-sm text-muted">How each editor&apos;s month is going, what&apos;s going well and where they could use support.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncFrameio />
          {canEditPeople(me) && <TargetsEditor targets={targets} />}
          <MonthSwitch month={month} thisMonth={thisMonth} base="/performance" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Videos delivered"
          value={team.delivered}
          Icon={Clapperboard}
          note={<span className="text-xs text-muted">{`${change > 0 ? "+" : ""}${change} on ${monthName(prev, false)}`}</span>}
        />
        <StatTile
          label="Turnaround, typical"
          value={team.turnaroundHours === null ? "–" : hoursLabel(team.turnaroundHours)}
          lit={team.turnaroundHours !== null}
          Icon={Timer}
          note={note(meets("turnaroundHours", team.turnaroundHours, targets), `Target ${hoursLabel(targets.turnaroundHours)} or less`)}
        />
        <StatTile
          label="Mistakes found"
          value={team.mistakes}
          lit={team.mistakes > 0}
          Icon={CircleAlert}
          note={<span className="text-xs text-muted">{team.mistakesPerVideo === null ? "No videos yet" : `${team.mistakesPerVideo} per video`}</span>}
        />
        <StatTile
          label="Revisions per video"
          value={team.revisions ?? "–"}
          lit={team.revisions !== null}
          Icon={RotateCcw}
          note={note(meets("revisions", team.revisions, targets), `Target ${targets.revisions} or fewer`)}
        />
        <StatTile
          label="On time"
          value={team.onTimePct === null ? "–" : `${team.onTimePct}%`}
          lit={team.onTimePct !== null}
          Icon={Clock}
          note={note(meets("onTimePct", team.onTimePct, targets), `Target ${targets.onTimePct}%`)}
        />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No editors on the team yet.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cards.map(({ e, now, said, open, overdue, toReview }) => (
            <Link
              key={e.id}
              href={`/performance/${e.id}${month === thisMonth ? "" : `?month=${month}`}`}
              className="group flex flex-col gap-5 rounded-2xl panel-soft panel-hover p-5 hover:-translate-y-px"
            >
              <div className="flex items-center gap-3">
                <Avatar name={e.name} size={40} presence={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {e.jobTitle?.name ?? "Editor"} · {open} open now
                    {overdue > 0 && <span className="text-red-300"> · {overdue} overdue</span>}
                  </span>
                </span>
                <GradeBadge grade={now.grade} size="lg" />
              </div>

              <div className="grid grid-cols-5 gap-2">
                {headline(now, targets).map((m) => (
                  <div key={m.key} className="min-w-0 rounded-xl bg-surface-2/50 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-base font-semibold tabular-nums">
                      {m.text}
                      <TargetDot ok={m.ok} />
                    </span>
                    <span className="block truncate text-xs text-muted">{m.label}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5 text-xs">
                {said.good[0] && (
                  <p className="flex items-start gap-2 text-foreground/80">
                    <ThumbsUp size={12} className="mt-0.5 shrink-0 text-muted" /> {said.good[0]}
                  </p>
                )}
                {said.watch[0] && (
                  <p className="flex items-start gap-2 text-foreground/80">
                    <CircleAlert size={12} className="mt-0.5 shrink-0 text-muted" /> {said.watch[0]}
                  </p>
                )}
                {!said.good[0] && !said.watch[0] && <p className="text-muted">Not enough this month to say yet.</p>}
              </div>

              <div className="mt-auto flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1 transition-colors group-hover:text-foreground">
                  View details <ArrowUpRight size={12} />
                </span>
                {toReview > 0 && <span className="rounded-full bg-accent/12 px-2 py-0.5 text-accent">{toReview} to review</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="-mt-4 text-xs text-muted">
        Turnaround runs from assigning a video to it first reaching the client. Mistakes come from Frame.io review comments, sorted automatically, and from what ops
        logs; the grade follows the Notion review. A stage put straight back by mistake doesn&apos;t count as a revision.
      </p>
    </div>
  );
}
