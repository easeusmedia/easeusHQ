import { NextResponse } from "next/server";
import { getRealViewer } from "@/lib/auth";
import { connectsClaude } from "@/lib/scope";
import { checkAuthorize, clientTag, CODE_SECONDS, originOf, seal } from "@/lib/mcp/oauth";

// The Allow (or Cancel) on /oauth/authorize: back to Claude with a code, or
// with "access_denied". Only from that page (same origin), as the person
// really signed in, and checked again from scratch.
export async function POST(request: Request) {
  const origin = originOf(request.headers);
  if (request.headers.get("origin") !== origin) return new Response("Open this from Claude's Connect button.", { status: 403 });
  const form = await request.formData();
  const p = Object.fromEntries([...form].filter((e): e is [string, string] => typeof e[1] === "string"));
  const checked = checkAuthorize(p);
  if ("error" in checked) return new Response(checked.error, { status: 400 });

  const back = new URL(checked.redirect);
  if (p.state) back.searchParams.set("state", p.state);
  back.searchParams.set("iss", origin);
  const me = await getRealViewer();
  if (p.decision !== "allow" || !me || !connectsClaude(me)) back.searchParams.set("error", "access_denied");
  else back.searchParams.set("code", seal("code", { u: me.id, c: clientTag(p.client_id), r: checked.redirect, ch: p.code_challenge }, CODE_SECONDS));
  return NextResponse.redirect(back, 303);
}
