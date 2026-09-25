import { prisma } from "./prisma";

// Reading finished work out of Frame.io.
//
// Only ever reads. Nothing here writes to Frame.io — the editors' review
// threads are theirs, and this app's whole interest is "what is the finished
// file, and where can I fetch it once".
//
// Authentication is Adobe's, not Frame.io's own: V4 accounts refuse legacy
// developer tokens outright ("This account does not allow legacy developer
// tokens"), and Server-to-Server needs an account administered through the
// Adobe Admin Console, which this one isn't. What's left is OAuth as a
// person — the same shape as the Google Drive connection next door: consent
// once, keep the refresh token, trade it for an access token as needed.

export const FRAMEIO_SETTINGS = {
  clientId: "frameio.clientId",
  clientSecret: "frameio.clientSecret",
  refreshToken: "frameio.refreshToken",
  account: "frameio.account", // who consented, for the Integrations page
  accountId: "frameio.accountId", // the Frame.io account the shares live in
} as const;

const IMS = "https://ims-na1.adobelogin.com/ims";
const API = "https://api.frame.io/v4";

// offline_access is what makes the connection outlast the hour — without it
// Adobe returns no refresh token and this would need a human every time
export const SCOPES = "openid email profile offline_access additional_info.roles";

export async function frameioSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: "frameio." } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveFrameioSettings(values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === null) await prisma.appSetting.deleteMany({ where: { key } });
    else await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

export async function frameioConnected(): Promise<boolean> {
  const s = await frameioSettings();
  return !!s[FRAMEIO_SETTINGS.refreshToken] && !!s[FRAMEIO_SETTINGS.accountId];
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const s = await frameioSettings();
  const [id, secret, refresh] = [
    s[FRAMEIO_SETTINGS.clientId],
    s[FRAMEIO_SETTINGS.clientSecret],
    s[FRAMEIO_SETTINGS.refreshToken],
  ];
  if (!id || !secret || !refresh) throw new Error("Frame.io isn't connected.");

  const res = await fetch(`${IMS}/token/v3`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: id, client_secret: secret, refresh_token: refresh }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Adobe wouldn't refresh the Frame.io connection.");
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

async function api(path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (body as { errors?: { detail?: string }[] })?.errors?.[0]?.detail ?? `Frame.io said ${res.status}.`
    );
  }
  return body;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; email: string }> {
  const s = await frameioSettings();
  const [id, secret] = [s[FRAMEIO_SETTINGS.clientId], s[FRAMEIO_SETTINGS.clientSecret]];
  if (!id || !secret) throw new Error("The Frame.io app details are missing.");

  const res = await fetch(`${IMS}/token/v3`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Adobe wouldn't complete the connection.");
  if (!body.refresh_token) throw new Error("Adobe didn't return a lasting connection — try again.");

  const me = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${body.access_token}` } })
    .then((r) => r.json())
    .catch(() => null);
  return { refreshToken: body.refresh_token, email: me?.data?.email ?? "" };
}

// Which Frame.io account to ask about a share. There's usually more than one
// on a login (this team has three), and a share only resolves against the
// account that owns it, so the right one is found once and remembered.
export async function accounts(): Promise<{ id: string; name: string }[]> {
  const body = await api("/accounts");
  return ((body?.data ?? []) as { id: string; display_name?: string; name?: string }[]).map((a) => ({
    id: a.id,
    name: a.display_name ?? a.name ?? a.id,
  }));
}

// An f.io short link is what editors paste; it redirects to the real share.
export async function shareIdFrom(link: string): Promise<string | null> {
  try {
    const direct = link.match(/\/share\/([0-9a-f-]{36})/i)?.[1];
    if (direct) return direct;
    const res = await fetch(link, { redirect: "manual" });
    return (res.headers.get("location") ?? "").match(/\/share\/([0-9a-f-]{36})/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

export type FrameioFile = {
  id: string;
  name: string;
  size: number | null;
  mediaType: string | null;
  // Frame.io only hands back a download address once it has finished
  // transcoding; anything else means "not yet"
  ready: boolean;
  createdAt: string | null;
  downloadUrl: string | null;
};

type RawFile = {
  id: string;
  name: string;
  type?: string;
  status?: string;
  file_size?: number;
  media_type?: string;
  created_at?: string;
  media_links?: { original?: { download_url?: string } };
};

type RawAsset = RawFile & { head_version?: RawFile };

// What's actually in a share, each with a download address for the original
// upload — the file as the editor exported it, not a proxy.
//
// Everything comes from this one listing because the per-file endpoint
// refuses these ids (a share's asset isn't reachable as a file in its own
// right). What a share holds is usually a *version stack* rather than a
// bare file — every cut of that video, newest first — so the one that
// matters is its head version.
//
// The addresses are short-lived signed URLs. They are fetched at the moment
// they're used and never stored, so a copy always re-lists the share.
export async function shareFiles(shareId: string): Promise<FrameioFile[]> {
  const s = await frameioSettings();
  const chosen = s[FRAMEIO_SETTINGS.accountId];
  if (!chosen) throw new Error("No Frame.io account has been chosen yet.");

  // The chosen account first, then any other this login can reach: the
  // team's shares are spread across two of them, and which one a given
  // review link belongs to isn't something anyone should have to know.
  const others = (await accounts().catch(() => [])).map((a) => a.id).filter((id) => id !== chosen);
  let lastError: unknown = null;
  let body: { data?: unknown } | null = null;
  for (const accountId of [chosen, ...others]) {
    try {
      body = await api(`/accounts/${accountId}/shares/${shareId}/assets?include=media_links.original`);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!body) throw lastError instanceof Error ? lastError : new Error("That share isn't in any Frame.io account we can see.");

  const assets = (body?.data ?? []) as RawAsset[];
  return assets
    .map((a) => (a.type === "version_stack" && a.head_version ? a.head_version : a))
    .filter((f) => (f.type ?? "file") === "file")
    .map((f) => ({
      id: f.id,
      name: f.name,
      size: f.file_size ?? null,
      mediaType: f.media_type ?? null,
      ready: (f.status ?? "") === "transcoded" && !!f.media_links?.original?.download_url,
      createdAt: f.created_at ?? null,
      downloadUrl: f.media_links?.original?.download_url ?? null,
    }));
}
