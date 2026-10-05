"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFounder } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { DEFAULT_CLAUSES, compose, withDefaults, type Clause, type ContractDetails } from "@/lib/contract";
import { TEMPLATE, masterClauses } from "./masterTemplate";
import { trackContracts } from "./tracking";
import { askAboutContract, type Attachment, type ChatMessage } from "./assistant";

// Every step of a contract after the client's form: ops fills in the terms,
// edits the clauses, approves, sends. Ops only. See lib/contract.ts.


// What a clause list has to look like before it's kept — it arrives from the
// browser, so nothing about its shape is taken on trust
function cleanClauses(clauses: Clause[]): Clause[] | null {
  if (!Array.isArray(clauses) || clauses.length > 60) return null;
  const out = clauses.map((c) => ({
    id: String(c?.id ?? "").slice(0, 64) || randomBytes(6).toString("hex"),
    title: String(c?.title ?? "").slice(0, 200),
    body: String(c?.body ?? "").slice(0, 20_000),
    ...(c?.when ? { when: String(c.when).slice(0, 100) } : {}),
  }));
  return out;
}

const done = () => revalidatePath("/contracts", "layout");

// A new contract and the link its client fills in
export async function createContract(name: string): Promise<{ id?: string; token?: string; error?: string }> {
  const user = await requireFounder();
  if (!user) return { error: "Only Level 1 can start a contract." };
  const contract = await prisma.contract.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      name: name.trim().slice(0, 120) || null,
      details: withDefaults({}),
      clauses: await masterClauses(),
      createdById: user.id,
    },
  });
  done();
  return { id: contract.id, token: contract.token };
}

// Changes to what's been approved put it back to draft: what goes out is
// always exactly what was approved.
async function editable(id: string) {
  const c = await prisma.contract.findUnique({ where: { id }, select: { status: true } });
  if (!c) return { error: "That contract no longer exists." };
  if (c.status === "sent" || c.status === "signed") return { error: "This contract is already out for signature and can no longer be changed." };
  return { status: c.status === "approved" ? "draft" : c.status };
}

// A change from the form — only the fields it touches, merged into what's
// saved, so it never undoes an edit Claude made a moment before
export async function saveContractDetails(id: string, patch: Partial<ContractDetails>): Promise<{ error?: string; status?: string; details?: ContractDetails }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can edit a contract." };
  const e = await editable(id);
  if (e.error) return e;
  const c = await prisma.contract.findUnique({ where: { id }, select: { details: true } });
  const details = withDefaults({ ...withDefaults(c?.details), ...patch });
  if (JSON.stringify(details).length > 50_000) return { error: "That's too long to save." };
  await prisma.contract.update({ where: { id }, data: { details, status: e.status } });
  done();
  return { status: e.status, details };
}

export async function saveContractClauses(id: string, clauses: Clause[]): Promise<{ error?: string; status?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can edit a contract." };
  const e = await editable(id);
  if (e.error) return e;
  const clean = cleanClauses(clauses);
  if (!clean) return { error: "Those clauses couldn't be saved." };
  await prisma.contract.update({ where: { id }, data: { clauses: clean, status: e.status } });
  done();
  return { status: e.status };
}

// Back to the master template's current clauses
export async function resetContractClauses(id: string): Promise<{ error?: string; clauses?: Clause[] }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can edit a contract." };
  const e = await editable(id);
  if (e.error) return e;
  const clauses = await masterClauses();
  await prisma.contract.update({ where: { id }, data: { clauses, status: e.status } });
  done();
  return { clauses };
}

export async function approveContract(id: string): Promise<{ error?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can approve a contract." };
  const c = await prisma.contract.findUnique({ where: { id }, omit: { signedPdf: true } });
  if (!c) return { error: "That contract no longer exists." };
  if (c.status === "sent" || c.status === "signed") return { error: "This contract has already been sent." };
  const { missing } = compose(c.clauses as Clause[], withDefaults(c.details), indiaDay(new Date()));
  if (missing.length) return { error: `Still needed: ${missing.map((m) => m.label).join(", ")}.` };
  await prisma.contract.update({ where: { id }, data: { status: "approved", approvedAt: new Date() } });
  done();
  return {};
}

