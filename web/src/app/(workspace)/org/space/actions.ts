"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { buildsDepartment, isFounder, worksDepartment } from "@/lib/scope";
import {
  CHILD_OF,
  cleanValue,
  COLOR_NAMES,
  fillText,
  isColor,
  isFieldKind,
  leadVars,
  LINKEDIN_LIMIT,
  MARKED,
  MESSAGE_CHANNELS,
  overLimit,
  moveNeedsReason,
  uniqueSlug,
  type FieldData,
  type FieldKind,
  type LeadEventData,
  type Marked,
  type MessageData,
  type SentData,
  type OptionData,
  type SpaceKind,
  type StageData,
} from "@/lib/space";

// A department's pages: sections, portals, boards, and the leads on them.
// Every action re-reads who's asking (never trusting the client), checks
// they work in the department (or, to change its structure, lead it), and
// returns { error } rather than throwing: production hides thrown messages.

type Done = { error?: string };
type Who = { id: string; name: string; canBuild: boolean };

const SESSION_ENDED = "Your session has ended. Please sign in again.";
const NO_ACCESS = "You don't have access to this department.";
const BUILDERS_ONLY = "Only Level 1 and the department's Level 2 can change its structure.";

// The asker, if they may work in (or, with build, change) this department
async function whoFor(teamId: string, build = false): Promise<Who | { error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: SESSION_ENDED };
  if (!worksDepartment(viewer, teamId)) return { error: NO_ACCESS };
  const canBuild = buildsDepartment(viewer, teamId);
  if (build && !canBuild) return { error: BUILDERS_ONLY };
  return { id: viewer.id, name: viewer.name, canBuild };
}

const failed = (err: unknown, fallback: string): Done => {
  console.error(err);
  return { error: fallback };
};

function cleanName(name: string, what = "a name"): string | { error: string } {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return { error: `Give it ${what}.` };
  if (n.length > 120) return { error: "That name is too long." };
  return n;
}
function cleanReason(reason: string): string | { error: string } {
  const r = (reason ?? "").trim();
  if (!r) return { error: "Say why first." };
  return r.slice(0, 2000);
}

// the sidebar and every page under the department show names
const refreshTree = () => revalidatePath("/org", "layout");

async function spaceOf(id: string) {
  return prisma.space.findUnique({ where: { id }, select: { id: true, teamId: true, parentId: true, kind: true, name: true, slug: true } });
}
async function boardOfStage(id: string) {
  return prisma.boardStage.findUnique({ where: { id }, select: { id: true, name: true, color: true, sortOrder: true, boardId: true, board: { select: { teamId: true, name: true } } } });
}
async function boardOfField(id: string) {
  return prisma.boardField.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, boardId: true, onCard: true, required: true, sortOrder: true, board: { select: { teamId: true } }, options: { select: { id: true, name: true, color: true, sortOrder: true }, orderBy: { sortOrder: "asc" } } },
  });
}
async function leadWithBoard(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    select: { id: true, title: true, boardId: true, stageId: true, assignedToId: true, values: true, board: { select: { teamId: true } }, stage: { select: { name: true } } },
  });
}

// A line on a lead's record. The record holds where it has been: made,
// moved (and why, when it skipped or went back), put back. Edits to its
// details only stamp who last edited it (editedByName, editedAt).
async function record(tx: Prisma.TransactionClient, leadId: string, who: Who, e: { kind: string; summary: string; fromStage?: string | null; toStage?: string | null; reason?: string | null }) {
  await tx.leadEvent.create({
    data: { leadId, kind: e.kind, summary: e.summary, fromStage: e.fromStage ?? null, toStage: e.toStage ?? null, reason: e.reason ?? null, byId: who.id, byName: who.name },
  });
}
const edited = (who: Who) => ({ editedByName: who.name, editedAt: new Date() });

async function trash(
  tx: Prisma.TransactionClient,
  who: Who,
  t: { teamId: string; spaceId: string | null; kind: string; title: string; data: unknown; reason: string },
) {
  await tx.spaceTrash.create({
    data: { teamId: t.teamId, spaceId: t.spaceId, kind: t.kind, title: t.title, data: t.data as Prisma.InputJsonValue, reason: t.reason, byId: who.id, byName: who.name },
  });
}

// ================= Sections, portals and boards =================

// Copies a page's structure (its portals, boards, stages, properties and
// tags; never its leads) under a new parent: how a portal becomes a template.
async function copyStructure(tx: Prisma.TransactionClient, fromId: string, into: { teamId: string; parentId: string | null; name: string; slug: string; sortOrder: number }, byId: string): Promise<string> {
  const from = await tx.space.findUniqueOrThrow({
    where: { id: fromId },
    select: {
      kind: true,
      stages: { select: { name: true, color: true, sortOrder: true, messages: { select: { name: true, channel: true, subject: true, body: true, note: true, sortOrder: true } } } },
      fields: { select: { name: true, kind: true, onCard: true, required: true, sortOrder: true, options: { select: { name: true, color: true, sortOrder: true } } } },
      children: { select: { id: true, name: true, slug: true, sortOrder: true } },
    },
  });
  const made = await tx.space.create({ data: { teamId: into.teamId, parentId: into.parentId, kind: from.kind, name: into.name, slug: into.slug, sortOrder: into.sortOrder, createdById: byId } });
  for (const { messages, ...st } of from.stages) {
    const stage = await tx.boardStage.create({ data: { ...st, boardId: made.id }, select: { id: true } });
    if (messages.length) await tx.stageMessage.createMany({ data: messages.map((m) => ({ ...m, stageId: stage.id })) });
  }
  for (const f of from.fields) {
    const field = await tx.boardField.create({ data: { boardId: made.id, name: f.name, kind: f.kind, onCard: f.onCard, required: f.required, sortOrder: f.sortOrder } });
    if (f.options.length) await tx.fieldOption.createMany({ data: f.options.map((o) => ({ ...o, fieldId: field.id })) });
  }
  for (const child of from.children) await copyStructure(tx, child.id, { teamId: into.teamId, parentId: made.id, name: child.name, slug: child.slug, sortOrder: child.sortOrder }, byId);
  return made.id;
}

