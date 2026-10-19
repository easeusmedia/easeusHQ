import { NextResponse } from "next/server";
import { handleRpc } from "./protocol";
import { INFO, salesTools } from "./tools";
import { touchKey, viewerForKey } from "./keys";
import { originOf } from "./oauth";
import { runAs } from "@/lib/viewer";

type KeyViewer = NonNullable<Awaited<ReturnType<typeof viewerForKey>>>;

// One MCP message (Streamable HTTP, stateless: one POST, one answer), run as
// the key's owner (runAs) through the same actions the app uses. Shared by
// /api/mcp (signed in through OAuth) and /api/mcp/<key> (a key in the address).
export async function answerMcp(request: Request, viewer: KeyViewer): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > 4_000_000) return NextResponse.json({ error: "That's too much at once. Send fewer leads a call." }, { status: 413 });
  const body = await request.json().catch(() => null);
  if (body == null) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });

  const { connectionId, lastUsedAt, ...acting } = viewer;
  const origin = originOf(request.headers);
  const info = { ...INFO, icons: [{ src: `${origin}/app-icon-512.png`, mimeType: "image/png", sizes: ["512x512"] }], websiteUrl: origin };
  const answer = await runAs(acting, () => handleRpc(body, salesTools(acting, origin), info));
  await touchKey(connectionId, lastUsedAt);

  if (answer === null) return new Response(null, { status: 202 });
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") || !accept.includes("text/event-stream")) return NextResponse.json(answer);
  // a client that only takes a stream gets the one answer as one event
  return new Response(`event: message\ndata: ${JSON.stringify(answer)}\n\n`, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

// no server-sent stream to open, no session to end
export const POST_ONLY = () => new Response("This connection takes POST only.", { status: 405, headers: { allow: "POST" } });
