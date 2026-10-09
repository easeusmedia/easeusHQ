import { prisma } from "./prisma";
import { dayOf, isReplied, leadEmails, type Contact } from "./space";

// A lead that writes back leaves the sequence for its board's Replied stage
// by itself (9 Oct 2026, Abhishek): a reply by email (from the sales inbox),
// or Replied tapped for Instagram or LinkedIn. Only from a day of the
// sequence. It goes to the top of Replied, and its record says how it replied.

type By = { id: string; name: string };
const INBOX: By = { id: "sales-inbox", name: "Sales inbox" };

// Into another stage, at its top, if it's still where it was (two replies
// at once move it once)
async function shift(lead: { id: string; stageId: string; stageName: string }, to: { id: string; name: string }, by: By, reason: string) {
  return prisma.$transaction(async (tx) => {
    const top = await tx.lead.aggregate({ where: { stageId: to.id }, _min: { sortOrder: true } });
    const { count } = await tx.lead.updateMany({ where: { id: lead.id, stageId: lead.stageId }, data: { stageId: to.id, sortOrder: (top._min.sortOrder ?? 1) - 1, stageSince: new Date() } });
    if (count) {
      await tx.leadEvent.create({
        data: { leadId: lead.id, kind: "moved", summary: `Moved from ${lead.stageName} to ${to.name}`, fromStage: lead.stageName, toStage: to.name, reason, byId: by.id, byName: by.name },
      });
    }
    return count > 0;
  });
}

export async function moveToReplied(leadId: string, by: By, reason: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, boardId: true, stageId: true, stage: { select: { name: true } } } });
  if (!lead || dayOf(lead.stage.name) == null) return false;
  const stages = await prisma.boardStage.findMany({ where: { boardId: lead.boardId }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } });
  const to = stages.find((s) => isReplied(s.name));
  return !!to && shift({ ...lead, stageName: lead.stage.name }, to, by, reason);
}

// Replied untapped while the lead is still where that tap put it: back to
// the day it came from
export async function undoReplied(leadId: string, by: By, movedFor: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, boardId: true, stageId: true, stage: { select: { name: true } }, events: { where: { kind: "moved" }, orderBy: { createdAt: "desc" }, take: 1, select: { fromStage: true, toStage: true, reason: true } } },
  });
  const last = lead?.events[0];
  if (!lead || !last?.fromStage || last.reason !== movedFor || last.toStage !== lead.stage.name) return false;
  const back = await prisma.boardStage.findFirst({ where: { boardId: lead.boardId, name: last.fromStage }, select: { id: true, name: true } });
  return !!back && shift({ ...lead, stageName: lead.stage.name }, back, by, `${movedFor}, undone`);
}

// The contact an address belongs to, by name (else the address)
const nameIn = (values: unknown, address: string) =>
  Object.values((values ?? {}) as Record<string, unknown>)
    .flatMap((v) => (Array.isArray(v) ? (v as Contact[]) : []))
    .find((c) => c?.channels?.some((ch) => ch.value?.trim().toLowerCase() === address))
    ?.name?.trim() || address;

// New mail in the sales inbox from people: each lead on a day that one of
// its addresses wrote to (since it was added, an hour's grace) has replied
export async function moveRepliedByEmail(replies: { from: string; at: Date }[]) {
  if (!replies.length) return;
  const leads = await prisma.lead.findMany({ where: { stage: { name: { startsWith: "Day " } } }, select: { id: true, values: true, createdAt: true } });
  for (const l of leads) {
    const mine = leadEmails(l.values);
    const reply = replies.find((r) => mine.includes(r.from) && r.at.getTime() >= l.createdAt.getTime() - 3_600_000);
    if (reply) await moveToReplied(l.id, INBOX, `${nameIn(l.values, reply.from)} replied by email`);
  }
}
