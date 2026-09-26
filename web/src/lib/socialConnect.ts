import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { clientHref } from "./slug";

// The small shared part of connecting a client's YouTube or Instagram: a
// one-time value the browser carries out to Google/Instagram and back, so a
// connection can only ever be finished by the person who started it here,
// and where to land afterwards.

const COOKIE = "social_connect";

export async function startState(platform: string, clientId: string): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return `${platform}:${clientId}:${nonce}`;
}

// the client the connection is for, if the state is the one handed out
export async function finishState(state: string | null, platform: string): Promise<string | null> {
  const [p, clientId, nonce] = (state ?? "").split(":");
  const jar = await cookies();
  const expected = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  return p === platform && clientId && nonce && nonce === expected ? clientId : null;
}

// back to the client's Analytics tab, with what happened
export async function backToClient(origin: string, clientId: string, platform: string, error?: string): Promise<URL> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true } });
  const url = new URL(client ? clientHref(client) : "/clients", origin);
  url.searchParams.set("tab", "analytics");
  url.searchParams.set("platform", platform);
  if (error) url.searchParams.set("analyticsError", error);
  return url;
}
