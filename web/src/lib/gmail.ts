import { prisma } from "./prisma";
import { DRIVE_SETTINGS } from "./drive";

// Reading Gmail, read-only, through the same Google app Drive uses, each
// inbox as its own connection under Integrations:
// - contracts: easeus.media@gmail.com, for Adobe's emails about contracts
//   out for signature
// - sales: sales.easeus.media@gmail.com, the inbox outreach goes from, for
//   replies, received emails and response times (lib/mailSync.ts)

export const GMAIL_SETTINGS = { refreshToken: "gmail.refreshToken", account: "gmail.account" } as const;
export const SALES_GMAIL_SETTINGS = { refreshToken: "salesGmail.refreshToken", account: "salesGmail.account" } as const;
export type Inbox = "contracts" | "sales";
const KEYS = { contracts: GMAIL_SETTINGS, sales: SALES_GMAIL_SETTINGS };

async function settings(inbox: Inbox) {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [KEYS[inbox].refreshToken, KEYS[inbox].account, DRIVE_SETTINGS.clientId, DRIVE_SETTINGS.clientSecret] } },
  });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { refresh: s[KEYS[inbox].refreshToken], account: s[KEYS[inbox].account], clientId: s[DRIVE_SETTINGS.clientId], clientSecret: s[DRIVE_SETTINGS.clientSecret] };
}

// the connected address, or null when there's no connection
export async function gmailAccount(inbox: Inbox = "contracts"): Promise<string | null> {
  const s = await settings(inbox);
  return s.refresh ? (s.account ?? "") : null;
}

const cached = new Map<Inbox, { token: string; expires: number }>();
async function token(inbox: Inbox): Promise<string> {
  const hit = cached.get(inbox);
  if (hit && hit.expires > Date.now() + 60_000) return hit.token;
  const s = await settings(inbox);
  const refresh = s.refresh;
  if (!refresh) throw new Error("Gmail isn't connected.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.clientId ?? "",
      client_secret: s.clientSecret ?? "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Google wouldn't refresh the Gmail connection.");
  cached.set(inbox, { token: body.access_token, expires: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

export async function gmail<T>(path: string, inbox: Inbox = "contracts"): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${await token(inbox)}` } });
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
  const m = await gmail<{ id: string; internalDate: string; snippet?: string; payload: Part & { headers?: { name: string; value: string }[] } }>(
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
    // the start of its text, as Gmail previews it
    snippet: m.snippet ?? "",
    files,
  };
}

export async function mailAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const { data } = await gmail<{ data: string }>(`messages/${messageId}/attachments/${attachmentId}`);
  return Buffer.from(data, "base64url");
}
