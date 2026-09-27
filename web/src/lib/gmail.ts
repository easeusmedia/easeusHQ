import { prisma } from "./prisma";
import { DRIVE_SETTINGS } from "./drive";

// Reading easeus.media@gmail.com, read-only — for Adobe's emails about
// contracts out for signature. Connected under Integrations with the same
// Google app Drive uses, as its own connection.

export const GMAIL_SETTINGS = { refreshToken: "gmail.refreshToken", account: "gmail.account" } as const;

async function settings() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [GMAIL_SETTINGS.refreshToken, GMAIL_SETTINGS.account, DRIVE_SETTINGS.clientId, DRIVE_SETTINGS.clientSecret] } },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// the connected address, or null when there's no connection
export async function gmailAccount(): Promise<string | null> {
  const s = await settings();
  return s[GMAIL_SETTINGS.refreshToken] ? (s[GMAIL_SETTINGS.account] ?? "") : null;
}

let cached: { token: string; expires: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const s = await settings();
  const refresh = s[GMAIL_SETTINGS.refreshToken];
  if (!refresh) throw new Error("Gmail isn't connected.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s[DRIVE_SETTINGS.clientId] ?? "",
      client_secret: s[DRIVE_SETTINGS.clientSecret] ?? "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Google wouldn't refresh the Gmail connection.");
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

async function gmail<T>(path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${await token()}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Gmail answered ${res.status}.`);
  return body as T;
}

// ids of the messages a Gmail search finds, newest first
export async function searchMail(q: string, max = 100): Promise<string[]> {
  const body = await gmail<{ messages?: { id: string }[] }>(`messages?maxResults=${max}&q=${encodeURIComponent(q)}`);
  return (body.messages ?? []).map((m) => m.id);
}

type Part = { filename?: string; mimeType?: string; body?: { attachmentId?: string }; parts?: Part[] };

// A message's subject, when it arrived, and (with `full`) what's attached
export async function readMail(id: string, full = false) {
  const m = await gmail<{ id: string; internalDate: string; payload: Part & { headers?: { name: string; value: string }[] } }>(
    `messages/${id}?format=${full ? "full" : "metadata&metadataHeaders=Subject"}`
  );
  const files: { name: string; type: string; attachmentId: string }[] = [];
  const walk = (p: Part) => {
    if (p.filename && p.body?.attachmentId) files.push({ name: p.filename, type: p.mimeType ?? "", attachmentId: p.body.attachmentId });
    p.parts?.forEach(walk);
  };
  walk(m.payload);
  return {
    id: m.id,
    subject: m.payload.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? "",
    at: new Date(Number(m.internalDate)),
    files,
  };
}

export async function mailAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const { data } = await gmail<{ data: string }>(`messages/${messageId}/attachments/${attachmentId}`);
  return Buffer.from(data, "base64url");
}
