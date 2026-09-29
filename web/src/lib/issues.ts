import { prisma } from "./prisma";
import { dayOf, issuePlan, type Mark } from "./editorKpi";

// Brings editors' issue queues up to date with what's been confirmed: a
// kind of mistake now recurring opens an issue; one that was resolved and
// has come back reopens. Run whenever mistakes are confirmed or logged, and
// after every Frame.io sync. Safe to run any number of times.
export async function syncIssues(editorIds?: string[]) {
  // people still on the team; someone who has left keeps their record as it was
  const current = await prisma.user.findMany({ where: { employment: { not: "former" }, ...(editorIds ? { id: { in: editorIds } } : {}) }, select: { id: true } });
  const where = { editorId: { in: current.map((u) => u.id) } };
  const [mistakes, issues] = await Promise.all([
    prisma.performanceEntry.findMany({
      where: { ...where, kind: "mistake", reviewed: true },
      select: { editorId: true, category: true, taskId: true, at: true, count: true },
    }),
    prisma.focusArea.findMany({ where, select: { id: true, editorId: true, category: true, resolvedAt: true } }),
  ]);
  const today = dayOf(new Date());
  const editors = new Set(mistakes.map((m) => m.editorId));
  for (const editorId of editors) {
    const marks: Mark[] = mistakes
      .filter((m) => m.editorId === editorId)
      .map((m) => ({ category: m.category ?? "Others", taskId: m.taskId, day: dayOf(m.at), count: m.count }));
    const plan = issuePlan(
      issues.filter((i) => i.editorId === editorId).map((i) => ({ id: i.id, category: i.category, resolvedDay: i.resolvedAt ? dayOf(i.resolvedAt) : null })),
      marks,
      today
    );
    if (plan.open.length) {
      await prisma.focusArea.createMany({
        data: plan.open.map((o) => ({ editorId, title: o.category, category: o.category, auto: true, openedAt: new Date(`${o.first}T12:00:00+05:30`) })),
      });
    }
    if (plan.reopen.length) {
      await prisma.focusArea.updateMany({ where: { id: { in: plan.reopen } }, data: { resolvedAt: null, reopenedAt: new Date(), reopens: { increment: 1 } } });
    }
  }
}
