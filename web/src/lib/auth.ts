import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { COOKIE_NAME, sign, unsign } from "./sessionToken";

export { hashPassword, verifyPassword } from "./password";

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? unsign(token) : null;
}

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// The signed-in user if they're ops (admin/core), otherwise null — the same
// bar the Clients and Calendar pages use to redirect an employee away.
// Server actions call this to re-derive permission from the session rather
// than trusting a role posted in a form.
//
// Lives here rather than in one feature's actions file because both the
// client actions and the task actions gate on it.
export async function requireOps() {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  return user && user.role !== "employee" ? user : null;
}
