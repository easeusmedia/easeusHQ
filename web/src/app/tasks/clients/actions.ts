"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { fetchClientRows, getTitleText, getSelectName } from "@/lib/notion";
import type { BillingCadence, InvoiceStatus } from "@prisma/client";

// The two On Hold clients ops is still actively tracking, chosen
// explicitly (everything else On Hold, and every Previous client, stays
// out of this system for now — see chat history). Add a name here to
// bring another paused client in on the next sync.
const TRACKED_ON_HOLD = ["The Broker Brunch", "HUMAIN"];

// admin/core only — same "ops" bar as the Clients page itself and the
// Calendar page (see calendar/page.tsx's own employee redirect)
async function requireOps() {
  const sessionUserId = await getSessionUserId();
  const user = sessionUserId ? await prisma.user.findUnique({ where: { id: sessionUserId } }) : null;
  return user && user.role !== "employee" ? user : null;
}

export type ClientSyncResult = { created: number; updated: number; error?: string };

// Pulls the Notion Clients Dashboard roster in — name and status only,
// that's all Notion actually has. Everything else about a client (billing,
// invoices, contact info) is untouched by this and lives here permanently.
export async function syncClientsFromNotion(): Promise<ClientSyncResult> {
  const user = await requireOps();
  if (!user) return { created: 0, updated: 0, error: "Only ops team members can sync clients." };

  try {
    const rows = await fetchClientRows();

    const existingClients = await prisma.client.findMany({ select: { id: true, notionPageId: true, name: true } });
    const existingByNotionId = new Map(
      existingClients.filter((c) => c.notionPageId).map((c) => [c.notionPageId as string, c.id])
    );
    // matched by name too, not just notionPageId — the 5 clients already
    // seeded in this app predate this sync and have no notionPageId yet;
    // without this fallback every one of them would get duplicated instead
    // of backfilled on the first run
    const existingByName = new Map(existingClients.map((c) => [c.name.toLowerCase(), c.id]));

    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const name = getTitleText(row.properties);
      if (!name) continue;

      const notionStatus = getSelectName(row.properties, "Status"); // Current | On Hold | Previous
      const tracked = notionStatus === "Current" || (notionStatus === "On Hold" && TRACKED_ON_HOLD.includes(name));
      if (!tracked) continue;

      const status = notionStatus === "Current" ? "current" : "on_hold";
      const existingId = existingByNotionId.get(row.id) ?? existingByName.get(name.toLowerCase());

      if (existingId) {
        await prisma.client.update({ where: { id: existingId }, data: { name, status, notionPageId: row.id } });
        updated++;
        continue;
      }

      const notionType = getSelectName(row.properties, "Type"); // Subscription | Project
      const client = await prisma.client.create({ data: { name, status, notionPageId: row.id } });
      // bootstrap one placeholder project so the client has somewhere for
      // tasks/invoices to attach right away — rename/add more later
      await prisma.project.create({
        data: { clientId: client.id, type: "General", engagement: notionType === "Project" ? "one_off" : "subscription" },
      });
      created++;
    }

    if (created > 0 || updated > 0) revalidatePath("/tasks/clients");
    return { created, updated };
  } catch (err) {
    return { created: 0, updated: 0, error: err instanceof Error ? err.message : "Client sync failed." };
  }
}

export async function setBillingRule(
  clientId: string,
  cadence: BillingCadence | null,
  dayOfMonth: number | null,
  milestoneCount: number | null
): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit billing rules." };

  await prisma.client.update({
    where: { id: clientId },
    data: {
      billingCadence: cadence,
      billingDayOfMonth: cadence === "monthly_date" ? dayOfMonth : null,
      billingMilestoneCount: cadence === "milestone" ? milestoneCount : null,
    },
  });
  revalidatePath(`/tasks/clients/${clientId}`);
  return {};
}

export async function createInvoice(
  clientId: string,
  amount: number,
  dueDate: string | null
): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can create invoices." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a valid amount." };

  await prisma.invoice.create({
    data: { clientId, amount, dueDate: dueDate ? new Date(dueDate) : null, status: "draft" },
  });
  // resets the "delivered since last invoice" counter for milestone clients
  await prisma.client.update({ where: { id: clientId }, data: { lastInvoicedAt: new Date() } });
  revalidatePath(`/tasks/clients/${clientId}`);
  return {};
}

export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can update invoices." };

  const invoice = await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  revalidatePath(`/tasks/clients/${invoice.clientId}`);
  return {};
}