// A new section (on the department), portal (in a section) or board (in a
// portal); blank, or a copy of another one's structure. A blank board starts
// with three stages so it's usable at once.
export async function createSpace(input: { teamId: string; parentId: string | null; name: string; copyFromId?: string | null }): Promise<Done & { id?: string; slug?: string; kind?: SpaceKind }> {
  const who = await whoFor(input.teamId, true);
  if ("error" in who) return who;
  const name = cleanName(input.name);
  if (typeof name !== "string") return name;
  try {
    let kind: SpaceKind = CHILD_OF.department;
    if (input.parentId) {
      const parent = await spaceOf(input.parentId);
      if (!parent || parent.teamId !== input.teamId) return { error: "That page no longer exists." };
      if (parent.kind === "board") return { error: "A board can't hold pages." };
      kind = CHILD_OF[parent.kind as "section" | "portal"];
    }
    const siblings = await prisma.space.findMany({ where: { teamId: input.teamId, parentId: input.parentId }, select: { slug: true, name: true, sortOrder: true } });
    if (siblings.some((s) => s.name.toLowerCase() === name.toLowerCase())) return { error: `"${name}" already exists here.` };
    const slug = uniqueSlug(name, siblings.map((s) => s.slug));
    const sortOrder = Math.max(0, ...siblings.map((s) => s.sortOrder)) + 1;

    let id: string;
    if (input.copyFromId) {
      const source = await spaceOf(input.copyFromId);
      if (!source || source.teamId !== input.teamId) return { error: "The page to copy no longer exists." };
      if (source.kind !== kind) return { error: `Only another ${kind} can be copied here.` };
      id = await prisma.$transaction((tx) => copyStructure(tx, source.id, { teamId: input.teamId, parentId: input.parentId, name, slug, sortOrder }, who.id), { timeout: 30_000 });
    } else {
      id = await prisma.$transaction(async (tx) => {
        const made = await tx.space.create({ data: { teamId: input.teamId, parentId: input.parentId, kind, name, slug, sortOrder, createdById: who.id } });
        if (kind === "board")
          await tx.boardStage.createMany({
            data: [
              { boardId: made.id, name: "To do", color: "gray", sortOrder: 1 },
              { boardId: made.id, name: "In progress", color: "blue", sortOrder: 2 },
              { boardId: made.id, name: "Done", color: "green", sortOrder: 3 },
            ],
          });
        return made.id;
      });
    }
    refreshTree();
    return { id, slug, kind };
  } catch (err) {
    return failed(err, "That couldn't be created. Try again.");
  }
}

// A department's new name, by anyone in it (Level 1: any). Only the name
// changes: its address (slug), people and work stay.
export async function renameTeam(id: string, name: string): Promise<Done> {
  const who = await whoFor(id);
  if ("error" in who) return who;
  const n = cleanName(name);
  if (typeof n !== "string") return n;
  try {
    const clash = await prisma.team.findFirst({ where: { id: { not: id }, name: { equals: n, mode: "insensitive" } }, select: { name: true } });
    if (clash) return { error: `"${clash.name}" already exists.` };
    await prisma.team.update({ where: { id }, data: { name: n } });
    // the sidebar names every department
    revalidatePath("/", "layout");
    return {};
  } catch (err) {
    return failed(err, "That name couldn't be saved.");
  }
}

export async function renameSpace(id: string, name: string): Promise<Done> {
  const space = await spaceOf(id);
  if (!space) return { error: "That page no longer exists." };
  const who = await whoFor(space.teamId);
  if ("error" in who) return who;
  const n = cleanName(name);
  if (typeof n !== "string") return n;
  try {
    const clash = await prisma.space.findFirst({ where: { teamId: space.teamId, parentId: space.parentId, id: { not: id }, name: { equals: n, mode: "insensitive" } }, select: { id: true } });
    if (clash) return { error: `"${n}" already exists here.` };
    await prisma.space.update({ where: { id }, data: { name: n } });
    refreshTree();
    return {};
  } catch (err) {
    return failed(err, "That name couldn't be saved.");
  }
}

export async function reorderSpace(id: string, sortOrder: number): Promise<Done> {
  const space = await spaceOf(id);
  if (!space) return { error: "That page no longer exists." };
  const who = await whoFor(space.teamId, true);
  if ("error" in who) return who;
  if (!Number.isFinite(sortOrder)) return { error: "That order couldn't be saved." };
  try {
    await prisma.space.update({ where: { id }, data: { sortOrder } });
    refreshTree();
    return {};
  } catch (err) {
    return failed(err, "That order couldn't be saved.");
  }
}

