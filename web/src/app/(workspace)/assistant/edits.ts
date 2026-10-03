import { prisma } from "@/lib/prisma";
import { COLOR_NAMES, isColor } from "@/lib/space";
import { pickByName as pick, type Named as Row } from "@/lib/assistant";
import { findPerson, findTask } from "./tools";
import type { Proposal } from "./proposals";
import { createDepartment, createJobTitle, renameDepartment, renameRole } from "../team/actions";
import { assignLead, createLead, createStage, moveLead, renameLead, renameOption, renameSpace, renameStage } from "../org/space/actions";
import { createClient, updateClientInfo, updateClientStatus, updateProject } from "../clients/actions";
import { createWorkTask } from "../my-tasks/actions";
import { addNotice } from "../home/actions";

// What the assistant can rename, recolour, set or add across the app, beyond
// the task, person and invoice changes in proposals.ts. The same contract:
// Claude names a kind of thing and what should change; the thing is looked
// up here and every value checked, the admin sees before → after and
// confirms, and it's all checked again before anything is written. Writes go
// through the app's own actions wherever one exists, so a change made here
// behaves exactly like the same change made by hand. Nothing here deletes.
//
// One generic action each way ("edit", "add") rather than a tool per thing:
// the list of what's possible rides in every request to Claude, so it's kept
// to a line (tools.ts).

type Changes = Record<string, unknown>;

const CLIENT_STATUS = ["current", "on_hold", "previous"];
const PROJECT_STATUS = ["in_progress", "completed"];
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim().replace(/\s+/g, " "));
// a field Claude sent, or null when it didn't
const sent = (c: Changes, ...keys: string[]) => {
  for (const k of keys) if (c[k] !== undefined && c[k] !== null) return text(c[k]);
  return null;
};

// What each kind can have changed, for the "say what to change" answers
export const EDITABLE: Record<string, string> = {
  client: "name, niche, status (current, on_hold, previous)",
  project: "name, status (in_progress, completed)",
  department: "name",
  role: "name",
  board: "name",
  portal: "name",
  stage: `name, color (${COLOR_NAMES.join(", ")})`,
  tag: `name, color (${COLOR_NAMES.join(", ")})`,
  task: "title",
  lead: "title, stage, person",
};
export const ADDABLE = "todo {title, person, due}, notice {body}, lead {title, board}, department {name}, role {name, department}, stage {name, board, color}, client {name, niche}";

const boards = async () =>
  (await prisma.space.findMany({ where: { kind: "board" }, select: { id: true, name: true, parent: { select: { name: true } } } })).map((b) => ({ id: b.id, name: b.name, where: b.parent?.name }));

// ---------- edit ----------

