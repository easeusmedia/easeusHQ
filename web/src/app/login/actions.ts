"use server";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { onStaff } from "@/lib/users";
import { redirect } from "next/navigation";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return { error: "Wrong email or password." };
  }
  if (!onStaff(user)) return { error: "This account no longer has access." };

  await createSession(user.id);
  redirect("/board");
}