// Only an empty page goes: a section without portals, a portal without
// boards, a board without leads (its stages and properties go with it).
export async function deleteSpace(id: string, reason: string): Promise<Done> {
  const space = await spaceOf(id);
  if (!space) return { error: "That page no longer exists." };
  const who = await whoFor(space.teamId, true);
  if ("error" in who) return who;
  const r = cleanReason(reason);
  if (typeof r !== "string") return r;
  try {
    const [children, leads] = await Promise.all([prisma.space.count({ where: { parentId: id } }), prisma.lead.count({ where: { boardId: id } })]);
    if (children) return { error: `Move or delete what's inside "${space.name}" first.` };
    if (leads) return { error: `"${space.name}" still has ${leads} ${leads === 1 ? "lead" : "leads"}. Move or delete them first.` };
    // leads in its bin would have nowhere to come back to
    if (space.kind === "board" && (await prisma.spaceTrash.count({ where: { spaceId: id, kind: "lead", restoredAt: null } })))
      return { error: `"${space.name}" has deleted leads in its bin. Put them back and move them, or keep the board.` };
    const full = await prisma.space.findUniqueOrThrow({
      where: { id },
      select: { id: true, kind: true, name: true, slug: true, parentId: true, sortOrder: true, stages: { select: { name: true, color: true, sortOrder: true } }, fields: { select: { name: true, kind: true, onCard: true, required: true, options: { select: { name: true, color: true } } } } },
    });
    await prisma.$transaction(async (tx) => {
      await trash(tx, who, { teamId: space.teamId, spaceId: space.parentId, kind: space.kind, title: space.name, data: full, reason: r });
      await tx.space.delete({ where: { id } });
    });
    refreshTree();
    return {};
  } catch (err) {
    return failed(err, "That couldn't be deleted.");
  }
}

// ================= Stages =================

