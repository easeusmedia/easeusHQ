import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";
import { onStaff } from "./users";
import { COOKIE_NAME, sign, unsign } from "./sessionToken";
import { isFounder, runsClients } from "./scope";

export { hashPassword, verifyPassword } from "./password";

// Who's signed in — and only while they're still on staff. Marking someone
// former ends their access at once, cookie or not: every page, action and
// route asks here, so their next click or live refresh lands on the login
// page. cache(): one lookup per request however many callers ask.
export const getRealUserId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const id = token ? unsign(token) : null;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { employment: true } });
  return user && onStaff(user) ? id : null;
});

// "View as": a Level 1 can look at the app as someone else sees it. The
// cookie only names who; it counts only while the real person signed in is
// Level 1, and only for looking: anything saved (a server action, which
// carries the next-action header) still runs as the real person.
export const VIEW_AS_COOKIE = "hq-view-as";
export const getSessionUserId = cache(async (): Promise<string | null> => {
  const id = await getRealUserId();
  if (!id) return null;
  const [store, head] = await Promise.all([cookies(), headers()]);
  const as = store.get(VIEW_AS_COOKIE)?.value;
  if (!as || as === id || head.get("next-action")) return id;
  const [me, them] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }),
    prisma.user.findUnique({ where: { id: as }, select: { employment: true } }),
  ]);
  return me && isFounder(me) && them && onStaff(them) ? as : id;
});

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

// The signed-in user if they may read client feedback (see runsClients),
// otherwise null.
export async function requireFeedbackViewer() {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId }, include: { departments: { select: { id: true, slug: true } } } }) : null;
  return user && runsClients(user) ? user : null;
}
