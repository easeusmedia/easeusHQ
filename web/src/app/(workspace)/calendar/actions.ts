"use server";

import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { assigneeWhere } from "@/lib/scope";
import { indiaDay } from "@/lib/due";
import { PUBLIC_CLIENT_SELECT, PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { isDay } from "@/lib/dayActivity";
import { loadDay } from "./day";

// The Calendar is Founders' and Leads': every call checks again
async function manager() {
  const viewer = await getViewer();
  return viewer && viewer.role !== "employee" ? viewer : null;
}

// One day, read when it's opened (calendar/day.ts)
export async function openDay(day: string) {
  const viewer = await manager();
  if (!viewer || !isDay(day)) return null;
  return loadDay(viewer, day, indiaDay(new Date()));
}

// A client task picked in a day, for its own window: what the Board passes it
export async function taskForWindow(id: string) {
  const viewer = await manager();
  if (!viewer) return null;
  return prisma.task.findFirst({
    where: { AND: [{ id }, assigneeWhere(viewer)] },
    include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: { select: PUBLIC_CLIENT_SELECT } } } },
  });
}
