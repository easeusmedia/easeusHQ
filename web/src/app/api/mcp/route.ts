import { NextResponse } from "next/server";
import { viewerForKey } from "@/lib/mcp/keys";
import { MCP_PATH, originOf } from "@/lib/mcp/oauth";
import { answerMcp, POST_ONLY } from "@/lib/mcp/serve";
import { traced } from "@/lib/mcp/trail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Sales dashboard for anyone's Claude (MCP): the one address to paste
// into claude.ai (Settings › Connectors › Add custom connector) or Claude
// Code. Without a key it answers 401 and points at how to sign in
// (/.well-known/oauth-protected-resource), so Claude opens Easeus HQ's
// sign-in, the person allows it, and Claude gets a key of its own.
async function signedIn(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const viewer = key ? await viewerForKey(key) : null;
  if (viewer) return viewer;
  const origin = originOf(request.headers);
  return NextResponse.json(
    { error: key ? "invalid_token" : "unauthorized", error_description: "Sign in to Easeus HQ to connect." },
    {
      status: 401,
      headers: { "www-authenticate": `Bearer ${key ? 'error="invalid_token", ' : ""}resource_metadata="${origin}/.well-known/oauth-protected-resource${MCP_PATH}"` },
    },
  );
}

export const POST = traced(async (request: Request) => {
  const viewer = await signedIn(request);
  return viewer instanceof Response ? viewer : answerMcp(request, viewer);
});

export const GET = traced(async (request: Request) => {
  const viewer = await signedIn(request);
  return viewer instanceof Response ? viewer : POST_ONLY();
});

export const DELETE = POST_ONLY;
