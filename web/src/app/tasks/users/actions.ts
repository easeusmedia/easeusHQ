"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// New action, so — unlike the older task actions — this checks the actual
// session instead of trusting a client-supplied role.
export async function updateUserRole(userId: string, role: string) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) throw new Error("Not signed in");
  const actor = await prisma.user.findUnique({ where: { id: sessionUserId } });
  if (actor?.role !== "admin") throw new Error("Only admin can change roles");
  if (!["admin", "core", "employee"].includes(role)) throw new Error("Invalid role");

  await prisma.user.update({ where: { id: userId }, data: { role: role as "admin" | "core" | "employee" } });
  revalidatePath("/tasks/users");
}
