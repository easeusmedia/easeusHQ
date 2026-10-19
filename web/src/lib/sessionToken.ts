import { createHmac, timingSafeEqual } from "crypto";

// Signed session cookie — just a userId + HMAC, no session table needed.
// SESSION_SECRET must be set in .env; falls back to a dev-only value so
// local setup doesn't hard-fail, but that fallback is not safe to deploy.
// Its own module (no database, no next/headers) so proxy.ts can check a
// cookie too.
const SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-set-SESSION_SECRET";
export const COOKIE_NAME = "session";
// how it's set: on signing in, and again on each page opened (proxy.ts), so
// a sign-in lasts 30 days from the last visit, not the first
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
} as const;

// the app's signature on a value (the session here; lib/mcp/oauth's sealed
// values sign "<kind>.<value>", so neither passes for the other)
export const mac = (value: string) => createHmac("sha256", SECRET).update(value).digest("hex");

export function sign(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

export function unsign(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = mac(userId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}
