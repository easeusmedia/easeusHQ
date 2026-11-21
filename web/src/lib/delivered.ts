import { prisma } from "./prisma";
import { parseStageChange } from "./stages";

// When each task was last marked delivered, from the activity log: not its
// updatedAt, which moves with any later edit (a Notion sync). No entry
// means no move was ever recorded here (it arrived from Notion already
// delivered); each caller decides what that means for it.
export async function deliveredAt(taskIds: string[]): Promise<Map<string, Date>> {
  return (await lastMoves(taskIds)).get("delivered_and_uploaded") ?? new Map();
}

// When the editor's part was done (Team work, Abhishek, 19 Nov 2026): its
// last move into Final export ready, else into Delivered. For a Production
// Member (`toClient`, 21 Nov 2026), its last move into Sent for client
// approval comes first: their part ends when it goes to the client.
export async function finishedAt(taskIds: string[], toClient = false): Promise<Map<string, Date>> {
  const moves = await lastMoves(taskIds);
  return new Map([
    ...(moves.get("delivered_and_uploaded") ?? []),
    ...(moves.get("final_export_ready") ?? []),
    ...(toClient ? (moves.get("sent_for_client_approval") ?? []) : []),
  ]);
}

// each task's last move into each stage, by stage
async function lastMoves(taskIds: string[]): Promise<Map<string, Map<string, Date>>> {
  const by = new Map<string, Map<string, Date>>();
  if (!taskIds.length) return by;
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: { in: taskIds } },
    select: { entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const l of logs) {
    const to = parseStageChange(l.action)?.to;
    if (to) by.set(to, (by.get(to) ?? new Map()).set(l.entityId, l.createdAt));
  }
  return by;
}

// A file delivered and uploaded: its task marked so; with no task (one
// brought in from Notion), its own final link in. A Frame.io link is only for
// review. ponytail: by the link's host; a task on every file would settle it
export const fileIn = (a: { link: string | null; task: { status: string } | null }) =>
  a.task ? a.task.status === "delivered_and_uploaded" : !!a.link && !/^https?:\/\/(?:[^/]*\.)?(?:f\.io|frame\.io)(?:[/?#]|$)/i.test(a.link);
