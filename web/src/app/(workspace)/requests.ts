"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRealViewer } from "@/lib/auth";

// A request goes to a role, not a person: a role that sits outside every
// department (Passwords, Data) is one that takes requests, and whoever holds
// it gets them. It lands in that person's My tasks as an ordinary task
// marked Request; the asker shares it, so they can follow it. Anyone may
// send one, whatever their level: this is the one way to hand a task up.
export async function sendRequest(roleId: string, text: string): Promise<{ error?: string }> {
  const me = await getRealViewer();
  if (!me) return { error: "Your session has ended. Please sign in again." };
  const what = text.trim();
  if (!what) return { error: "Say what you need." };
  if (what.length > 300) return { error: "Keep it under 300 characters." };

  const role = await prisma.jobTitle.findFirst({
    where: { id: roleId, teamId: null },
    select: { name: true, holders: { where: { employment: { not: "former" } }, select: { id: true, teamId: true }, orderBy: { name: "asc" } } },
  });
  if (!role?.holders.length) return { error: "Nobody handles that at the moment." };

  // the first holder owns it; anyone else with the role, and the asker,
  // share it
  const [owner, ...others] = role.holders;
  const follow = [
    ...others.map((p) => ({ userId: p.id, reason: `A request for ${role.name}.` })),
    ...(role.holders.some((p) => p.id === me.id) ? [] : [{ userId: me.id, reason: "You asked for this." }]),
  ];
  const task = await prisma.workTask.create({
    data: {
      title: `${role.name}: ${what}`,
      category: "Request",
      teamId: owner.teamId,
      createdById: me.id,
      assignedToId: owner.id,
      sortOrder: Date.now(),
      shares: { create: follow.map((f) => ({ ...f, byId: me.id })) },
    },
    select: { id: true },
  });
  await prisma.notice.createMany({
    data: role.holders.filter((p) => p.id !== me.id).map((p) => ({ workTaskId: task.id, forId: p.id, kind: "shared", by: me.name, body: `${me.name} asks ${role.name}: ${what}` })),
  });

  revalidatePath("/my-tasks");
  revalidatePath("/home");
  return {};
}
