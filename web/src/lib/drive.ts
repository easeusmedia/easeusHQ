import { createSign } from "crypto";
import { prisma } from "./prisma";

// Uploading to the company's Google Drive.
//
// Two ways to authenticate, in this order:
//
//  1. The team's own Google account, connected once from Settings →
//     Integrations. Files are created by that account and live in its Drive
//     ("My Drive / Current Projects / Raw Files"), which is where the team
//     already keeps client work.
//
//  2. A service account key in the deploy settings
//     (GOOGLE_SERVICE_ACCOUNT_JSON + DRIVE_PARENT_FOLDER_ID). This only
//     works for a shared drive: a service account owns no storage of its
//     own, so Google refuses anything it would have to store in My Drive.
//
// With neither, `driveConfigured()` is false and the onboarding form asks
// clients for a link instead of taking files — nothing breaks, the upload
// step simply isn't offered yet.
//
// Deliberately no googleapis dependency: a signed JWT (or a refresh token)
// and three REST calls is the whole of what's needed, against a library that
// would add tens of megabytes to every deploy.

export const DRIVE_SETTINGS = {
  clientId: "google.clientId",
  clientSecret: "google.clientSecret",
  refreshToken: "google.refreshToken",
  account: "google.account",
  folderId: "google.folderId",
  folderName: "google.folderName",
} as const;

export async function driveSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: "google." } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function saveDriveSettings(values: Record<string, string | null>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === null) await prisma.appSetting.deleteMany({ where: { key } });
    else await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

type ServiceAccount = { client_email: string; private_key: string };

function credentials(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    // a key pasted through a shell or an .env file often arrives with its
    // newlines escaped
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}

// Connected one way or the other, and told where to put things.
export async function driveConfigured(): Promise<boolean> {
  const settings = await driveSettings();
  if (settings[DRIVE_SETTINGS.refreshToken] && settings[DRIVE_SETTINGS.folderId]) return true;
  return !!credentials() && !!process.env.DRIVE_PARENT_FOLDER_ID;
}

// Where client folders are created: whatever was picked when Drive was
// connected, else the folder named in the deploy settings.
export async function parentFolderId(): Promise<string> {
  const settings = await driveSettings();
  const id = settings[DRIVE_SETTINGS.folderId] ?? process.env.DRIVE_PARENT_FOLDER_ID;
  if (!id) throw new Error("No Drive folder is set for new clients.");
  return id;
}

// An access token for the team's own Google account, from the refresh token
// saved when they connected it. Refresh tokens don't expire in normal use,
// so this is the whole of the flow at upload time.
async function userToken(): Promise<string | null> {
  const settings = await driveSettings();
  const refresh = settings[DRIVE_SETTINGS.refreshToken];
  const id = settings[DRIVE_SETTINGS.clientId];
  const secret = settings[DRIVE_SETTINGS.clientSecret];
  if (!refresh || !id || !secret) return null;
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Google wouldn't refresh the connection.");
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Google's service-account flow: sign a claim set with the key, trade it for
// an access token. Tokens last an hour; one upload run reuses the same one.
let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  const asUser = await userToken();
  if (asUser) return asUser;
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const key = credentials();
  if (!key) throw new Error("Google Drive isn't connected.");

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Google wouldn't issue a token.");
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

async function driveFetch(path: string, init: RequestInit) {
  const res = await fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...init.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Drive said ${res.status}.`);
  return body;
}

// supportsAllDrives everywhere, so a shared (team) drive works the same as
// a folder in My Drive
const SHARED = "supportsAllDrives=true&includeItemsFromAllDrives=true";

// The folder of that name inside `parentId`, made if it isn't there yet.
export async function folder(name: string, parentId: string): Promise<{ id: string; url: string }> {
  const safe = name.replace(/['\\]/g, " ").trim();
  const query = `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await driveFetch(`drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&${SHARED}`, { method: "GET" });
  const existing = found.files?.[0]?.id as string | undefined;
  const id =
    existing ??
    ((
      await driveFetch(`drive/v3/files?fields=id&${SHARED}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: safe, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
      })
    ).id as string);
  return { id, url: `https://drive.google.com/drive/folders/${id}` };
}

// A client's own folder under the parent, with the subfolder the files go in
// ("Brand assets"). Made once and remembered on the client row.
export async function clientFolder(clientName: string, subfolder: string) {
  const parent = await parentFolderId();
  const client = await folder(clientName, parent);
  const target = await folder(subfolder, client.id);
  return { client, target };
}

export async function uploadFile(
  file: { name: string; type: string; bytes: Uint8Array },
  folderId: string
): Promise<{ id: string; url: string }> {
  // multipart: the metadata and the bytes in one request, which is all a
  // brand asset ever needs (Drive's resumable upload is for the gigabyte case)
  const boundary = `easeus-${Date.now()}`;
  const metadata = JSON.stringify({ name: file.name, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`),
    Buffer.from(file.bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const created = await driveFetch(`upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&${SHARED}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: body as unknown as BodyInit,
  });
  return { id: created.id, url: created.webViewLink ?? `https://drive.google.com/file/d/${created.id}/view` };
}

// What a folder is called — used to confirm a pasted link really opens.
export async function driveFileName(id: string): Promise<string> {
  const file = await driveFetch(`drive/v3/files/${id}?fields=name,mimeType&${SHARED}`, { method: "GET" });
  if (file.mimeType !== "application/vnd.google-apps.folder") throw new Error("That link isn't a folder.");
  return file.name as string;
}

export async function deleteFile(id: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${id}?${SHARED}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
}

// Finishes the connection: swaps the one-time code for the refresh token the
// uploads will use from then on.
export async function exchangeCode(code: string, origin: string): Promise<{ refreshToken: string; email: string }> {
  const settings = await driveSettings();
  const clientId = settings[DRIVE_SETTINGS.clientId];
  const clientSecret = settings[DRIVE_SETTINGS.clientSecret];
  if (!clientId || !clientSecret) throw new Error("The Google app details are missing.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description ?? "Google wouldn't complete the connection.");
  if (!body.refresh_token) throw new Error("Google didn't return a lasting connection — try again.");

  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${body.access_token}` },
  }).then((r) => r.json());
  return { refreshToken: body.refresh_token, email: who?.email ?? "" };
}

// Confirms the folder client folders are made in is reachable, and
// remembers what it's called. This is the team's own folder — their Raw
// Files — so a client's files end up at Raw Files / <Client> / Brand assets,
// with nothing of ours in between.
export async function ensureAppFolder(): Promise<{ id: string; name: string }> {
  const settings = await driveSettings();
  const id = settings[DRIVE_SETTINGS.folderId];
  if (!id) throw new Error("No Drive folder has been chosen yet.");
  const name = await driveFileName(id);
  await saveDriveSettings({ [DRIVE_SETTINGS.folderName]: name });
  return { id, name };
}
