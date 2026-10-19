import { NextResponse } from "next/server";
import { traced } from "@/lib/mcp/trail";
import { prisma } from "@/lib/prisma";
import { onStaff } from "@/lib/users";
import { connectsClaude } from "@/lib/scope";
import { hashKey, makeKey } from "@/lib/mcp/keys";
import { challengeOf, clientTag, unseal, type Client, type Code } from "@/lib/mcp/oauth";

const fail = (error: string, error_description: string, status = 400) => NextResponse.json({ error, error_description }, { status, headers: { "cache-control": "no-store" } });

// A Claude trading the code from someone's Allow for its own key: a
// Connection like any other (lib/mcp/keys), turned off from Account.
// No expiry and no refresh: a key lasts until it's turned off.
export const POST = traced(async (request: Request) => {
  const type = request.headers.get("content-type") ?? "";
  const form = type.includes("application/json")
    ? new Map(Object.entries((await request.json().catch(() => ({}))) as Record<string, string>))
    : new Map([...new URLSearchParams(await request.text())]);
  const get = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");

  if (get("grant_type") !== "authorization_code") return fail("unsupported_grant_type", "Only authorization_code.");
  const code = unseal<Code>("code", get("code"));
  const client = unseal<Client>("client", get("client_id"));
  if (!code || !client || code.c !== clientTag(get("client_id"))) return fail("invalid_grant", "That sign-in has expired. Connect again from Claude.");
  if (get("redirect_uri") && get("redirect_uri") !== code.r) return fail("invalid_grant", "The address doesn't match the sign-in.");
  if (challengeOf(get("code_verifier")) !== code.ch) return fail("invalid_grant", "The sign-in doesn't match this Claude.");

  const user = await prisma.user.findUnique({ where: { id: code.u }, select: { id: true, role: true, email: true, employment: true, departments: { select: { id: true, slug: true } } } });
  if (!user || !onStaff(user) || !connectsClaude(user)) return fail("access_denied", "This account can't connect Claude.", 403);

  const key = makeKey();
  await prisma.connection.create({ data: { userId: user.id, name: client.n, keyHash: hashKey(key) }, select: { id: true } });
  return NextResponse.json({ access_token: key, token_type: "Bearer" }, { headers: { "cache-control": "no-store" } });
});
