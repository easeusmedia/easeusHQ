"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRealUserId, VIEW_AS_COOKIE } from "@/lib/auth";

// Look at the app as someone else sees it (lib/auth getSessionUserId), or
// stop (null). Level 1 only, checked against the real person signed in.
export async function viewAs(userId: string | null): Promise<{ error?: string }> {
  const id = await getRealUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true } }) : null;
  if (!me || me.role !== "admin") return { error: "Only Level 1 can view as someone else." };
  const store = await cookies();
  if (!userId || userId === id) store.delete(VIEW_AS_COOKIE);
  else store.set(VIEW_AS_COOKIE, userId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
  revalidatePath("/", "layout");
  return {};
}
