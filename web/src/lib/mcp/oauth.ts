import { createHash, timingSafeEqual } from "crypto";
import { mac } from "../sessionToken.ts";

// Signing in a Claude to the Sales dashboard (MCP) the way claude.ai and
// Claude Code expect: OAuth 2.1 with PKCE and dynamic client registration.
// Nothing is kept for it but the key handed out at the end (a Connection,
// lib/mcp/keys): a registered client and a code are sealed values, signed
// by the app, that come back to it.
// ponytail: a code isn't spent on use; PKCE ties it to the Claude that
// asked and it lasts 5 minutes. Keep codes in a table if that's ever not enough.

export const MCP_PATH = "/api/mcp";
export const CODE_SECONDS = 300;

const b64 = (s: string) => Buffer.from(s).toString("base64url");

// a value only this app could have made: "<data>.<signature>", for one kind
// of use, until an expiry (seconds) if given
export function seal(kind: string, data: object, seconds?: number): string {
  const body = b64(JSON.stringify(seconds ? { ...data, exp: Math.floor(Date.now() / 1000) + seconds } : data));
  return `${body}.${mac(`${kind}.${body}`)}`;
}

export function unseal<T>(kind: string, value: string): T | null {
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(`${kind}.${body}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    return data.exp && data.exp < Date.now() / 1000 ? null : data;
  } catch {
    return null;
  }
}

// PKCE (RFC 7636, S256)
export const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

// Where a sign-in may send its code: Claude's own pages, or a Claude on this
// computer (Claude Code listens on localhost). Anything else could take a
// code from someone who didn't mean to give it.
export function redirectAllowed(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.username || u.password || u.hash) return false;
    if (u.protocol === "https:") return u.hostname === "claude.ai" || u.hostname === "claude.com" || u.hostname.endsWith(".claude.ai") || u.hostname.endsWith(".claude.com");
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  } catch {
    return false;
  }
}

// a registered Claude: its name and where its codes go
export type Client = { n: string; r: string[] };
// a code: who allowed it, for which client and address, and the PKCE challenge
export type Code = { u: string; c: string; r: string; ch: string };

export const clientTag = (clientId: string) => createHash("sha256").update(clientId).digest("base64url").slice(0, 16);

// The address the app is reached at, as the request saw it
export function originOf(headers: Headers): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "app.easeus.media";
  const proto = headers.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

// What the sign-in page and its Allow button check alike: a client this app
// registered, an address it registered, and a PKCE challenge. The redirect
// may be left out when the client registered just one.
export function checkAuthorize(p: { response_type?: string; client_id?: string; redirect_uri?: string; code_challenge?: string; code_challenge_method?: string }): { error: string } | { client: Client; redirect: string } {
  const client = p.client_id ? unseal<Client>("client", p.client_id) : null;
  if (!client) return { error: "This Claude isn't registered with Easeus HQ. Remove the connector in Claude and add it again." };
  const redirect = p.redirect_uri ?? (client.r.length === 1 ? client.r[0] : "");
  if (!client.r.includes(redirect)) return { error: "This sign-in came from an address Easeus HQ doesn't know." };
  if (p.response_type !== "code" || !p.code_challenge || p.code_challenge_method !== "S256") return { error: "This sign-in request is missing what Easeus HQ needs. Try connecting again from Claude." };
  return { client, redirect };
}
