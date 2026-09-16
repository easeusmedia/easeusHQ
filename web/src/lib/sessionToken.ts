import { createHmac, timingSafeEqual } from "crypto";

// Signed session cookie — just a userId + HMAC, no session table needed.
// SESSION_SECRET must be set in .env; falls back to a dev-only value so
// local setup doesn't hard-fail, but that fallback is not safe to deploy.
// Its own module (no database, no next/headers) so proxy.ts can check a
// cookie too.
const SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret-set-SESSION_SECRET";
export const COOKIE_NAME = "session";

export function sign(userId: string): string {
  const sig = createHmac("sha256", SECRET).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

export function unsign(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(userId).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}