export async function prepareEdit(ref: string, c: Changes): Promise<Proposal | string> {
  const kind = text(c.kind).toLowerCase();
  if (!(kind in EDITABLE)) return `Say what kind of thing it is: ${Object.keys(EDITABLE).join(", ")}.`;
  const lines: Proposal["lines"] = [];
  const values: Proposal["values"] = { kind };
  const hint = sent(c, "board", "client", "in") ?? "";

  // the fields every kind shares the handling of
  const name = sent(c, kind === "task" || kind === "lead" ? "title" : "name", "name", "title");
  const rename = (from: string): string | null => {
    if (name === null) return null;
    if (!name) return "Give it a name.";
    if (name.length > 160) return "That name is too long.";
    if (name !== from) {
      lines.push({ field: kind === "task" || kind === "lead" ? "Title" : "Name", from, to: name });
      values.name = name;
    }
    return null;
  };
  const choose = (field: string, key: string, from: string, options: string[]): string | null => {
    const v = sent(c, key);
    if (v === null) return null;
    const to = v.toLowerCase().replace(/\s+/g, "_");
    if (!options.includes(to)) return `${field} is one of: ${options.join(", ")}.`;
    if (to !== from) {
      lines.push({ field, from, to });
      values[key] = to;
    }
    return null;
  };
  const done = (id: string, title: string): Proposal | string =>
    lines.length ? { action: "edit", target: "other", targetId: id, title, lines, values } : `Say what to change. A ${kind} has: ${EDITABLE[kind]}.`;

  switch (kind) {
    case "client": {
      const rows = await prisma.client.findMany({ select: { id: true, name: true, status: true, niche: true } });
      const hit = pick(rows, ref, "client");
      if (typeof hit === "string") return hit;
      const niche = sent(c, "niche");
      const bad = rename(hit.name) ?? choose("Status", "status", hit.status, CLIENT_STATUS);
      if (bad) return bad;
      if (niche !== null && niche !== (hit.niche ?? "")) {
        lines.push({ field: "Niche", from: hit.niche ?? "not set", to: niche || "not set" });
        values.niche = niche;
      }
      return done(hit.id, hit.name);
    }
    case "project": {
      const rows = (await prisma.project.findMany({ select: { id: true, name: true, type: true, status: true, client: { select: { name: true } } } })).map((p) => ({ id: p.id, name: p.name || p.type, status: p.status, where: p.client.name }));
      const hit = pick(rows, ref, "project", hint);
      if (typeof hit === "string") return hit;
      const bad = rename(hit.name) ?? choose("Status", "status", hit.status, PROJECT_STATUS);
      return bad ?? done(hit.id, `${hit.where} · ${hit.name}`);
    }
    case "department":
    case "role": {
      const rows = kind === "department" ? await prisma.team.findMany({ select: { id: true, name: true } }) : (await prisma.jobTitle.findMany({ select: { id: true, name: true, team: { select: { name: true } } } })).map((r) => ({ id: r.id, name: r.name, where: r.team?.name }));
      const hit = pick(rows as Row[], ref, kind, hint);
      if (typeof hit === "string") return hit;
      return rename(hit.name) ?? done(hit.id, hit.name);
    }
    case "board":
    case "portal": {
      const rows = (await prisma.space.findMany({ where: { kind }, select: { id: true, name: true, parent: { select: { name: true } }, team: { select: { name: true } } } })).map((s) => ({ id: s.id, name: s.name, where: s.parent?.name ?? s.team.name }));
      const hit = pick(rows, ref, kind, hint);
      if (typeof hit === "string") return hit;
      return rename(hit.name) ?? done(hit.id, hit.where ? `${hit.where} · ${hit.name}` : hit.name);
    }
    case "stage":
    case "tag": {
      const rows =
        kind === "stage"
          ? (await prisma.boardStage.findMany({ select: { id: true, name: true, color: true, board: { select: { name: true } } } })).map((s) => ({ id: s.id, name: s.name, color: s.color, where: s.board.name }))
          : (await prisma.fieldOption.findMany({ select: { id: true, name: true, color: true, field: { select: { name: true, board: { select: { name: true } } } } } })).map((o) => ({ id: o.id, name: o.name, color: o.color, where: `${o.field.board.name} · ${o.field.name}` }));
      const hit = pick(rows, ref, kind, hint);
      if (typeof hit === "string") return hit;
      const bad = rename(hit.name);
      if (bad) return bad;
      const color = sent(c, "color", "colour");
      if (color !== null) {
        const to = color.toLowerCase();
        if (!isColor(to)) return `Colours are: ${COLOR_NAMES.join(", ")}.`;
        if (to !== hit.color) {
          lines.push({ field: "Colour", from: hit.color, to });
          values.color = to;
        }
      }
      return done(hit.id, `${hit.where} · ${hit.name}`);
    }
    case "task": {
      const found = await findTask(ref);
      if ("error" in found) return found.error;
      values.table = found.kind;
      return rename(found.t.title) ?? done(found.t.id, found.t.title);
    }
    case "lead": {
      const leads = await prisma.lead.findMany({
        where: { OR: [{ id: ref }, { title: { contains: ref, mode: "insensitive" } }] },
        select: { id: true, title: true, boardId: true, stage: { select: { name: true } }, board: { select: { name: true } }, assignedTo: { select: { name: true } } },
        take: 12,
      });
      const hit = pick(leads.map((l) => ({ ...l, name: l.title, where: l.board.name })), ref, "lead", hint);
      if (typeof hit === "string") return hit;
      const bad = rename(hit.title);
      if (bad) return bad;
      const stage = sent(c, "stage");
      if (stage !== null) {
        const stages = await prisma.boardStage.findMany({ where: { boardId: hit.boardId }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } });
        const to = pick(stages, stage, "stage");
        if (typeof to === "string") return to;
        if (to.name !== hit.stage.name) {
          lines.push({ field: "Stage", from: hit.stage.name, to: to.name });
          values.stage = to.id;
          values.reason = sent(c, "reason") || "Moved from the assistant.";
        }
      }
      const person = sent(c, "person");
      if (person !== null) {
        const p = await findPerson(person);
        if (!("id" in p)) return p.none ? "No one by that name." : `Who? ${p.options.join(", ")}`;
        if (p.name !== hit.assignedTo?.name) {
          lines.push({ field: "Assigned to", from: hit.assignedTo?.name ?? "no one", to: p.name });
          values.person = p.id;
        }
      }
      return done(hit.id, `${hit.where} · ${hit.title}`);
    }
  }
  return "That isn't something I can change.";
}