export async function createStage(boardId: string, name: string, color?: string, afterId?: string | null): Promise<Done & { stage?: StageData }> {
  const board = await spaceOf(boardId);
  if (!board || board.kind !== "board") return { error: "That board no longer exists." };
  const who = await whoFor(board.teamId, true);
  if ("error" in who) return who;
  const n = cleanName(name);
  if (typeof n !== "string") return n;
  try {
    const stages = await prisma.boardStage.findMany({ where: { boardId }, select: { id: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
    let sortOrder = (stages.at(-1)?.sortOrder ?? 0) + 1;
    const at = afterId ? stages.findIndex((s) => s.id === afterId) : -1;
    if (at >= 0) sortOrder = at === stages.length - 1 ? stages[at].sortOrder + 1 : (stages[at].sortOrder + stages[at + 1].sortOrder) / 2;
    const c = color && isColor(color) ? color : COLOR_NAMES[stages.length % COLOR_NAMES.length];
    const stage = await prisma.boardStage.create({ data: { boardId, name: n, color: c, sortOrder }, select: { id: true, name: true, color: true } });
    return { stage };
  } catch (err) {
    return failed(err, "That stage couldn't be added.");
  }
}

export async function renameStage(id: string, name: string): Promise<Done> {
  const stage = await boardOfStage(id);
  if (!stage) return { error: "That stage no longer exists." };
  const who = await whoFor(stage.board.teamId);
  if ("error" in who) return who;
  const n = cleanName(name);
  if (typeof n !== "string") return n;
  try {
    await prisma.boardStage.update({ where: { id }, data: { name: n } });
    return {};
  } catch (err) {
    return failed(err, "That name couldn't be saved.");
  }
}

export async function orderStages(boardId: string, ids: string[]): Promise<Done> {
  const board = await spaceOf(boardId);
  if (!board || board.kind !== "board") return { error: "That board no longer exists." };
  const who = await whoFor(board.teamId, true);
  if ("error" in who) return who;
  try {
    const stages = await prisma.boardStage.findMany({ where: { boardId }, select: { id: true } });
    if (ids.length !== stages.length || new Set(ids).size !== ids.length || !stages.every((st) => ids.includes(st.id)))
      return { error: "The stages changed meanwhile. Refresh and try again." };
    await prisma.$transaction(ids.map((id, i) => prisma.boardStage.update({ where: { id }, data: { sortOrder: i + 1 } })));
    return {};
  } catch (err) {
    return failed(err, "That order couldn't be saved.");
  }
}

// An empty stage only, and never a board's last one
export async function deleteStage(id: string, reason: string): Promise<Done> {
  const stage = await boardOfStage(id);
  if (!stage) return { error: "That stage no longer exists." };
  const who = await whoFor(stage.board.teamId, true);
  if ("error" in who) return who;
  const r = cleanReason(reason);
  if (typeof r !== "string") return r;
  try {
    const [leads, stages] = await Promise.all([prisma.lead.count({ where: { stageId: id } }), prisma.boardStage.count({ where: { boardId: stage.boardId } })]);
    if (leads) return { error: `"${stage.name}" still has ${leads} ${leads === 1 ? "lead" : "leads"}. Move them to another stage first.` };
    if (stages <= 1) return { error: "A board needs at least one stage." };
    await prisma.$transaction(async (tx) => {
      await trash(tx, who, { teamId: stage.board.teamId, spaceId: stage.boardId, kind: "stage", title: stage.name, data: { name: stage.name, color: stage.color, sortOrder: stage.sortOrder }, reason: r });
      await tx.boardStage.delete({ where: { id } });
    });
    return {};
  } catch (err) {
    return failed(err, "That stage couldn't be deleted.");
  }
}

// ================= Properties and their tags =================

export async function createField(boardId: string, name: string, kind: string): Promise<Done & { field?: FieldData }> {
  const board = await spaceOf(boardId);
  if (!board || board.kind !== "board") return { error: "That board no longer exists." };
  const who = await whoFor(board.teamId, true);
  if ("error" in who) return who;
  const n = cleanName(name);
  if (typeof n !== "string") return n;
  if (!isFieldKind(kind)) return { error: "Pick a kind of property." };
  try {
    const fields = await prisma.boardField.findMany({ where: { boardId }, select: { name: true, sortOrder: true } });
    if (fields.some((f) => f.name.toLowerCase() === n.toLowerCase())) return { error: `"${n}" already exists on this board.` };
    const sortOrder = Math.max(0, ...fields.map((f) => f.sortOrder)) + 1;
    const field = await prisma.boardField.create({ data: { boardId, name: n, kind, sortOrder }, select: { id: true, name: true, kind: true, onCard: true, required: true } });
    return { field: { ...field, kind: field.kind as FieldKind, options: [] } };
  } catch (err) {
    return failed(err, "That property couldn't be added.");
  }
}

export async function renameField(id: string, name: string): Promise<Done> {
  const field = await boardOfField(id);
  if (!field) return { error: "That property no longer exists." };
  const who = await whoFor(field.board.teamId);
  if ("error" in who) return who;
  const n = cleanName(name);
  if (typeof n !== "string") return n;
  try {
    const clash = await prisma.boardField.findFirst({ where: { boardId: field.boardId, id: { not: id }, name: { equals: n, mode: "insensitive" } }, select: { id: true } });
    if (clash) return { error: `"${n}" already exists on this board.` };
    await prisma.boardField.update({ where: { id }, data: { name: n } });
    return {};
  } catch (err) {
    return failed(err, "That name couldn't be saved.");
  }
}

export async function setFieldFlags(id: string, flags: { onCard?: boolean; required?: boolean }): Promise<Done> {
  const field = await boardOfField(id);
  if (!field) return { error: "That property no longer exists." };
  const who = await whoFor(field.board.teamId, true);
  if ("error" in who) return who;
  const data: { onCard?: boolean; required?: boolean } = {};
  if (typeof flags.onCard === "boolean") data.onCard = flags.onCard;
  if (typeof flags.required === "boolean") data.required = flags.required;
  try {
    await prisma.boardField.update({ where: { id }, data });
    return {};
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

export async function reorderField(id: string, sortOrder: number): Promise<Done> {
  const field = await boardOfField(id);
  if (!field) return { error: "That property no longer exists." };
  const who = await whoFor(field.board.teamId, true);
  if ("error" in who) return who;
  if (!Number.isFinite(sortOrder)) return { error: "That order couldn't be saved." };
  try {
    await prisma.boardField.update({ where: { id }, data: { sortOrder } });
    return {};
  } catch (err) {
    return failed(err, "That order couldn't be saved.");
  }
}

// The property goes, and its value comes off every lead; both are kept in
// the bin's record of it.
export async function deleteField(id: string, reason: string): Promise<Done> {
  const field = await boardOfField(id);
  if (!field) return { error: "That property no longer exists." };
  const who = await whoFor(field.board.teamId, true);
  if ("error" in who) return who;
  const r = cleanReason(reason);
  if (typeof r !== "string") return r;
  try {
    const leads = await prisma.lead.findMany({ where: { boardId: field.boardId }, select: { id: true, values: true } });
    const values: Record<string, unknown> = {};
    for (const l of leads) {
      const v = (l.values as Record<string, unknown> | null)?.[id];
      if (v != null) values[l.id] = v;
    }
    await prisma.$transaction(async (tx) => {
      await trash(tx, who, { teamId: field.board.teamId, spaceId: field.boardId, kind: "field", title: field.name, data: { field, values }, reason: r });
      await tx.$executeRaw`UPDATE "Lead" SET "values" = "values" - ${id}::text WHERE "boardId" = ${field.boardId} AND "values" ? ${id}::text`;
      await tx.boardField.delete({ where: { id } });
    });
    return {};
  } catch (err) {
    return failed(err, "That property couldn't be deleted.");
  }
}

// A new tag on a property, typed by anyone working the board. Typing one
// that exists (in any case) just returns it.
export async function addOption(fieldId: string, name: string): Promise<Done & { option?: OptionData }> {
  const field = await boardOfField(fieldId);
  if (!field) return { error: "That property no longer exists." };
  const who = await whoFor(field.board.teamId);
  if ("error" in who) return who;
  if (field.kind !== "select" && field.kind !== "multi") return { error: "Only tag properties take tags." };
  const n = cleanName(name, "a tag");
  if (typeof n !== "string") return n;
  try {
    const same = field.options.find((o) => o.name.toLowerCase() === n.toLowerCase());
    if (same) return { option: { id: same.id, name: same.name, color: same.color } };
    const sortOrder = Math.max(0, ...field.options.map((o) => o.sortOrder)) + 1;
    const color = COLOR_NAMES[(field.options.length % (COLOR_NAMES.length - 1)) + 1];
    const option = await prisma.fieldOption.create({ data: { fieldId, name: n, color, sortOrder }, select: { id: true, name: true, color: true } });
    return { option };
  } catch (err) {
    return failed(err, "That tag couldn't be added.");
  }
}

async function optionWithBoard(id: string) {
  return prisma.fieldOption.findUnique({ where: { id }, select: { id: true, name: true, color: true, fieldId: true, field: { select: { name: true, boardId: true, board: { select: { teamId: true } } } } } });
}

export async function renameOption(id: string, name: string): Promise<Done> {
  const option = await optionWithBoard(id);
  if (!option) return { error: "That tag no longer exists." };
  const who = await whoFor(option.field.board.teamId);
  if ("error" in who) return who;
  const n = cleanName(name, "a tag");
  if (typeof n !== "string") return n;
  try {
    const clash = await prisma.fieldOption.findFirst({ where: { fieldId: option.fieldId, id: { not: id }, name: { equals: n, mode: "insensitive" } }, select: { id: true } });
    if (clash) return { error: `"${n}" already exists.` };
    await prisma.fieldOption.update({ where: { id }, data: { name: n } });
    return {};
  } catch (err) {
    return failed(err, "That name couldn't be saved.");
  }
}

export async function deleteOption(id: string, reason: string): Promise<Done> {
  const option = await optionWithBoard(id);
  if (!option) return { error: "That tag no longer exists." };
  const who = await whoFor(option.field.board.teamId);
  if ("error" in who) return who;
  const r = cleanReason(reason);
  if (typeof r !== "string") return r;
  try {
    const fid = option.fieldId;
    await prisma.$transaction(async (tx) => {
      // taken off in one statement, so a tag picked meanwhile isn't lost
      const had = await tx.$queryRaw<{ id: string }[]>`
        UPDATE "Lead" SET "values" = CASE
          WHEN jsonb_array_length(("values"->${fid}::text) - ${id}::text) = 0 THEN "values" - ${fid}::text
          ELSE jsonb_set("values", ARRAY[${fid}::text], ("values"->${fid}::text) - ${id}::text, true) END
        WHERE "boardId" = ${option.field.boardId} AND jsonb_typeof("values"->${fid}::text) = 'array' AND ("values"->${fid}::text) ? ${id}::text
        RETURNING id`;
      await trash(tx, who, { teamId: option.field.board.teamId, spaceId: option.field.boardId, kind: "option", title: `${option.field.name}: ${option.name}`, data: { option, leads: had.map((l) => l.id) }, reason: r });
      await tx.fieldOption.delete({ where: { id } });
    });
    return {};
  } catch (err) {
    return failed(err, "That tag couldn't be deleted.");
  }
}

// ================= Leads =================

// Every lead starts at the board's first stage, wherever it was added from
// (with the podcast's links, when given, on the board's links property),
// given to whoever added it until someone hands it on
export async function createLead(boardId: string, title: string, links: { label: string; url: string }[] = []): Promise<Done & { id?: string }> {
  const board = await spaceOf(boardId);
  if (!board || board.kind !== "board") return { error: "That board no longer exists." };
  const who = await whoFor(board.teamId);
  if ("error" in who) return who;
  const n = (title ?? "").trim().replace(/\s+/g, " ");
  if (!n) return { error: "Give the lead a name." };
  if (n.length > 200) return { error: "That name is too long." };
  try {
    const stage = await prisma.boardStage.findFirst({ where: { boardId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
    if (!stage) return { error: "This board has no stages yet." };
    const stageId = stage.id;
    const id = await prisma.$transaction(async (tx) => {
      const field = links.length ? await tx.boardField.findFirst({ where: { boardId, kind: "links" }, orderBy: { sortOrder: "asc" }, select: { id: true } }) : null;
      const clean = field ? cleanValue("links", links) : null;
      const values = field && clean && "value" in clean && clean.value ? { [field.id]: clean.value } : {};
      const lead = await tx.lead.create({ data: { boardId, stageId, title: n, values, sortOrder: Date.now(), createdById: who.id, assignedToId: who.id, assignedByName: who.name, assignedAt: new Date() }, select: { id: true } });
      await record(tx, lead.id, who, { kind: "created", summary: `Created in ${stage.name}`, toStage: stage.name });
      return lead.id;
    });
    return { id };
  } catch (err) {
    return failed(err, "That lead couldn't be added.");
  }
}

export async function renameLead(id: string, title: string): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  const n = (title ?? "").trim().replace(/\s+/g, " ");
  if (!n) return { error: "Give the lead a name." };
  if (n.length > 200) return { error: "That name is too long." };
  if (n === lead.title) return {};
  try {
    await prisma.lead.update({ where: { id }, data: { title: n, ...edited(who) } });
    return {};
  } catch (err) {
    return failed(err, "That name couldn't be saved.");
  }
}

// One property's value: checked for its kind, written alone (so two people
// editing different properties never overwrite each other), and noted.
export async function setLeadValue(id: string, fieldId: string, value: unknown): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  try {
    const field = await boardOfField(fieldId);
    if (!field || field.boardId !== lead.boardId || !isFieldKind(field.kind)) return { error: "That property no longer exists. Refresh and try again." };
    const clean = cleanValue(field.kind, value, field.options.map((o) => o.id));
    if ("error" in clean) return clean;
    const v = clean.value;
    if (v == null) await prisma.$executeRaw`UPDATE "Lead" SET "values" = "values" - ${fieldId}::text, "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    else
      await prisma.$executeRaw`UPDATE "Lead" SET "values" = jsonb_set(coalesce("values", '{}'::jsonb), ARRAY[${fieldId}::text], ${JSON.stringify(v)}::jsonb, true), "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    return {};
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

// Instagram or LinkedIn, marked by hand: seen or replied (once each, kept
// with the day it was marked on); no day clears it. Email's opens and
// replies come from the sales inbox, never from here. Each mark is written
// alone, so two people marking the same lead keep both.
export async function setLeadMark(id: string, platform: Marked, kind: "seen" | "replied", day: string | null): Promise<Done> {
  if (!MARKED.includes(platform) || (kind !== "seen" && kind !== "replied")) return { error: "That couldn't be read." };
  if (day !== null && (typeof day !== "string" || !day || day.length > 80)) return { error: "That day couldn't be found." };
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  try {
    if (day === null)
      await prisma.$executeRaw`UPDATE "Lead" SET "marks" = "marks" #- ARRAY[${platform}::text, ${kind}::text], "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    else {
      const mark = JSON.stringify({ day, at: new Date().toISOString() });
      await prisma.$executeRaw`UPDATE "Lead" SET "marks" = jsonb_set(coalesce("marks", '{}'::jsonb), ARRAY[${platform}::text], coalesce("marks" -> ${platform}::text, '{}'::jsonb) || jsonb_build_object(${kind}::text, ${mark}::jsonb), true), "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    }
    return {};
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

// The message picked for a day (or stage) with more than one, kept per
// lead; null forgets it. Written alone, so picks on other days stay.
export async function pickMessage(id: string, key: string, messageId: string | null): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  if (typeof key !== "string" || !key || key.length > 80) return { error: "That day couldn't be found." };
  try {
    if (messageId == null) await prisma.$executeRaw`UPDATE "Lead" SET "picks" = "picks" - ${key}::text WHERE id = ${id}`;
    else {
      const ok = await prisma.stageMessage.count({ where: { id: messageId, stage: { boardId: lead.boardId } } });
      if (!ok) return { error: "That message no longer exists. Refresh and try again." };
      await prisma.$executeRaw`UPDATE "Lead" SET "picks" = jsonb_set(coalesce("picks", '{}'::jsonb), ARRAY[${key}::text], ${JSON.stringify(messageId)}::jsonb, true) WHERE id = ${id}`;
    }
    return {};
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

export async function setLeadNotes(id: string, notes: string): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  const text = String(notes ?? "").slice(0, 100_000);
  try {
    await prisma.lead.update({ where: { id }, data: { notes: text, ...edited(who) } });
    return {};
  } catch (err) {
    return failed(err, "The write-up couldn't be saved.");
  }
}

// Who the lead is given to: anyone on staff who works in this department,
// or Level 1. Not a line in its history (that holds stage moves); it stamps
// who last edited it.
export async function assignLead(id: string, userId: string | null): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  if ((userId ?? null) === lead.assignedToId) return {};
  try {
    let name = "";
    if (userId) {
      const person = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true, email: true, employment: true, departments: { select: { id: true } } } });
      if (!person || person.employment === "former") return { error: "That person isn't on the team any more." };
      if (!isFounder(person) && !person.departments.some((d) => d.id === lead.board.teamId)) return { error: `${person.name} isn't in this department.` };
      name = person.name;
    }
    const before = lead.assignedToId ? ((await prisma.user.findUnique({ where: { id: lead.assignedToId }, select: { name: true } }))?.name ?? "someone") : null;
    // who passed it to whom stays on its record, hand-off after hand-off
    const summary = userId ? (before ? `Reassigned from ${before} to ${name}` : `Assigned to ${name}`) : `Unassigned from ${before}`;
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { assignedToId: userId, assignedByName: userId ? who.name : null, assignedAt: userId ? new Date() : null, ...edited(who) } });
      await record(tx, id, who, { kind: "assigned", summary });
    });
    return {};
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

// Into another stage. One step forward needs nothing; going back, or
// skipping ahead, needs a reason, which stays on the lead's record. Without
// one, the answer says so ({ needsReason }) and nothing moves.
export async function moveLead(id: string, toStageId: string, sortOrder: number, reason?: string): Promise<Done & { needsReason?: boolean }> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  if (!Number.isFinite(sortOrder)) return { error: "That move couldn't be saved." };
  try {
    if (toStageId === lead.stageId) {
      await prisma.lead.update({ where: { id }, data: { sortOrder } });
      return {};
    }
    const stages = await prisma.boardStage.findMany({ where: { boardId: lead.boardId }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } });
    const to = stages.find((s) => s.id === toStageId);
    if (!to) return { error: "That stage no longer exists. Refresh and try again." };
    const needs = moveNeedsReason(stages.map((s) => s.id), lead.stageId, toStageId);
    const why = (reason ?? "").trim().slice(0, 2000);
    if (needs && !why) return { needsReason: true, error: "Say why it's skipping ahead or going back." };
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: { stageId: toStageId, sortOrder, stageSince: new Date() } });
      await record(tx, id, who, { kind: "moved", summary: `Moved from ${lead.stage.name} to ${to.name}`, fromStage: lead.stage.name, toStage: to.name, reason: needs ? why : null });
    });
    return {};
  } catch (err) {
    return failed(err, "That move couldn't be saved.");
  }
}

