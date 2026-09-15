import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export { hashPassword, verifyPassword } from "./password";

// Signed session cookie — just a userId + HMAC, no session table needed.
// SESSION_SECRET must be set in .env; falls back to a dev-only value so
// local setup doesn't hard-fail, but that fallback is not safe to deploy.
const SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-set-SESSION_SECRET";
const COOKIE_NAME = "session";

function sign(userId: string): string {
  const sig = createHmac("sha256", SECRET).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

function unsign(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(userId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

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
