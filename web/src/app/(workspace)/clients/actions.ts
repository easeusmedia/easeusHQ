"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId, requireFeedbackViewer, requireOps } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { firstFree, slugify } from "@/lib/slug";
import { isStorablePicture } from "@/lib/photos";
import { normalizeUrl } from "@/lib/links";
import { fetchClientRows, getTitleText, getSelectName } from "@/lib/notion";
import { TAG_PALETTE } from "./tagPalette";
import { DEFAULT_DELIVERABLES, DEFAULT_DOCS, DEFAULT_ONBOARDING, DEFAULT_TAGS, type TemplateItem, type TemplateStep } from "./templateDefaults";
import { importClientFromNotion } from "@/lib/notionClientImport";
import type { BillingCadence, InvoiceStatus } from "@prisma/client";

// The two On Hold clients ops is still actively tracking, chosen
// explicitly (everything else On Hold, and every Previous client, stays
// out of this system for now — see chat history). Add a name here to
// bring another paused client in on the next sync.
const TRACKED_ON_HOLD = ["The Broker Brunch", "HUMAIN"];

// Same gate every other link field in the app goes through (see
// tasks/actions.ts): an http(s) URL or nothing, never a bare
// "javascript:"/"data:" string that becomes a live href for whoever
// clicks it next.
function requireLinkOrNull(value: string, label: string): string | null {
  if (!value.trim()) return null;
  const normalized = normalizeUrl(value);
  if (!normalized) throw new Error(`${label} doesn't look like a valid link.`);
  return normalized;
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
    // fetched once, then applied to every client this run touches, so a
    // client imported from Notion ends up with the same checklist,
    // deliverables and documents as one created here by hand
    const template = await loadClientTemplate();
    const touched: string[] = [];

    for (const row of rows) {
      const name = getTitleText(row.properties);
      if (!name) continue;

      const notionStatus = getSelectName(row.properties, "Status"); // Current | On Hold | Previous
      const tracked = notionStatus === "Current" || (notionStatus === "On Hold" && TRACKED_ON_HOLD.includes(name));
      if (!tracked) continue;

      const status = notionStatus === "Current" ? "current" : "on_hold";
      const existingId = existingByNotionId.get(row.id) ?? existingByName.get(name.toLowerCase());

      if (existingId) {
        await prisma.client.update({
          where: { id: existingId },
          data: { name, slug: await slugFor(name, existingId), status, notionPageId: row.id },
        });
        touched.push(existingId);
        updated++;
        continue;
      }

      const notionType = getSelectName(row.properties, "Type"); // Subscription | Project
      const client = await prisma.client.create({ data: { name, slug: await slugFor(name), status, notionPageId: row.id } });
      // bootstrap one placeholder project so the client has somewhere for
      // tasks/invoices to attach right away — rename/add more later
      await prisma.project.create({
        data: {
          clientId: client.id,
          name: "General",
          type: "General",
          engagement: notionType === "Project" ? "one_off" : "subscription",
        },
      });
      touched.push(client.id);
      created++;
    }

    // sequential on purpose — this is a handful of clients on a button
    // press, and it shares the one pooled connection with everything else
    for (const clientId of touched) await applyTemplateTo(clientId, template);

    if (created > 0 || updated > 0) revalidatePath("/clients");
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
  revalidatePath("/clients/[slug]", "page");
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
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can update invoices." };

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status } });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

// "current" | "on_hold" | "previous" — the same three Notion uses. Changing
// it here doesn't touch Notion; it's a local override for a client that's
// already been synced in (e.g. pausing one, or marking one wrapped up
// without waiting for someone to update the Notion dashboard first).
export async function updateClientStatus(clientId: string, status: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can change client status." };

  await prisma.client.update({ where: { id: clientId }, data: { status } });
  revalidatePath("/clients");
  revalidatePath("/clients/[slug]", "page");
  return {};
}

