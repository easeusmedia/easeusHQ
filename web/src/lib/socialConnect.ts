import { randomBytes } from "crypto";
import { cookies } from "next/headers";

// Connecting the team's own Google account for client analytics
// (Integrations): a one-time value the browser carries out to Google and
// back, so a connection can only be finished by the admin who
// started it here.

const COOKIE = "social_connect";

export async function startState(prefix: string): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return `${prefix}:${nonce}`;
}

export async function finishState(state: string | null, prefix: string): Promise<boolean> {
  const [p, nonce] = (state ?? "").split(":");
  const jar = await cookies();
  const expected = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  return p === prefix && !!nonce && nonce === expected;
}
