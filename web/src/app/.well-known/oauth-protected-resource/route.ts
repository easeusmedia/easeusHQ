import { NextResponse } from "next/server";
import { traced } from "@/lib/mcp/trail";
import { MCP_PATH, originOf } from "@/lib/mcp/oauth";

// How to sign in to the Sales dashboard's MCP (RFC 9728): Easeus HQ signs
// people in itself. Also answered at …/oauth-protected-resource/api/mcp.
export const GET = traced((request: Request) => {
  const origin = originOf(request.headers);
  return NextResponse.json(
    { resource: `${origin}${MCP_PATH}`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Easeus HQ" },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
});
