import { redirect } from "next/navigation";
import { CircleCheck, Clock, Clapperboard, PenLine } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { indiaDay } from "@/lib/due";
import { displayTeam } from "@/lib/teams";
import { LIVE_TASK } from "@/lib/workflow";
import { parseStageChange } from "@/lib/stages";
import { DEFAULT_TARGETS, KPI_TARGETS, editorKpis, hoursLabel, meets, monthName, shiftMonth, type KpiTask, type Targets } from "@/lib/editorKpi";
import { StatTile } from "../StatTile";
import { EditorRows, PerformanceHeader } from "./PerformanceView";

export const dynamic = "force-dynamic";

// the moment a month starts in India
const monthStart = (ym: string) => new Date(`${ym}-01T00:00:00+05:30`);

// The editing team, a month at a time: each editor's numbers against the
// targets the admin sets, and the team's as a whole on top. A row opens to
// what's behind its numbers.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireOps();
  if (!me) redirect("/board");

  const today = indiaDay(new Date());
  const thisMonth = today.slice(0, 7);
  const asked = (await searchParams).month ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
  const prev = shiftMonth(month, -1);

  const [people, setting] = await Promise.all([
    prisma.user.findMany({ where: { employment: { not: "former" } }, include: { team: true }, orderBy: { name: "asc" } }),
    prisma.appSetting.findUnique({ where: { key: KPI_TARGETS } }),
  ]);
  const editors = people.filter((p) => displayTeam(p)?.slug === "editors");
  const ids = editors.map((e) => e.id);
  let targets: Targets = DEFAULT_TARGETS;
  try {
    targets = { ...DEFAULT_TARGETS, ...JSON.parse(setting?.value ?? "{}") };
  } catch {}

  const [delivered, open] = await Promise.all([
    // updatedAt only ever moves forward, so this catches everything
    // delivered in the two months, and a little more to sort out below
    prisma.task.findMany({
      where: { assignedToId: { in: ids }, status: "delivered_and_uploaded", updatedAt: { gte: monthStart(prev) } },
      select: { id: true, title: true, assignedToId: true, createdAt: true, updatedAt: true, dueDate: true, handedOffAt: true, tags: { select: { name: true } } },
    }),
    prisma.task.findMany({ where: { assignedToId: { in: ids }, ...LIVE_TASK }, select: { assignedToId: true, dueDate: true } }),
  ]);
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: { in: delivered.map((t) => t.id) } },
    select: { entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const movesOf = new Map<string, KpiTask["moves"]>();
  for (const l of logs) {
    const move = parseStageChange(l.action);
    if (move) movesOf.set(l.entityId, [...(movesOf.get(l.entityId) ?? []), { at: l.createdAt, from: move.from, to: move.to }]);
  }
  const tasks = delivered.map((t) => {
    const moves = movesOf.get(t.id) ?? [];
    // when it was last marked delivered, rather than when the row last changed
    const deliveredAt = moves.findLast((m) => m.to === "delivered_and_uploaded")?.at ?? t.updatedAt;
    const kpi: KpiTask = {
      title: t.title,
      createdAt: t.createdAt,
      deliveredAt,
      dueDate: t.dueDate,
      handedOffAt: t.handedOffAt,
      tags: t.tags.map((x) => x.name),
      moves,
    };
    return { editor: t.assignedToId, month: indiaDay(deliveredAt).slice(0, 7), kpi };
  });
  const inMonth = (ym: string, editor?: string) => tasks.filter((t) => t.month === ym && (!editor || t.editor === editor)).map((t) => t.kpi);

  const team = editorKpis(inMonth(month));
  const before = editorKpis(inMonth(prev));
  const rows = editors.map((e) => {
    const mine = open.filter((t) => t.assignedToId === e.id);
    return {
      id: e.id,
      name: e.name,
      kpis: editorKpis(inMonth(month, e.id)),
      open: mine.length,
      overdue: mine.filter((t) => t.dueDate && indiaDay(t.dueDate) < today).length,
    };
  });

  const change = team.delivered - before.delivered;
  const target = (ok: boolean | null, text: string) => <span className={`text-xs ${ok === false ? "text-amber-300" : "text-muted"}`}>{text}</span>;

  return (
    <div className="flex flex-col gap-8">
      <PerformanceHeader month={month} thisMonth={thisMonth} targets={targets} canEdit={canEditPeople(me)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Videos delivered"
          value={team.delivered}
          Icon={Clapperboard}
          note={<span className="text-xs text-muted">{`${change > 0 ? "+" : ""}${change} on ${monthName(prev, false)}`}</span>}
        />
        <StatTile
          label="On time"
          value={team.onTimePct === null ? "–" : `${team.onTimePct}%`}
          lit={team.onTimePct !== null}
          tone={meets("onTimePct", team.onTimePct, targets) ? "emerald" : "accent"}
          Icon={Clock}
          note={target(meets("onTimePct", team.onTimePct, targets), `Target ${targets.onTimePct}%`)}
        />
        <StatTile
          label="Approved first time"
          value={team.firstPassPct === null ? "–" : `${team.firstPassPct}%`}
          lit={team.firstPassPct !== null}
          tone={meets("firstPassPct", team.firstPassPct, targets) ? "emerald" : "accent"}
          Icon={CircleCheck}
          note={target(meets("firstPassPct", team.firstPassPct, targets), `Target ${targets.firstPassPct}%`)}
        />
        <StatTile
          label="First draft, median"
          value={team.draftHours === null ? "–" : hoursLabel(team.draftHours)}
          lit={team.draftHours !== null}
          tone={meets("draftHours", team.draftHours, targets) ? "emerald" : "accent"}
          Icon={PenLine}
          note={target(meets("draftHours", team.draftHours, targets), `Target ${hoursLabel(targets.draftHours)} or less`)}
        />
      </div>

      <EditorRows rows={rows} targets={targets} />

      <p className="-mt-4 text-xs text-muted">
        On time means it reached the client by its due date. Approved first time means it was never sent back, by our review or the client&apos;s. A first
        draft runs from picking it up from the queue to first sending it for review. A stage put straight back by mistake doesn&apos;t count.
      </p>
    </div>
  );
}
