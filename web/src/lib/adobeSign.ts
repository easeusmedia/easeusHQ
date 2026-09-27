import { prisma } from "./prisma.ts";

// Sending contracts out for e-signature through Adobe Acrobat Sign's REST
// API (v6). Connected once under Integrations with an integration key from
// the Acrobat Sign account that sends them (Account → Acrobat Sign API →
// API Information → Integration Key, with agreement_read, agreement_write
// and agreement_send). The signature and date fields aren't placed by hand:
// the PDF carries Acrobat Sign text tags where they go (lib/contractPdf.tsx),
// which Acrobat Sign turns into fields when the agreement is created.

export const ADOBE_SETTINGS = {
  key: "adobe.integrationKey",
  api: "adobe.apiAccessPoint", // the account's own data centre, found from the key
  account: "adobe.account", // the account's email, for Integrations to show
} as const;

const ROOT = "https://api.adobesign.com/api/rest/v6";

async function setting(key: string) {
  return (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null;
}
async function save(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

async function call(url: string, key: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${key}`, ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Adobe Acrobat Sign answered ${res.status}.`);
  }
  return res;
}

// Checks a key and finds its account's data centre and email — what saving
// it under Integrations keeps.
export async function connectAdobe(key: string): Promise<{ email: string }> {
  const { apiAccessPoint } = await (await call(`${ROOT}/baseUris`, key)).json();
  const api = `${String(apiAccessPoint).replace(/\/$/, "")}/api/rest/v6`;
  const me = await (await call(`${api}/users/me`, key)).json();
  await save(ADOBE_SETTINGS.key, key);
  await save(ADOBE_SETTINGS.api, api);
  await save(ADOBE_SETTINGS.account, me.email ?? "");
  return { email: me.email ?? "" };
}

async function connection() {
  const [key, api] = await Promise.all([setting(ADOBE_SETTINGS.key), setting(ADOBE_SETTINGS.api)]);
  if (!key || !api) throw new Error("Adobe Acrobat Sign isn't connected yet — add its integration key under Integrations.");
  return { key, api };
}

export const adobeAccount = () => setting(ADOBE_SETTINGS.account);

// Uploads the PDF and sends it: every signer gets Acrobat Sign's email, in
// the order given (signers sharing an order sign in parallel). The i-th
// signer here is `signer{i+1}` in the PDF's text tags.
export async function sendForSignature({
  pdf,
  fileName,
  name,
  message,
  signers,
}: {
  pdf: Uint8Array;
  fileName: string;
  name: string;
  message: string;
  signers: { email: string; order: number }[];
}): Promise<string> {
  const { key, api } = await connection();
  const form = new FormData();
  form.set("File-Name", fileName);
  form.set("Mime-Type", "application/pdf");
  form.set("File", new Blob([pdf as BlobPart], { type: "application/pdf" }), fileName);
  const { transientDocumentId } = await (await call(`${api}/transientDocuments`, key, { method: "POST", body: form })).json();
  const { id } = await (
    await call(`${api}/agreements`, key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileInfos: [{ transientDocumentId }],
        name,
        message,
        signatureType: "ESIGN",
        state: "IN_PROCESS",
        participantSetsInfo: signers.map((s) => ({ memberInfos: [{ email: s.email }], order: s.order, role: "SIGNER" })),
      }),
    })
  ).json();
  return id;
}

// Where it's got to: OUT_FOR_SIGNATURE, SIGNED, CANCELLED, EXPIRED, …
export async function agreementStatus(id: string): Promise<string> {
  const { key, api } = await connection();
  const { status } = await (await call(`${api}/agreements/${id}`, key)).json();
  return status;
}

// The signed PDF, every signature on it
export async function signedPdf(id: string): Promise<ArrayBuffer> {
  const { key, api } = await connection();
  return (await call(`${api}/agreements/${id}/combinedDocument`, key)).arrayBuffer();
}