// Within its own stage: no record, nothing to say
export async function reorderLead(id: string, sortOrder: number): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  if (!Number.isFinite(sortOrder)) return { error: "That order couldn't be saved." };
  try {
    await prisma.lead.update({ where: { id }, data: { sortOrder } });
    return {};
  } catch (err) {
    return failed(err, "That order couldn't be saved.");
  }
}

// Into the bin, with its whole record and the reason
export async function deleteLead(id: string, reason: string): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  const r = cleanReason(reason);
  if (typeof r !== "string") return r;
  try {
    const full = await prisma.lead.findUniqueOrThrow({ where: { id }, include: { events: true } });
    await prisma.$transaction(async (tx) => {
      await trash(tx, who, { teamId: lead.board.teamId, spaceId: lead.boardId, kind: "lead", title: lead.title, data: { ...full, stageName: lead.stage.name }, reason: r });
      await tx.lead.delete({ where: { id } });
    });
    return {};
  } catch (err) {
    return failed(err, "That lead couldn't be deleted.");
  }
}

// ================= Messages =================

const isChannel = (c: string) => MESSAGE_CHANNELS.some((m) => m.kind === c);
async function messageWithBoard(id: string) {
  return prisma.stageMessage.findUnique({
    where: { id },
    select: { id: true, name: true, channel: true, subject: true, body: true, note: true, stageId: true, stage: { select: { name: true, boardId: true, board: { select: { teamId: true } } } } },
  });
}

