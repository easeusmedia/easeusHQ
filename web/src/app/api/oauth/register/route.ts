import { NextResponse } from "next/server";
import { redirectAllowed, seal } from "@/lib/mcp/oauth";

// A Claude registering itself (RFC 7591) before its first sign-in. Nothing
// is stored: its id is its name and addresses, sealed (lib/mcp/oauth).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { client_name?: unknown; redirect_uris?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed))
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "Easeus HQ only connects Claude (claude.ai, claude.com or Claude on this computer)." }, { status: 400 });
  const name = (typeof body?.client_name === "string" && body.client_name.trim().slice(0, 40)) || "Claude";
  return NextResponse.json(
    {
      client_id: seal("client", { n: name, r: uris }),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
