import { prisma } from "./prisma";
import { dayOf } from "./editorKpi";
import { AFTER, dueReminders } from "./space.ts";

// Parked for later (Abhishek, 20 Nov 2026): a lead the team is to reach out
// to again on a day picked in its window. That day, whoever has the lead
// (else whoever added it) gets a notice. Run each night with the rest
// (api/cron/analytics).

export async function sweepParked(now = new Date()): Promise<number> {
  const leads = await prisma.lead.findMany({
    where: { stage: { name: { startsWith: "parked", mode: "insensitive" } } },
    select: { id: true, title: true, vars: true, assignedToId: true, createdById: true, stage: { select: { name: true } }, board: { select: { name: true } } },
  });
  const due = dueReminders(leads, dayOf(now));
  for (const l of due) {
    const until = (l.vars as Record<string, string>)[AFTER.until];
    await prisma.$transaction([
      prisma.notice.create({ data: { forId: l.assignedToId ?? l.createdById, kind: "note", body: `Reach out to ${l.title} again today. It was parked for later on ${l.board.name}.` } }),
      prisma.$executeRaw`UPDATE "Lead" SET "vars" = jsonb_set(coalesce("vars", '{}'::jsonb), ARRAY[${AFTER.told}::text], ${JSON.stringify(until)}::jsonb, true) WHERE id = ${l.id}`,
    ]);
  }
  return due.length;
}
