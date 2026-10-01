"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRealUserId } from "@/lib/auth";

export type Theme = "dark" | "mist";

// How the app looks to the person signed in (not whoever they're viewing as)
export async function setTheme(theme: Theme): Promise<{ error?: string }> {
  if (theme !== "dark" && theme !== "mist") return { error: "That isn't a theme." };
  const id = await getRealUserId();
  if (!id) return { error: "Your session has ended. Please sign in again." };
  await prisma.user.update({ where: { id }, data: { theme } });
  revalidatePath("/", "layout");
  return {};
}
