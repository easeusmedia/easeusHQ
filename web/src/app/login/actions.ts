"use server";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { onStaff } from "@/lib/users";
import { redirect } from "next/navigation";

// the email comes back with a refusal, so the form keeps it (a submitted
// form otherwise clears) and only the password is typed again
export type LoginState = { error?: string; email?: string };

function pageHere(next: string): string | null {
  try {
    const u = new URL(next, "http://here");
    return next && u.origin === "http://here" ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email }, omit: { passwordHash: false } });
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return { error: "That email and password don't match. Please try again.", email };
  }
  if (!onStaff(user)) return { error: "This account no longer has access. Please speak to your admin.", email };

  // a look picked on the sign-in page is theirs in the app too
  const theme = String(formData.get("theme") ?? "");
  if ((theme === "dark" || theme === "mist") && theme !== user.theme) await prisma.user.update({ where: { id: user.id }, data: { theme } });

  await createSession(user.id);
  // everyone starts on Home, unless sent here from a page of this app:
  // parsed as a browser would, so it's only ever a page here, never another site
  redirect(pageHere(String(formData.get("next") ?? "")) ?? "/home");
}