// what an action answered, as the reason it failed (or null)
const failed = (res: { error?: string }) => res.error ?? null;

export async function applyEdit(p: Proposal): Promise<string | null> {
  // checked again from scratch: by its id now, with the values as confirmed
  const fresh = await prepareEdit(p.targetId, { ...p.values, stage: undefined, ...(p.values.stage ? { stage: await stageName(String(p.values.stage)) } : {}) });
  if (typeof fresh === "string") return fresh;
  const v = fresh.values;
  const id = fresh.targetId;
  const name = typeof v.name === "string" ? v.name : null;

  switch (v.kind) {
    case "client": {
      if (name !== null || "niche" in v) {
        const cur = await prisma.client.findUniqueOrThrow({ where: { id }, select: { name: true, niche: true, contact: true, email: true, whatsapp: true, address: true, notes: true } });
        const res = await updateClientInfo(id, {
          name: name ?? cur.name,
          niche: "niche" in v ? String(v.niche ?? "") : (cur.niche ?? ""),
          contact: cur.contact ?? "",
          email: cur.email ?? "",
          whatsapp: cur.whatsapp ?? "",
          address: cur.address ?? "",
          notes: cur.notes ?? "",
        });
        if (res.error) return res.error;
      }
      return "status" in v ? failed(await updateClientStatus(id, String(v.status))) : null;
    }
    case "project": {
      const cur = await prisma.project.findUniqueOrThrow({ where: { id }, select: { name: true, type: true, status: true, driveLink: true } });
      return failed(await updateProject(id, { name: name ?? (cur.name || cur.type), status: "status" in v ? String(v.status) : cur.status, driveLink: cur.driveLink ?? "" }));
    }
    case "department":
      return failed(await renameDepartment(id, name!));
    case "role":
      return failed(await renameRole(id, name!));
    case "board":
    case "portal":
      return failed(await renameSpace(id, name!));
    case "stage": {
      if (name !== null) {
        const res = await renameStage(id, name);
        if (res.error) return res.error;
      }
      if (v.color) await prisma.boardStage.update({ where: { id }, data: { color: String(v.color) } });
      return null;
    }
    case "tag": {
      if (name !== null) {
        const res = await renameOption(id, name);
        if (res.error) return res.error;
      }
      if (v.color) await prisma.fieldOption.update({ where: { id }, data: { color: String(v.color) } });
      return null;
    }
    case "task":
      if (v.table === "task") await prisma.task.update({ where: { id }, data: { title: name! } });
      else await prisma.workTask.update({ where: { id }, data: { title: name! } });
      return null;
    case "lead": {
      if (name !== null) {
        const res = await renameLead(id, name);
        if (res.error) return res.error;
      }
      if (v.stage) {
        // to the foot of its new stage
        const last = await prisma.lead.aggregate({ where: { stageId: String(v.stage) }, _max: { sortOrder: true } });
        const res = await moveLead(id, String(v.stage), (last._max.sortOrder ?? 0) + 1, String(v.reason ?? "Moved from the assistant."));
        if (res.error) return res.error;
      }
      return v.person ? failed(await assignLead(id, String(v.person))) : null;
    }
  }
  return "That isn't something I can change.";
}