// A new message template on a stage, written in full, for anyone working
// the board. Left unnamed, it's named after where it's sent ("Email 2").
export async function createMessage(stageId: string, name: string, channel: string, subject = "", body = "", note = ""): Promise<Done & { message?: MessageData }> {
  const stage = await boardOfStage(stageId);
  if (!stage) return { error: "That stage no longer exists." };
  const who = await whoFor(stage.board.teamId);
  if ("error" in who) return who;
  if (!isChannel(channel)) return { error: "Pick where it's sent." };
  if (!String(body ?? "").trim()) return { error: "Write the message first." };
  const label = MESSAGE_CHANNELS.find((c) => c.kind === channel)!.label;
  const count = await prisma.stageMessage.count({ where: { stageId, channel } });
  const n = cleanName(String(name ?? "").trim() || `${label} ${count + 1}`, "the message a name");
  if (typeof n !== "string") return n;
  try {
    const last = await prisma.stageMessage.aggregate({ where: { stageId }, _max: { sortOrder: true } });
    const m = await prisma.stageMessage.create({
      data: { stageId, name: n, channel, subject: String(subject ?? "").slice(0, 300), body: String(body).slice(0, 20_000), note: String(note ?? "").trim().slice(0, 500), sortOrder: (last._max.sortOrder ?? 0) + 1 },
      select: { id: true, stageId: true, name: true, channel: true, subject: true, body: true, note: true },
    });
    return { message: m };
  } catch (err) {
    return failed(err, "That message couldn't be added.");
  }
}

