import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { prisma } from "@/lib/prisma";
import { driveLocation } from "@/lib/drive";
import { isFounder, isLead, seesTeamWork } from "@/lib/scope";

export const dynamic = "force-dynamic";

// Where a task's Final Drive file sits in Drive, for the task window once
// it's open (team-work/PersonWork). A route rather than a server action:
// Drive is asked folder by folder, and server actions run one at a time, so
// it would hold up the next task opening. Only for whoever could open the
// task: Team work's people (openTask), or anyone but a Member from its
// project page, never a Founder's task for a Lead (openFileTask).
export async function GET(req: Request) {
  const viewer = await getViewer();
  const taskId = new URL(req.url).searchParams.get("task");
  if (!viewer || !taskId) return NextResponse.json({ where: null }, { status: 403 });
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { driveLink: true, assignedTo: { select: { role: true, email: true } } } });
  const opens = seesTeamWork(viewer) || (viewer.role !== "employee" && !(isLead(viewer) && t?.assignedTo && isFounder(t.assignedTo)));
  if (!opens) return NextResponse.json({ where: null }, { status: 403 });
  return NextResponse.json({ where: t?.driveLink ? await driveLocation(t.driveLink).catch(() => null) : null });
}