const stageName = async (id: string) => (await prisma.boardStage.findUnique({ where: { id }, select: { name: true } }))?.name ?? id;

// ---------- add ----------

export async function prepareAdd(ref: string, c: Changes): Promise<Proposal | string> {
  const kind = text(c.kind).toLowerCase();
  const name = sent(c, "name", "title") || ref;
  const made = (title: string, lines: Proposal["lines"], values: Proposal["values"]): Proposal => ({ action: "add", target: "other", targetId: "", title, lines, values: { kind, ...values } });
  if (kind !== "notice" && (!name || name.length > 200)) return name ? "That name is too long." : "Say what to call it.";

  switch (kind) {
    case "todo": {
      const due = sent(c, "due");
      if (due && !isDay(due)) return "Give the due date as yyyy-mm-dd.";
      const who = sent(c, "person");
      const p = who ? await findPerson(who) : null;
      if (p && !("id" in p)) return p.none ? "No one by that name." : `Who? ${p.options.join(", ")}`;
      return made("New to-do", [{ field: "Title", from: "", to: name }, { field: "For", from: "", to: p ? p.name : "you" }, ...(due ? [{ field: "Due", from: "", to: due }] : [])], { name, person: p ? p.id : null, due: due || null });
    }
    case "notice": {
      const body = sent(c, "body") || ref;
      if (!body) return "Say what the notice is.";
      return made("New notice on Home", [{ field: "Notice", from: "", to: body.slice(0, 500) }], { body: body.slice(0, 500) });
    }
    case "lead":
    case "stage": {
      const board = pick(await boards(), sent(c, "board") ?? "", "board");
      if (typeof board === "string") return sent(c, "board") ? board : `Say which board. ${board.replace(/^Which board\? /, "Boards: ")}`;
      const color = sent(c, "color", "colour")?.toLowerCase() ?? "";
      if (kind === "stage" && color && !isColor(color)) return `Colours are: ${COLOR_NAMES.join(", ")}.`;
      return made(kind === "lead" ? "New lead" : "New stage", [{ field: "Name", from: "", to: name }, { field: "Board", from: "", to: board.where ? `${board.where} · ${board.name}` : board.name }, ...(kind === "stage" && color ? [{ field: "Colour", from: "", to: color }] : [])], {
        name,
        board: board.id,
        color: color || null,
      });
    }
    case "department":
      return made("New department", [{ field: "Name", from: "", to: name }], { name });
    case "role": {
      const dept = sent(c, "department");
      const team = dept ? pick(await prisma.team.findMany({ select: { id: true, name: true } }), dept, "department") : null;
      if (typeof team === "string") return team;
      return made("New role", [{ field: "Name", from: "", to: name }, ...(team ? [{ field: "Department", from: "", to: team.name }] : [])], { name, department: team?.id ?? null });
    }
    case "client": {
      const niche = sent(c, "niche") ?? "";
      return made("New client", [{ field: "Name", from: "", to: name }, ...(niche ? [{ field: "Niche", from: "", to: niche }] : [])], { name, niche });
    }
  }
  return `I can add: ${ADDABLE}.`;
}

export async function applyAdd(p: Proposal): Promise<string | null> {
  // checked again from scratch, with the values as confirmed
  const fresh = await prepareAdd(String(p.values.name ?? p.values.body ?? ""), p.values);
  if (typeof fresh === "string") return fresh;
  const v = fresh.values;
  const name = String(v.name ?? "");
  switch (v.kind) {
    case "todo":
      return failed(await createWorkTask({ title: name, notes: "", dueDate: v.due ? String(v.due) : "", projectId: "", links: [], attachments: [], assignedToId: v.person ? String(v.person) : undefined }));
    case "notice":
      return failed(await addNotice(String(v.body)));
    case "lead":
      return failed(await createLead(String(v.board), name));
    case "stage":
      return failed(await createStage(String(v.board), name, v.color ? String(v.color) : undefined));
    case "department":
      return failed(await createDepartment(name));
    case "role":
      return failed(await createJobTitle(name, v.department ? String(v.department) : null));
    case "client":
      return failed(await createClient(name, String(v.niche ?? "")));
  }
  return "That isn't something I can add.";
}