// Sent by hand through Acrobat's own Request e-signatures (no Adobe API on
// the plan): the contract is dated today if it had no set date, and locked.
export async function markContractSent(id: string): Promise<{ error?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can do that." };
  const c = await prisma.contract.findUnique({ where: { id }, omit: { signedPdf: true } });
  if (!c) return { error: "That contract no longer exists." };
  if (c.status !== "approved") return { error: "Please approve the contract first. Only approved contracts can be sent." };
  const details = withDefaults(c.details);
  if (!details.signingDate) details.signingDate = indiaDay(new Date());
  await prisma.contract.update({ where: { id }, data: { status: "sent", sentAt: new Date(), details } });
  done();
  return {};
}

export async function markContractSigned(id: string): Promise<{ error?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can do that." };
  const c = await prisma.contract.findUnique({ where: { id }, select: { status: true } });
  if (c?.status !== "sent") return { error: "This contract hasn't been sent for signature yet." };
  await prisma.contract.update({ where: { id }, data: { status: "signed", signedAt: new Date() } });
  done();
  return {};
}

// "Check now": read Adobe's latest emails about it straight away
export async function checkContractMail(id: string): Promise<{ error?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can do that." };
  try {
    await trackContracts(id, true);
  } catch (err) {
    return { error: err instanceof Error ? `Couldn't read Gmail: ${err.message}` : "Couldn't read Gmail." };
  }
  done();
  return {};
}

export async function deleteContract(id: string): Promise<{ error?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can do that." };
  const c = await prisma.contract.findUnique({ where: { id }, select: { status: true } });
  if (c?.status === "sent" || c?.status === "signed") return { error: "Contracts that have been sent stay on record." };
  await prisma.contract.deleteMany({ where: { id } });
  done();
  return {};
}

// ---- the master template ----

export async function saveTemplate(clauses: Clause[]): Promise<{ error?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can edit the template." };
  const clean = cleanClauses(clauses);
  if (!clean) return { error: "Those clauses couldn't be saved." };
  const value = JSON.stringify(clean);
  await prisma.appSetting.upsert({ where: { key: TEMPLATE }, create: { key: TEMPLATE, value }, update: { value } });
  done();
  return {};
}

export async function resetTemplate(): Promise<{ error?: string; clauses?: Clause[] }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can edit the template." };
  await prisma.appSetting.deleteMany({ where: { key: TEMPLATE } });
  done();
  return { clauses: DEFAULT_CLAUSES };
}

// ---- the assistant ----

// One message to Claude about this contract; it may change the contract,
// and what it now is comes back with its reply.
export async function chatContract(
  id: string,
  text: string,
  // files attached to the message, as "files"
  form: FormData | null = null
): Promise<{ error?: string; chat?: ChatMessage[]; details?: ContractDetails; changes?: Partial<ContractDetails>; clauses?: Clause[]; status?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can edit a contract." };
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (!text.trim() && !files.length) return {};
  if (files.length > 5) return { error: "Attach up to five files at a time." };
  if (files.reduce((n, f) => n + f.size, 0) > 4 * 1024 * 1024) return { error: "Those files total more than 4 MB. Please attach fewer or smaller files." };
  const attached: Attachment[] = [];
  for (const f of files) {
    const bytes = Buffer.from(await f.arrayBuffer());
    if (/^image\/(jpeg|png|gif|webp)$/.test(f.type)) attached.push({ name: f.name, kind: "image", mediaType: f.type, data: bytes.toString("base64") });
    else if (f.type === "application/pdf") attached.push({ name: f.name, kind: "pdf", data: bytes.toString("base64") });
    else if (f.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(f.name)) attached.push({ name: f.name, kind: "text", data: bytes.toString("utf8").slice(0, 100_000) });
    else return { error: `${f.name} can't be read. Please attach a PDF, image or text file.` };
  }
  try {
    const res = await askAboutContract(id, (text.trim() || "(see attached)").slice(0, 8000), attached);
    done();
    return res;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Nyra couldn't answer just now." };
  }
}

export async function clearContractChat(id: string): Promise<{ error?: string }> {
  if (!(await requireFounder())) return { error: "Only Level 1 can do that." };
  await prisma.contract.update({ where: { id }, data: { chat: [] } });
  return {};
}