// The client's own page at their address, for anyone not signed in (see
// proxy.ts). Ops only; off by default.
export async function setClientSharing(clientId: string, enabled: boolean): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can share a client's page." };
  await prisma.client.update({ where: { id: clientId }, data: { shareEnabled: enabled } });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function markClientFeedbackRead(clientId: string): Promise<{ error?: string }> {
  if (!(await requireFeedbackViewer())) return { error: "Only Operations and the admin can do that." };
  await prisma.clientFeedback.updateMany({ where: { clientId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

// Messages nobody has read yet, across every client — for the bottom-right
// notice (FeedbackWatcher). Empty for anyone who doesn't see feedback.
export async function unreadClientFeedback() {
  if (!(await requireFeedbackViewer())) return [];
  const rows = await prisma.clientFeedback.findMany({
    where: { readAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, name: true, message: true, client: { select: { name: true, slug: true } } },
  });
  return rows.map((r) => ({ id: r.id, from: r.name, message: r.message.slice(0, 140), client: r.client.name, slug: r.client.slug }));
}

// Dragging a client into place on the dashboard. One shared order for the
// whole team — it's the agency's queue, not a personal view.
export async function reorderClient(clientId: string, sortOrder: number): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can rearrange clients." };
  if (!Number.isFinite(sortOrder)) return { error: "That position isn't valid." };

  await prisma.client.update({ where: { id: clientId }, data: { sortOrder } });
  revalidatePath("/clients");
  return {};
}

// The address for a client called `name` — its own current one if the name
// hasn't changed, otherwise the first free one.
async function slugFor(name: string, exceptId?: string): Promise<string> {
  const base = slugify(name);
  const clash = await prisma.client.findMany({
    where: { slug: { startsWith: base }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { slug: true },
  });
  return firstFree(base, new Set(clash.map((c) => c.slug)));
}

export type ClientInfoInput = {
  name: string;
  niche: string;
  contact: string;
  email: string;
  whatsapp: string;
  address: string;
  notes: string;
};

// One template, one editor — every client gets exactly these fields,
// regardless of how much (or how little) structure their actual Notion
// page ever had. Brand guidelines / SOP / Resources live on their own
// dedicated pages now (see updateClientDoc) — they're full documents, not
// a one-line field that belongs in this form.
export async function updateClientInfo(clientId: string, input: ClientInfoInput): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit client info." };
  if (input.name.trim() === "") return { error: "Name can't be empty." };

  const empty = (s: string) => s.trim() === "";
  await prisma.client.update({
    where: { id: clientId },
    data: {
      name: input.name.trim(),
      // the address follows the name
      slug: await slugFor(input.name.trim(), clientId),
      niche: empty(input.niche) ? null : input.niche.trim(),
      contact: empty(input.contact) ? null : input.contact.trim(),
      email: empty(input.email) ? null : input.email.trim(),
      whatsapp: empty(input.whatsapp) ? null : input.whatsapp.trim(),
      address: empty(input.address) ? null : input.address.trim(),
      notes: empty(input.notes) ? null : input.notes.trim(),
    },
  });
  revalidatePath("/clients");
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export type ClientDocType = "brandGuidelines" | "sop" | "qualityChecklist" | "meetingNotes" | "resources";
const DOC_LABEL: Record<ClientDocType, string> = {
  brandGuidelines: "Client information",
  sop: "Editing SOP",
  qualityChecklist: "Quality checklist",
  meetingNotes: "Meeting notes",
  resources: "Resources",
};

// The client's real documents, native to this app, not links out to Notion.
// Notion is only the source for as long as the team is transitioning off it
// — scripts/sync-client-notion.ts is what seeds these from there.
export async function updateClientDoc(clientId: string, doc: ClientDocType, content: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: `Only ops team members can edit ${DOC_LABEL[doc]}.` };

  await prisma.client.update({ where: { id: clientId }, data: { [doc]: content.trim() || null } });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

// A small, fixed-size image stored directly as a data: URI — see the
// schema comment on Client.avatarUrl for why there's no object storage
// here yet. `dataUrl: null` clears it back to the colored-initial avatar.
// Documents beyond the five every client starts with — a channel strategy,
// a tone-of-voice note, a brief for one series. Same markdown, same place on
// the page; these just aren't fixed by the template.
export async function addClientDocument(clientId: string, title: string): Promise<{ id?: string; error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can add a document." };
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the document a name." };
  const last = await prisma.clientDocument.findFirst({ where: { clientId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const doc = await prisma.clientDocument.create({
    data: { clientId, title: trimmed, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  revalidatePath("/clients/[slug]", "page");
  return { id: doc.id };
}

export async function updateClientDocument(id: string, input: { title?: string; content?: string }): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit a document." };
  if (input.title !== undefined && !input.title.trim()) return { error: "A document needs a name." };
  await prisma.clientDocument.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content.trim() || null } : {}),
    },
  });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function deleteClientDocument(id: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can delete a document." };
  await prisma.clientDocument.delete({ where: { id } });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function updateClientAvatar(clientId: string, dataUrl: string | null): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can change a client's photo." };
  // a small image only — anything else means the in-browser resize didn't
  // run (or was bypassed), and it's served back from our own site
  if (dataUrl !== null && !isStorablePicture(dataUrl)) return { error: "That picture couldn't be used — try a JPEG or PNG." };

  await prisma.client.update({ where: { id: clientId }, data: { avatarUrl: dataUrl } });
  revalidatePath("/clients");
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function listTags() {
  if (!(await getSessionUserId())) return [];
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

export async function createTag(name: string, color: string): Promise<{ error?: string; id?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can create tags." };
  if (name.trim() === "") return { error: "Name the tag first." };
  if (!TAG_PALETTE.includes(color)) return { error: "Pick a color from the palette." };

  try {
    const tag = await prisma.tag.create({ data: { name: name.trim(), color } });
    revalidatePath("/clients");
    return { id: tag.id };
  } catch {
    return { error: "A tag with that name already exists." };
  }
}

export async function setClientTags(clientId: string, tagIds: string[]): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit tags." };

  await prisma.client.update({ where: { id: clientId }, data: { tags: { set: tagIds.map((id) => ({ id })) } } });
  revalidatePath("/clients");
  revalidatePath("/clients/[slug]", "page");
  return {};
}

// Hard delete — everything under this client (projects, tasks, invoices,
// deliverables) cascades away with it via onDelete: Cascade at the DB
// level... actually Prisma's default is Restrict, so do it explicitly in
// the right order instead of relying on that.
// What a client leaves behind, and how much of it goes. Everything that
// points at them has to go first, in one transaction — a half-deleted client
// (projects gone, client still there) is worse than either outcome.
export async function clientFootprint(clientId: string) {
  const [projects, tasks, documents, invoices, deliverables, feedback] = await Promise.all([
    prisma.project.count({ where: { clientId } }),
    prisma.task.count({ where: { project: { clientId } } }),
    prisma.clientDocument.count({ where: { clientId } }),
    prisma.invoice.count({ where: { clientId } }),
    prisma.deliverable.count({ where: { clientId } }),
    prisma.clientFeedback.count({ where: { clientId } }),
  ]);
  return { projects, tasks, documents, invoices, deliverables, feedback };
}

export async function deleteClient(clientId: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can delete a client." };

  const projectIds = (await prisma.project.findMany({ where: { clientId }, select: { id: true } })).map((p) => p.id);
  const taskIds = (await prisma.task.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } })).map((t) => t.id);

  await prisma.$transaction([
    // a task's own trail first — nothing else can reference it afterwards
    prisma.feedback.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.activityLog.deleteMany({ where: { entity: "Task", entityId: { in: taskIds } } }),
    prisma.task.deleteMany({ where: { projectId: { in: projectIds } } }),
    // the team's own work only loses the link to this client's projects
    prisma.workTask.updateMany({ where: { projectId: { in: projectIds } }, data: { projectId: null } }),
    prisma.projectAsset.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.invoice.deleteMany({ where: { clientId } }),
    prisma.project.deleteMany({ where: { clientId } }),
    // everything hanging off the client itself
    prisma.deliverable.deleteMany({ where: { clientId } }),
    prisma.onboardingStep.deleteMany({ where: { clientId } }),
    prisma.clientDocument.deleteMany({ where: { clientId } }),
    prisma.clientFeedback.deleteMany({ where: { clientId } }),
    prisma.clientInvite.deleteMany({ where: { clientId } }),
    prisma.client.update({ where: { id: clientId }, data: { tags: { set: [] } } }),
    prisma.client.delete({ where: { id: clientId } }),
  ]);

  revalidatePath("/clients");
  revalidatePath("/board");
  revalidatePath("/history");
  return {};
}

// Links sent to clients that nobody has filled in yet — so the same one can
// be copied again rather than a second link being made for the same client.
export async function pendingInvites() {
  if (!(await requireOps())) return [];
  const rows = await prisma.clientInvite.findMany({
    where: { usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, name: true, createdAt: true },
    take: 20,
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// Deliverables — the contracted scope, distinct from day-to-day Tasks.
export async function addDeliverable(
  clientId: string,
  name: string,
  detail: string,
  deliveredCount: number
): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit deliverables." };
  if (name.trim() === "") return { error: "Name a deliverable first." };

  const last = await prisma.deliverable.findFirst({ where: { clientId }, orderBy: { sortOrder: "desc" } });
  await prisma.deliverable.create({
    data: {
      clientId,
      name: name.trim(),
      detail: detail.trim() || null,
      deliveredCount: Math.max(0, Math.trunc(deliveredCount) || 0),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function updateDeliverable(
  id: string,
  name: string,
  detail: string,
  deliveredCount: number
): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit deliverables." };
  if (name.trim() === "") return { error: "Name a deliverable first." };

  await prisma.deliverable.update({
    where: { id },
    data: { name: name.trim(), detail: detail.trim() || null, deliveredCount: Math.max(0, Math.trunc(deliveredCount) || 0) },
  });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function deleteDeliverable(id: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit deliverables." };

  await prisma.deliverable.delete({ where: { id } });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export type ClientTemplateData = {
  brandGuidelines: string;
  sop: string;
  qualityChecklist: string;
  meetingNotes: string;
  resources: string;
  deliverables: TemplateItem[];
  onboarding: TemplateStep[];
  tags: string[];
  projectType: string;
};

// There is exactly one template row. Reading it creates it on first use,
// seeded from templateDefaults — after that the database is the source of
// truth and ops edits it in the app.
export async function getClientTemplate(): Promise<ClientTemplateData> {
  if (!(await requireOps())) throw new Error("Only ops team members can see the template.");
  return loadClientTemplate();
}

async function loadClientTemplate(): Promise<ClientTemplateData> {
  const existing = await prisma.clientTemplate.findUnique({ where: { id: "default" } });
  const row =
    existing ??
    (await prisma.clientTemplate.create({
      data: {
        id: "default",
        ...DEFAULT_DOCS,
        deliverables: DEFAULT_DELIVERABLES,
        onboarding: DEFAULT_ONBOARDING,
        tags: DEFAULT_TAGS,
        projectType: "Podcast",
      },
    }));

  return {
    brandGuidelines: row.brandGuidelines ?? "",
    sop: row.sop ?? "",
    qualityChecklist: row.qualityChecklist ?? "",
    meetingNotes: row.meetingNotes ?? "",
    resources: row.resources ?? "",
    deliverables: (row.deliverables as TemplateItem[]) ?? [],
    onboarding: (row.onboarding as TemplateStep[]) ?? [],
    tags: (row.tags as string[]) ?? [],
    projectType: row.projectType,
  };
}

export async function updateClientTemplate(data: ClientTemplateData): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit the template." };

  await prisma.clientTemplate.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  revalidatePath("/clients/template");
  return {};
}

// Every client is created the same way: the template's documents, its
// contracted deliverables, its tags, a first project, and the onboarding
// checklist. Nothing is left to whoever happened to set the client up.
export async function createClient(name: string, niche = ""): Promise<{ id?: string; slug?: string; error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can add a client." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the client a name." };

  const existing = await prisma.client.findFirst({ where: { name: { equals: trimmed, mode: "insensitive" } } });
  if (existing) return { error: `${existing.name} is already on the roster.` };

  const template = await loadClientTemplate();

  const client = await prisma.client.create({
    data: {
      name: trimmed,
      slug: await slugFor(trimmed),
      status: "current",
      niche: niche.trim() || null,
      brandGuidelines: template.brandGuidelines || null,
      sop: template.sop || null,
      qualityChecklist: template.qualityChecklist || null,
      meetingNotes: template.meetingNotes || null,
      resources: template.resources || null,
      deliverables: {
        create: template.deliverables.map((d, i) => ({ name: d.name, detail: d.detail || null, sortOrder: i })),
      },
      onboarding: {
        create: template.onboarding.map((s, i) => ({ title: s.title, detail: s.detail || null, sortOrder: i })),
      },
      projects: { create: [{ name: template.projectType, type: template.projectType, status: "in_progress" }] },
    },
  });

  // tags are shared across clients, so attach the existing rows rather than
  // creating a second "Subscription" with a different colour
  if (template.tags.length > 0) {
    const tags = await prisma.tag.findMany({ where: { name: { in: template.tags } } });
    if (tags.length > 0) {
      await prisma.client.update({
        where: { id: client.id },
        data: { tags: { set: tags.map((t) => ({ id: t.id })) } },
      });
    }
  }

  revalidatePath("/clients");
  return { id: client.id, slug: client.slug };
}

export async function toggleOnboardingStep(stepId: string, done: boolean): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can update onboarding." };

  await prisma.onboardingStep.update({ where: { id: stepId }, data: { done } });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

// Brings one client up to the current template: the onboarding checklist,
// the deliverables list, and the four standing documents.
//
// Only ever fills gaps — it adds onboarding steps whose titles aren't there,
// seeds deliverables when the client has none at all, and writes a document
// only where the client's own is still empty. So it's safe to re-run over
// everyone, and it can't overwrite something ops has edited.
//
// createClient does the same thing inline in a single nested create; this is
// the path for clients that arrive any other way — above all the Notion sync,
// which until now produced a bare client row with a "General" project and no
// template at all, which is why some clients had a checklist and others had
// nothing.
async function applyTemplateTo(clientId: string, template: ClientTemplateData): Promise<number> {
  const [steps, deliverableCount, client] = await Promise.all([
    prisma.onboardingStep.findMany({ where: { clientId }, select: { title: true } }),
    prisma.deliverable.count({ where: { clientId } }),
    prisma.client.findUnique({
      where: { id: clientId },
      select: { brandGuidelines: true, sop: true, qualityChecklist: true, meetingNotes: true, resources: true },
    }),
  ]);

  const have = new Set(steps.map((s) => s.title));
  const missing = template.onboarding.filter((s) => !have.has(s.title));
  if (missing.length > 0) {
    await prisma.onboardingStep.createMany({
      data: missing.map((s, i) => ({ clientId, title: s.title, detail: s.detail || null, sortOrder: have.size + i })),
    });
  }

  // all-or-nothing, unlike the checklist: a client who's had their list
  // tailored shouldn't have the generic one merged back in on top
  if (deliverableCount === 0 && template.deliverables.length > 0) {
    await prisma.deliverable.createMany({
      data: template.deliverables.map((d, i) => ({ clientId, name: d.name, detail: d.detail || null, sortOrder: i })),
    });
  }

  if (client) {
    const docs: Record<string, string> = {};
    for (const key of ["brandGuidelines", "sop", "qualityChecklist", "meetingNotes", "resources"] as const) {
      if (!client[key] && template[key]) docs[key] = template[key];
    }
    if (Object.keys(docs).length > 0) await prisma.client.update({ where: { id: clientId }, data: docs });
  }

  return missing.length;
}

// Re-applies the current template to a client that predates it (or was set
// up before a step was added).
export async function applyOnboardingTemplate(clientId: string): Promise<{ added: number; error?: string }> {
  const user = await requireOps();
  if (!user) return { added: 0, error: "Only ops team members can do that." };

  const added = await applyTemplateTo(clientId, await loadClientTemplate());
  revalidatePath("/clients/[slug]", "page");
  return { added };
}

export async function setNotionContentDb(clientId: string, dbId: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can change this." };

  // accept a pasted Notion URL as well as a bare id
  const match = dbId.trim().match(/[0-9a-f]{32}|[0-9a-f-]{36}/i);
  await prisma.client.update({
    where: { id: clientId },
    data: { notionContentDbId: match ? match[0] : null },
  });
  revalidatePath("/clients/[slug]", "page");
  return {};
}

export async function importFromNotion(clientId: string) {
  const user = await requireOps();
  if (!user) return { projects: 0, assets: 0, docs: 0, error: "Only ops team members can import." };

  try {
    const result = await importClientFromNotion(clientId);
    revalidatePath("/clients/[slug]", "page");
    return result;
  } catch (err) {
    return { projects: 0, assets: 0, docs: 0, error: err instanceof Error ? err.message : "Import failed." };
  }
}

// Projects are the unit of work a client is invoiced for — one podcast
// episode, one video. Tasks hang off them.
// Every cover this client's projects already use, newest first — the pool
// the cover picker offers. Reusing one costs nothing: a cover is a link to
// an image (or the image itself), so two projects can point at the same one.
export async function listClientCovers(clientId: string): Promise<{ url: string; name: string }[]> {
  if (!(await requireOps())) return [];
  const projects = await prisma.project.findMany({
    where: { clientId, coverUrl: { not: null } },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { name: true, type: true, coverUrl: true },
    take: 120,
  });
  const seen = new Set<string>();
  const pool: { url: string; name: string }[] = [];
  for (const p of projects) {
    if (seen.has(p.coverUrl!)) continue; // the same picture, once
    seen.add(p.coverUrl!);
    pool.push({ url: p.coverUrl!, name: p.name || p.type });
  }
  return pool.slice(0, 60);
}

export async function createProject(
  clientId: string,
  name: string,
  coverUrl: string | null = null,
  deliverableTypes: string[] = []
): Promise<{ id?: string; error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can add a project." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the project a name." };
  if (coverUrl && coverUrl.length > 500_000) return { error: "That cover image is too large." };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { projects: { take: 1, orderBy: { createdAt: "asc" } } },
  });
  if (!client) return { error: "Client not found." };

  const project = await prisma.project.create({
    data: {
      clientId,
      name: trimmed,
      // inherit whatever this client's work is already filed as, so a new
      // project doesn't invent a second spelling of "podcast"
      type: client.projects[0]?.type ?? "project",
      status: "in_progress",
      coverUrl,
      // one empty placeholder per selected deliverable type — the same
      // structure (see lib/deliverableTypes) on every project, filled in
      // with a real link later from the project page
      assets: { create: deliverableTypes.map((t, i) => ({ name: t, contentType: t, sortOrder: i })) },
    },
  });
  revalidatePath("/clients/[slug]", "page");
  return { id: project.id };
}

export async function updateProject(
  projectId: string,
  // every field on the header is editable, not just the first three it
  // started with — a Notion import can get any of them wrong, and the
  // point of owning this data here is being able to correct it
  data: {
    name: string;
    status: string;
    driveLink: string;
    type?: string;
    coverUrl?: string | null;
    completedAt?: string; // yyyy-mm-dd, "" to clear
  }
): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit a project." };
  if (!data.name.trim()) return { error: "Give the project a name." };
  if (data.coverUrl && data.coverUrl.length > 500_000) return { error: "That cover image is too large." };

  const existing = await prisma.project.findUnique({ where: { id: projectId } });
  if (!existing) return { error: "Project not found." };

  // completedAt is its own field now rather than something stamped with
  // "now" on every save: a project finished last month shouldn't get
  // today's date just because someone fixed a typo in its name.
  let completedAt = existing.completedAt;
  if (data.completedAt !== undefined) {
    completedAt = data.completedAt ? new Date(`${data.completedAt}T12:00:00`) : null;
  } else if (data.status === "completed" && !existing.completedAt) {
    completedAt = new Date();
  }
  if (data.status !== "completed") completedAt = null;

  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: data.name.trim(),
      status: data.status,
      driveLink: data.driveLink.trim() || null,
      ...(data.type !== undefined ? { type: data.type.trim() || existing.type } : {}),
      ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
      completedAt,
    },
  });
  revalidatePath("/clients/[slug]", "page");
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// --- A project's files (ProjectAsset rows) -------------------------------
// Whatever the Notion import pulled in is a starting point, not gospel:
// names, types and links all get corrected by hand from the project page.

export type ProjectAssetInput = { name: string; contentType: string; link: string };

async function revalidateProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
  if (project) revalidatePath("/clients/[slug]", "page");
  revalidatePath(`/projects/${projectId}`);
}

export async function addProjectAsset(projectId: string, input: ProjectAssetInput): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit a project's files." };
  if (!input.name.trim()) return { error: "Give the file a name." };
  let link: string | null;
  try {
    link = requireLinkOrNull(input.link, "File link");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That link isn't valid." };
  }

  const last = await prisma.projectAsset.findFirst({ where: { projectId }, orderBy: { sortOrder: "desc" } });
  await prisma.projectAsset.create({
    data: {
      projectId,
      name: input.name.trim(),
      contentType: input.contentType.trim() || "Misc.",
      link,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  await revalidateProject(projectId);
  return {};
}

export async function updateProjectAsset(assetId: string, input: ProjectAssetInput): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit a project's files." };
  if (!input.name.trim()) return { error: "Give the file a name." };
  let link: string | null;
  try {
    link = requireLinkOrNull(input.link, "File link");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That link isn't valid." };
  }

  const asset = await prisma.projectAsset.update({
    where: { id: assetId },
    data: { name: input.name.trim(), contentType: input.contentType.trim() || "Misc.", link },
  });
  await revalidateProject(asset.projectId);
  return {};
}

export async function deleteProjectAsset(assetId: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can edit a project's files." };
  const asset = await prisma.projectAsset.delete({ where: { id: assetId } });
  await revalidateProject(asset.projectId);
  return {};
}

// Deleting a project takes its tasks with it — the whole thing goes, which
// is what the confirmation on the card warns about. The team's own work
// tasks only lose the link to it: they belong to a person, not a project.
export async function deleteProject(projectId: string): Promise<{ error?: string }> {
  const user = await requireOps();
  if (!user) return { error: "Only ops team members can delete a project." };

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return { error: "Project not found." };

  const taskIds = (await prisma.task.findMany({ where: { projectId }, select: { id: true } })).map((t) => t.id);

  // one transaction: a half-deleted project (tasks gone, project still
  // there) would leave the board pointing at nothing
  await prisma.$transaction([
    prisma.feedback.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.activityLog.deleteMany({ where: { entity: "Task", entityId: { in: taskIds } } }),
    prisma.task.deleteMany({ where: { projectId } }),
    prisma.workTask.updateMany({ where: { projectId }, data: { projectId: null } }),
    prisma.projectAsset.deleteMany({ where: { projectId } }),
    prisma.invoice.deleteMany({ where: { projectId } }),
    prisma.project.delete({ where: { id: projectId } }),
  ]);

  revalidatePath("/clients/[slug]", "page");
  revalidatePath("/board"); // its tasks were on it
  revalidatePath("/history");
  return {};
}
