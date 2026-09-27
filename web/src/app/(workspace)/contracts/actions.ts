"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOps } from "@/lib/auth";
import { indiaDay } from "@/lib/due";
import { DEFAULT_CLAUSES, EMAIL, PROVIDER, compose, withDefaults, type Clause, type ContractDetails } from "@/lib/contract";
import { contractPdf } from "@/lib/contractPdf";
import { sendForSignature } from "@/lib/adobeSign";
import { TEMPLATE, masterClauses } from "./masterTemplate";

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
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can start a contract." };
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
  if (c.status === "sent" || c.status === "signed") return { error: "It's already gone out for signing — it can't change now." };
  return { status: c.status === "approved" ? "draft" : c.status };
}

export async function saveContractDetails(id: string, details: ContractDetails): Promise<{ error?: string; status?: string }> {
  if (!(await requireOps())) return { error: "Only ops team members can edit a contract." };
  const e = await editable(id);
  if (e.error) return e;
  const clean = withDefaults(details);
  if (JSON.stringify(clean).length > 50_000) return { error: "That's too much to keep." };
  await prisma.contract.update({ where: { id }, data: { details: clean, status: e.status } });
  done();
  return { status: e.status };
}

export async function saveContractClauses(id: string, clauses: Clause[]): Promise<{ error?: string; status?: string }> {
  if (!(await requireOps())) return { error: "Only ops team members can edit a contract." };
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
  if (!(await requireOps())) return { error: "Only ops team members can edit a contract." };
  const e = await editable(id);
  if (e.error) return e;
  const clauses = await masterClauses();
  await prisma.contract.update({ where: { id }, data: { clauses, status: e.status } });
  done();
  return { clauses };
}

export async function approveContract(id: string): Promise<{ error?: string }> {
  if (!(await requireOps())) return { error: "Only ops team members can approve a contract." };
  const c = await prisma.contract.findUnique({ where: { id } });
  if (!c) return { error: "That contract no longer exists." };
  if (c.status === "sent" || c.status === "signed") return { error: "It's already gone out." };
  const { missing } = compose(c.clauses as Clause[], withDefaults(c.details), indiaDay(new Date()));
  if (missing.length) return { error: `Still needed: ${missing.map((m) => m.label).join(", ")}.` };
  await prisma.contract.update({ where: { id }, data: { status: "approved", approvedAt: new Date() } });
  done();
  return {};
}

// The one step that reaches the client: the approved contract, as a PDF, to
// Adobe Acrobat Sign — the client signs first, then us.
export async function sendContract(id: string): Promise<{ error?: string }> {
  if (!(await requireOps())) return { error: "Only ops team members can send a contract." };
  const c = await prisma.contract.findUnique({ where: { id } });
  if (!c) return { error: "That contract no longer exists." };
  if (c.status !== "approved") return { error: "Approve it first — only an approved contract goes out." };

  // dated the day it goes out, unless a date was set on purpose
  const today = indiaDay(new Date());
  const details = withDefaults(c.details);
  if (!details.signingDate) details.signingDate = today;
  const { sections, values, missing } = compose(c.clauses as Clause[], details, today);
  if (missing.length) return { error: `Still needed: ${missing.map((m) => m.label).join(", ")}.` };
  const clients = details.signatories.filter((s) => s.name.trim());
  if (!clients.length || clients.some((s) => !EMAIL.test(s.email.trim()))) {
    return { error: "Every client signatory needs a valid email." };
  }

  try {
    const pdf = await contractPdf({ sections, values, details, tags: true });
    const agreementId = await sendForSignature({
      pdf,
      fileName: `Service Agreement - ${values.CLIENT_ENTITY}.pdf`.replace(/[\\/:*?"<>|]/g, ""),
      name: `Service Agreement · Easeus Media · ${values.CLIENT_ENTITY}`,
      message: `Hi ${clients.map((s) => s.name.trim().split(/\s+/)[0]).join(" & ")}, here's your service agreement with Easeus Media — please review and sign. Thank you!`,
      signers: [
        // the order here is the PDF's signer1, signer2, … (lib/contractPdf.tsx)
        ...clients.map((s) => ({ email: s.email.trim(), order: 1 })),
        { email: PROVIDER.email, order: 2 },
      ],
    });
    await prisma.contract.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), agreementId, details },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Adobe Acrobat Sign couldn't send it." };
  }
  done();
  return {};
}

export async function deleteContract(id: string): Promise<{ error?: string }> {
  if (!(await requireOps())) return { error: "Only ops team members can do that." };
  const c = await prisma.contract.findUnique({ where: { id }, select: { status: true } });
  if (c?.status === "sent" || c?.status === "signed") return { error: "A contract that's gone out stays on record." };
  await prisma.contract.deleteMany({ where: { id } });
  done();
  return {};
}

// ---- the master template ----

export async function saveTemplate(clauses: Clause[]): Promise<{ error?: string }> {
  if (!(await requireOps())) return { error: "Only ops team members can edit the template." };
  const clean = cleanClauses(clauses);
  if (!clean) return { error: "Those clauses couldn't be saved." };
  const value = JSON.stringify(clean);
  await prisma.appSetting.upsert({ where: { key: TEMPLATE }, create: { key: TEMPLATE, value }, update: { value } });
  done();
  return {};
}

export async function resetTemplate(): Promise<{ error?: string; clauses?: Clause[] }> {
  if (!(await requireOps())) return { error: "Only ops team members can edit the template." };
  await prisma.appSetting.deleteMany({ where: { key: TEMPLATE } });
  done();
  return { clauses: DEFAULT_CLAUSES };
}
