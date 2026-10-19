import { NextResponse } from "next/server";
import { originOf } from "@/lib/mcp/oauth";

// Easeus HQ's sign-in for Claude (RFC 8414): register, sign in and allow,
// then trade the code for a key. PKCE only, no client secrets.
export function GET(request: Request) {
  const origin = originOf(request.headers);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
