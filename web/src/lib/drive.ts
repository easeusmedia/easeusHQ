import { createSign } from "crypto";

// Uploading to the company's Google Drive.
//
// Auth is a service account: a robot Google account that owns nothing and
// belongs to no one, whose key lives in the app's settings. The parent
// folder is shared with that account's email, and everything the app writes
// goes inside it — so uploads keep working regardless of who is signed in
// here, and nobody's personal Drive is involved.
//
// Two settings turn this on:
//   GOOGLE_SERVICE_ACCOUNT_JSON  the whole key file, as one line
//   DRIVE_PARENT_FOLDER_ID       the folder every client folder is made in
//
// Without them `driveConfigured()` is false and the onboarding form asks
// clients for a link instead of taking files — nothing breaks, the upload
// step is simply not offered yet.
//
// Deliberately no googleapis dependency: a signed JWT and three REST calls
// is the whole of what's needed, against a library that would add tens of
// megabytes to every deploy.

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

export function driveConfigured(): boolean {
  return !!credentials() && !!process.env.DRIVE_PARENT_FOLDER_ID;
}

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Google's service-account flow: sign a claim set with the key, trade it for
// an access token. Tokens last an hour; one upload run reuses the same one.
let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
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
  const parent = process.env.DRIVE_PARENT_FOLDER_ID;
  if (!parent) throw new Error("No Drive folder is set for new clients.");
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