// The stage's wording, for every lead that hasn't sent it yet (sent ones
// keep exactly what went out)
export async function updateMessage(id: string, patch: { name?: string; channel?: string; subject?: string; body?: string; note?: string }): Promise<Done> {
  const m = await messageWithBoard(id);
  if (!m) return { error: "That message no longer exists." };
  const who = await whoFor(m.stage.board.teamId);
  if ("error" in who) return who;
  const data: { name?: string; channel?: string; subject?: string; body?: string; note?: string } = {};
  if (patch.name != null) {
    const n = cleanName(patch.name, "the message a name");
    if (typeof n !== "string") return n;
    data.name = n;
  }
  if (patch.channel != null) {
    if (!isChannel(patch.channel)) return { error: "Pick where it's sent." };
    data.channel = patch.channel;
  }
  if (patch.subject != null) data.subject = String(patch.subject).slice(0, 300);
  if (patch.body != null) data.body = String(patch.body).slice(0, 20_000);
  if (patch.note != null) data.note = String(patch.note).trim().slice(0, 500);
  try {
    await prisma.stageMessage.update({ where: { id }, data });
    return {};
  } catch (err) {
    return failed(err, "That message couldn't be saved.");
  }
}

export async function deleteMessage(id: string, reason: string): Promise<Done> {
  const m = await messageWithBoard(id);
  if (!m) return { error: "That message no longer exists." };
  const who = await whoFor(m.stage.board.teamId);
  if ("error" in who) return who;
  const r = cleanReason(reason);
  if (typeof r !== "string") return r;
  try {
    await prisma.$transaction(async (tx) => {
      await trash(tx, who, { teamId: m.stage.board.teamId, spaceId: m.stage.boardId, kind: "message", title: `${m.stage.name}: ${m.name}`, data: m, reason: r });
      await tx.stageMessage.delete({ where: { id } });
    });
    return {};
  } catch (err) {
    return failed(err, "That message couldn't be deleted.");
  }
}

