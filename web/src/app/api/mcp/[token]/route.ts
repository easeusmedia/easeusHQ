import { NextResponse } from "next/server";
import { viewerForKey } from "@/lib/mcp/keys";
import { answerMcp, POST_ONLY } from "@/lib/mcp/serve";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Someone's Claude, with its key in the address (scripts/mcp-key.ts). The
// usual way in is /api/mcp, signed in through Claude (OAuth).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const viewer = await viewerForKey((await params).token);
  // 403, not 401: a 401 sends MCP clients looking for OAuth instead of showing this
  if (!viewer) return NextResponse.json({ error: "This connection key doesn't work any more. Ask for a new one." }, { status: 403 });
  return answerMcp(request, viewer);
}

export const GET = POST_ONLY;
export const DELETE = POST_ONLY;
