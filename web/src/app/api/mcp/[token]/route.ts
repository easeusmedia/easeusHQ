import { NextResponse } from "next/server";
import { handleRpc } from "@/lib/mcp/protocol";
import { INFO, salesTools } from "@/lib/mcp/tools";
import { touchKey, viewerForKey } from "@/lib/mcp/keys";
import { runAs } from "@/lib/viewer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Someone's Claude, connected to the Sales dashboard (MCP over Streamable
// HTTP, stateless: one POST, one answer). The key in the address says who
// they are (lib/mcp/keys); everything runs as them (runAs), through the
// same actions the app uses. Paste the address into claude.ai (Settings ›
// Connectors › Add custom connector), Claude desktop or Claude Code.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await viewerForKey(token);
  if (!viewer)
    return NextResponse.json(
      {
        error: "This connection key doesn't work any more. Ask for a new one.",
      },
      // 403, not 401: a 401 sends MCP clients looking for OAuth instead of showing this
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 4_000_000) return NextResponse.json({ error: "That's too much at once. Send fewer leads a call." }, { status: 413 });
  const body = await request.json().catch(() => null);
  if (body == null)
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { status: 400 },
    );

  const { connectionId, lastUsedAt, ...acting } = viewer;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "app.easeus.media";
  const origin = `${request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const answer = await runAs(acting, () => handleRpc(body, salesTools(acting, origin), INFO));
  await touchKey(connectionId, lastUsedAt);

  if (answer === null) return new Response(null, { status: 202 });
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") || !accept.includes("text/event-stream")) return NextResponse.json(answer);
  // a client that only takes a stream gets the one answer as one event
  return new Response(`event: message\ndata: ${JSON.stringify(answer)}\n\n`, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

// no server-sent stream to open, no session to end
export async function GET() {
  return new Response("This connection takes POST only.", {
    status: 405,
    headers: { allow: "POST" },
  });
}
export async function DELETE() {
  return new Response("Nothing to end: this connection keeps no session.", {
    status: 405,
    headers: { allow: "POST" },
  });
}
