import { prisma } from "@/lib/prisma";

// TEMPORARY (19 Oct 2026): what Claude's Connect asks of Easeus HQ, step by
// step, to see where it stops (Vercel's logs aren't reachable from here).
// The last 100 lines in AppSetting "mcp-trail"; never a code, key or client
// id, only which fields came and what went back. Remove once Claude connects.
const KEY = "mcp-trail";

export async function trail(line: string) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
    const value = [...(row?.value.split("\n") ?? []), `${new Date().toISOString().slice(11, 19)} ${line}`].slice(-100).join("\n");
    await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  } catch {}
}

const SHOW = new Set(["redirect_uris", "redirect_uri", "grant_type", "grant_types", "token_endpoint_auth_method", "response_type", "response_types", "code_challenge_method", "scope", "resource", "client_name", "method"]);
function fields(text: string): string {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = Object.fromEntries(new URLSearchParams(text));
  }
  if (!data || typeof data !== "object") return "";
  return Object.entries(data)
    .map(([k, v]) => (SHOW.has(k) ? `${k}=${JSON.stringify(v)}` : k))
    .join(" ");
}

// a route handler, with its request and answer written to the trail
export function traced<A extends unknown[]>(handler: (request: Request, ...rest: A) => Promise<Response> | Response) {
  return async (request: Request, ...rest: A) => {
    const copy = request.clone();
    const res = await handler(request, ...rest);
    const url = new URL(request.url);
    const sent = request.method === "POST" ? fields(await copy.text().catch(() => "")) : [...url.searchParams].map(([k, v]) => (SHOW.has(k) ? `${k}=${v}` : k)).join(" ");
    const back = res.status >= 300 && res.status < 400 ? (() => { const l = new URL(res.headers.get("location") ?? "/", url); return `-> ${l.origin}${l.pathname} ${[...l.searchParams.keys()].join(",")}`; })() : res.status >= 400 ? (await res.clone().text().catch(() => "")).slice(0, 160) : "";
    await trail(`${request.method} ${url.pathname} ${res.status} auth=${request.headers.has("authorization")} ua=${(request.headers.get("user-agent") ?? "").slice(0, 30)} | ${sent} | ${back}`);
    return res;
  };
}