// One of a lead's message details ("Guest"), used by every message it sends
export async function setLeadVar(id: string, name: string, value: string): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  const key = String(name ?? "").trim().slice(0, 60);
  if (!key) return { error: "That detail has no name." };
  const v = String(value ?? "").trim().slice(0, 2000);
  try {
    if (!v) await prisma.$executeRaw`UPDATE "Lead" SET "vars" = "vars" - ${key}::text, "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    else
      await prisma.$executeRaw`UPDATE "Lead" SET "vars" = jsonb_set(coalesce("vars", '{}'::jsonb), ARRAY[${key}::text], ${JSON.stringify(v)}::jsonb, true), "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    return {};
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

// One message rewritten for this lead alone; null goes back to the template.
// The stage's template changing later leaves this copy as it is.
export async function setLeadDraft(id: string, messageId: string, draft: { subject: string; body: string } | null): Promise<Done> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  const key = String(messageId ?? "");
  if (!key) return { error: "That message no longer exists." };
  try {
    if (!draft) await prisma.$executeRaw`UPDATE "Lead" SET "drafts" = "drafts" - ${key}::text, "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    else {
      const body = String(draft.body ?? "").slice(0, 20_000);
      if (!body.trim()) return { error: "The message can't be empty." };
      const v = { subject: String(draft.subject ?? "").slice(0, 300), body };
      await prisma.$executeRaw`UPDATE "Lead" SET "drafts" = jsonb_set(coalesce("drafts", '{}'::jsonb), ARRAY[${key}::text], ${JSON.stringify(v)}::jsonb, true), "updatedAt" = now(), "editedByName" = ${who.name}, "editedAt" = now() WHERE id = ${id}`;
    }
    return {};
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

// A stage's message as it goes out to this lead, frozen once marked sent:
// later edits to the stage's wording never change it
export async function markSent(leadId: string, messageId: string): Promise<Done & { sent?: SentData }> {
  const [lead, m] = await Promise.all([leadWithBoard(leadId), messageWithBoard(messageId)]);
  if (!lead) return { error: "That lead no longer exists." };
  if (!m || m.stage.boardId !== lead.boardId) return { error: "That message no longer exists. Refresh and try again." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  try {
    const [full, fields] = await Promise.all([
      prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { title: true, values: true, vars: true, drafts: true } }),
      prisma.boardField.findMany({ where: { boardId: lead.boardId, kind: "contacts" }, select: { id: true, kind: true } }),
    ]);
    const vars = leadVars({ title: full.title, values: (full.values ?? {}) as Record<string, unknown>, vars: (full.vars ?? {}) as Record<string, string> }, fields as { id: string; kind: "contacts" }[]);
    // this lead's own copy, if it has one, else the template filled in
    const own = ((full.drafts ?? {}) as Record<string, { subject: string; body: string }>)[messageId];
    const subject = fillText(own ? own.subject : m.subject, vars);
    const body = fillText(own ? own.body : m.body, vars);
    const missing = [...new Set([...`${subject}\n${body}`.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((x) => x[1]))];
    if (missing.length) return { error: `Fill in ${missing.join(", ")} first.` };
    if (overLimit(m.channel, body)) return { error: `LinkedIn allows ${LINKEDIN_LIMIT} characters, and this is ${body.length}. Shorten it first.` };
    const sent = await prisma.sentMessage.create({ data: { leadId, messageId, stageName: m.stage.name, name: m.name, channel: m.channel, subject, body, byId: who.id, byName: who.name } });
    return { sent: { id: sent.id, messageId, stageName: sent.stageName, name: sent.name, channel: sent.channel, subject, body, byName: sent.byName, sentAt: sent.sentAt.toISOString() } };
  } catch (err) {
    return failed(err, "That couldn't be saved.");
  }
}

// Marked sent by mistake: back to the stage's own wording
export async function unmarkSent(sentId: string): Promise<Done> {
  const sent = await prisma.sentMessage.findUnique({ where: { id: sentId }, select: { id: true, leadId: true, name: true, stageName: true, lead: { select: { board: { select: { teamId: true } } } } } });
  if (!sent) return { error: "That's already undone." };
  const who = await whoFor(sent.lead.board.teamId);
  if ("error" in who) return who;
  try {
    await prisma.sentMessage.delete({ where: { id: sentId } });
    return {};
  } catch (err) {
    return failed(err, "That couldn't be undone.");
  }
}

// ================= Reading =================

// A lead's write-up and its record, newest first, for its page
export async function getLeadDetails(id: string): Promise<Done & { notes?: string; events?: LeadEventData[]; sent?: SentData[] }> {
  const lead = await leadWithBoard(id);
  if (!lead) return { error: "That lead no longer exists." };
  const who = await whoFor(lead.board.teamId);
  if ("error" in who) return who;
  const [full, events, sent] = await Promise.all([
    prisma.lead.findUnique({ where: { id }, select: { notes: true } }),
    prisma.leadEvent.findMany({ where: { leadId: id, kind: { in: ["created", "moved", "restored", "assigned"] } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.sentMessage.findMany({ where: { leadId: id }, orderBy: { sentAt: "desc" } }),
  ]);
  return {
    notes: full?.notes ?? "",
    events: events.map((e) => ({ id: e.id, kind: e.kind, summary: e.summary, fromStage: e.fromStage, toStage: e.toStage, reason: e.reason, byName: e.byName, createdAt: e.createdAt.toISOString() })),
    sent: sent.map((m) => ({ id: m.id, messageId: m.messageId, stageName: m.stageName, name: m.name, channel: m.channel, subject: m.subject, body: m.body, byName: m.byName, sentAt: m.sentAt.toISOString() })),
  };
}

