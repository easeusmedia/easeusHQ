import { prisma } from "./prisma";
import { parseStageChange } from "./stages";

// When each task was last marked delivered, from the activity log: not its
// updatedAt, which moves with any later edit (a Notion sync). No entry
// means no move was ever recorded here (it arrived from Notion already
// delivered); each caller decides what that means for it.
export async function deliveredAt(taskIds: string[]): Promise<Map<string, Date>> {
  if (!taskIds.length) return new Map();
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: { in: taskIds } },
    select: { entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const at = new Map<string, Date>();
  for (const l of logs) if (parseStageChange(l.action)?.to === "delivered_and_uploaded") at.set(l.entityId, l.createdAt);
  return at;
}
