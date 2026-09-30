import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { ALL_STATUSES, type TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/teams";
import { ENTRY_KINDS } from "@/lib/editorKpi";
import type { WorkTaskStatus } from "@prisma/client";
import { moveTask } from "../actions";
import { moveWorkTask } from "../my-tasks/actions";
import { updateInvoiceStatus } from "../clients/actions";
import { findPerson } from "./tools";

// A change the assistant wants to make, checked against the database and
// described as before → after, so the admin confirms exactly what will
// happen. Nothing here trusts Claude's own description of the change: the
// target is looked up again and every value validated, both when it's
// proposed and when it's confirmed.

export type Proposal = {
  action: "task_status" | "task_due" | "task_assign" | "employee" | "feedback" | "invoice_status";
  targetId: string;
  target: "task" | "work" | "person" | "invoice";
  title: string;
  lines: { field: string; from: string; to: string }[];
  // the cleaned values apply() writes
  values: Record<string, string | number | null>;
};

const INVOICE_STATUSES = ["draft", "ready", "sent", "paid", "overdue"];
const EMPLOYMENT = ["active", "on_leave", "former"];
const isDay = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

async function findTask(q: string) {
  const s = q.trim();
  const [tasks, work] = await Promise.all([
    prisma.task.findMany({ where: { OR: [{ id: { startsWith: s } }, { title: { contains: s, mode: "insensitive" } }] }, include: { assignedTo: true }, take: 5 }),
    prisma.workTask.findMany({ where: { OR: [{ id: { startsWith: s } }, { title: { contains: s, mode: "insensitive" } }] }, include: { assignedTo: true }, take: 5 }),
  ]);
  const all = [...tasks.map((t) => ({ kind: "task" as const, t })), ...work.map((t) => ({ kind: "work" as const, t }))];
  if (all.length === 1) return all[0];
  const exact = all.filter((x) => x.t.id.startsWith(s));
  return exact.length === 1 ? exact[0] : { error: all.length ? `Which task? ${all.map((x) => x.t.title).join("; ")}` : "No task matches that." };
}

// a status by its key or by the label people see ("Editing", "Up next")
function statusFor(kind: "task" | "work", v: string): string | null {
  const s = v.trim().toLowerCase().replace(/\s+/g, "_");
  const table: Record<string, { label: string }> = kind === "task" ? STAGE : WORK_TASK_STAGE;
  const keys = kind === "task" ? (ALL_STATUSES as string[]) : Object.keys(WORK_TASK_STAGE);
  return keys.find((k) => k === s || table[k].label.toLowerCase().replace(/\s+/g, "_") === s) ?? null;
}

// From the tool's input to a checked proposal, or a reason it can't be done.
export async function prepare(input: { action?: string; ref?: string; changes?: Record<string, unknown> }): Promise<Proposal | string> {
  const c = input.changes ?? {};
  const ref = str(input.ref);
  if (!ref) return "Say which item: its ref or name.";

  switch (input.action) {
    case "task_status":
    case "task_due":
    case "task_assign": {
      const found = await findTask(ref);
      if ("error" in found) return found.error;
      const { kind, t } = found;
      const label = (st: string) => (kind === "task" ? STAGE[st as TaskStatus].label : WORK_TASK_STAGE[st as WorkTaskStatus].label);
      if (input.action === "task_status") {
        const to = statusFor(kind, str(c.status));
        if (!to) return `That isn't a stage. Stages: ${(kind === "task" ? ALL_STATUSES : Object.keys(WORK_TASK_STAGE)).map((k) => label(k)).join(", ")}`;
        return { action: "task_status", target: kind, targetId: t.id, title: t.title, lines: [{ field: "Stage", from: label(t.status), to: label(to) }], values: { status: to } };
      }
      if (input.action === "task_due") {
        if (!isDay(c.due)) return "Give the due date as yyyy-mm-dd.";
        return { action: "task_due", target: kind, targetId: t.id, title: t.title, lines: [{ field: "Due", from: t.dueDate ? indiaDay(t.dueDate) : "none", to: str(c.due) }], values: { due: str(c.due) } };
      }
      const p = await findPerson(str(c.person));
      if (!("id" in p)) return p.none ? "No one by that name." : `Who? ${p.options.join(", ")}`;
      return { action: "task_assign", target: kind, targetId: t.id, title: t.title, lines: [{ field: "Assigned to", from: t.assignedTo?.name ?? "no one", to: p.name }], values: { person: p.id } };
    }

    case "employee": {
      const p = await findPerson(ref);
      if (!("id" in p)) return p.none ? "No one by that name." : `Who? ${p.options.join(", ")}`;
      const lines: Proposal["lines"] = [];
      const values: Proposal["values"] = {};
      const set = (field: string, key: string, from: string, to: string | number | null) => {
        lines.push({ field, from: from || "not set", to: to === null || to === "" ? "not set" : String(to) });
        values[key] = to;
      };
      for (const [k, raw] of Object.entries(c)) {
        const v = str(raw);
        if (k === "phone") set("Phone", "phone", p.phone ?? "", v || null);
        else if (k === "email") {
          if (!/^\S+@\S+\.\S+$/.test(v)) return "That isn't an email address.";
          const clash = await prisma.user.findFirst({ where: { email: v.toLowerCase(), id: { not: p.id } } });
          if (clash) return `${clash.name} already uses that email.`;
          set("Email", "email", p.email, v.toLowerCase());
        } else if (k === "position") {
          const jt = await prisma.jobTitle.findFirst({ where: { name: { equals: v, mode: "insensitive" } } });
          set("Position", "position", p.jobTitle?.name ?? "", jt?.name ?? v);
        } else if (k === "department") {
          const team = await prisma.team.findFirst({ where: { name: { equals: v, mode: "insensitive" } } });
          if (!team) return `There's no department called ${v}. Departments: ${(await prisma.team.findMany()).map((t) => t.name).join(", ")}`;
          set("Department", "department", p.team?.name ?? "", team.name);
        } else if (k === "salary") {
          const n = Number(v.replace(/[^0-9.]/g, ""));
          if (!v || !Number.isFinite(n)) return "That salary isn't a number.";
          set("Salary", "salary", p.salary ? String(Number(p.salary)) : "", n);
        } else if (k === "status") {
          if (!EMPLOYMENT.includes(v)) return "Status is active, on_leave or former.";
          set("Status", "status", p.employment, v);
        } else if (k === "joined") {
          if (!isDay(v)) return "Give the joining date as yyyy-mm-dd.";
          set("Joined", "joined", p.joinedAt ? indiaDay(p.joinedAt) : "", v);
        } else if (k === "type") {
          if (!(v in EMPLOYMENT_TYPE_LABEL)) return `Type is one of ${Object.keys(EMPLOYMENT_TYPE_LABEL).join(", ")}.`;
          set("Employment type", "type", p.employmentType ?? "", v);
        } else if (k === "notes") set("Notes", "notes", p.notes ?? "", v || null);
        else return `${k} can't be changed from here. Open their profile for that.`;
      }
      if (!lines.length) return "Say what to change.";
      return { action: "employee", target: "person", targetId: p.id, title: p.name, lines, values };
    }

    case "feedback": {
      const p = await findPerson(ref);
      if (!("id" in p)) return p.none ? "No one by that name." : `Who? ${p.options.join(", ")}`;
      const kind = str(c.kind) || "mistake";
      if (!["mistake", "positive", "negative", "guidance"].includes(kind)) return "Kind is mistake, positive, negative or guidance.";
      const body = str(c.body);
      if (!body) return "Say what the feedback is.";
      const day = isDay(c.day) ? str(c.day) : indiaDay(new Date());
      const mistake = kind === "mistake";
      const scored = kind === "positive" || kind === "negative";
      const types = mistake ? await prisma.feedbackCategory.findMany({ select: { name: true } }) : [];
      const category = mistake ? (types.find((m) => m.name.toLowerCase() === str(c.category).toLowerCase())?.name ?? "Others") : null;
      const asked = Number(c.points);
      // praise and concerns always carry the points given; nothing is assumed
      if (scored && !(Number.isFinite(asked) && asked > 0 && asked <= 10)) return `Say how many points it ${kind === "positive" ? "adds" : "takes off"}.`;
      const points = scored ? asked : null;
      return {
        action: "feedback",
        target: "person",
        targetId: p.id,
        title: `Feedback for ${p.name}`,
        lines: [
          { field: "Kind", from: "", to: mistake ? `A mistake · ${category}` : `${ENTRY_KINDS[kind as keyof typeof ENTRY_KINDS]}${category ? ` · ${category}` : ""}${scored ? ` · ${kind === "positive" ? "+" : "−"}${points}` : ""}` },
          { field: "Day", from: "", to: day },
          { field: "What", from: "", to: body },
        ],
        values: { kind, category, body, day, points },
      };
    }

    case "invoice_status": {
      const inv = await prisma.invoice.findFirst({ where: { OR: [{ id: { startsWith: ref } }, { number: ref }] }, include: { client: true } });
      if (!inv) return "No invoice matches that.";
      const to = str(c.status);
      if (!INVOICE_STATUSES.includes(to)) return `Status is one of ${INVOICE_STATUSES.join(", ")}.`;
      return { action: "invoice_status", target: "invoice", targetId: inv.id, title: `${inv.client.name} · ${inv.number ?? "invoice"}`, lines: [{ field: "Status", from: inv.status, to }], values: { status: to } };
    }
  }
  return "That isn't something I can change.";
}

// The admin pressed Confirm: checked again from scratch, then done the same
// way the app's own screens do it.
export async function apply(p: Proposal, actorId: string): Promise<string | null> {
  const fresh = await prepare({
    action: p.action,
    ref: p.targetId,
    changes:
      p.action === "task_status"
        ? { status: p.values.status }
        : p.action === "task_due"
          ? { due: p.values.due }
          : p.action === "task_assign"
            ? { person: p.values.person }
            : p.action === "employee"
              ? Object.fromEntries(Object.entries(p.values).map(([k, v]) => [k, v ?? ""]))
              : p.action === "feedback"
                ? { kind: p.values.kind, category: p.values.category, body: p.values.body, day: p.values.day, points: p.values.points }
                : { status: p.values.status },
  });
  if (typeof fresh === "string") return fresh;
  const v = fresh.values;

  if (p.action === "task_status") {
    if (fresh.target === "task") {
      const res = await moveTask(fresh.targetId, v.status as TaskStatus);
      if (res.error) return res.error;
    } else {
      const t = await prisma.workTask.findUniqueOrThrow({ where: { id: fresh.targetId }, select: { sortOrder: true } });
      const res = await moveWorkTask(fresh.targetId, v.status as WorkTaskStatus, t.sortOrder);
      if (res.error) return res.error;
    }
  } else if (p.action === "task_due") {
    const due = new Date(`${v.due}T00:00:00Z`);
    if (fresh.target === "task") await prisma.task.update({ where: { id: fresh.targetId }, data: { dueDate: due } });
    else await prisma.workTask.update({ where: { id: fresh.targetId }, data: { dueDate: due } });
  } else if (p.action === "task_assign") {
    if (fresh.target === "task") await prisma.task.update({ where: { id: fresh.targetId }, data: { assignedToId: String(v.person) } });
    else await prisma.workTask.update({ where: { id: fresh.targetId }, data: { assignedToId: String(v.person) } });
  } else if (p.action === "employee") {
    const data: Record<string, unknown> = {};
    if ("phone" in v) data.phone = v.phone;
    if ("email" in v) data.email = v.email;
    if ("salary" in v) data.salary = v.salary;
    if ("status" in v) data.employment = v.status;
    if ("joined" in v) data.joinedAt = new Date(`${v.joined}T00:00:00Z`);
    if ("type" in v) data.employmentType = v.type;
    if ("notes" in v) data.notes = v.notes;
    if ("department" in v) data.team = { connect: { name: String(v.department) } };
    if ("position" in v) {
      const name = String(v.position);
      const jt = (await prisma.jobTitle.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) ?? (await prisma.jobTitle.create({ data: { name } }));
      data.jobTitle = { connect: { id: jt.id } };
    }
    await prisma.user.update({ where: { id: fresh.targetId }, data });
  } else if (p.action === "feedback") {
    await prisma.performanceEntry.create({
      data: {
        editorId: fresh.targetId,
        kind: String(v.kind),
        category: v.category ? String(v.category) : null,
        points: typeof v.points === "number" ? v.points : null,
        body: String(v.body),
        at: new Date(`${v.day}T12:00:00+05:30`),
        source: "manual",
        reviewed: true,
        loggedById: actorId,
        by: (await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ?? null,
      },
    });
  } else if (p.action === "invoice_status") {
    const res = await updateInvoiceStatus(fresh.targetId, v.status as "draft");
    if (res.error) return res.error;
  }
  revalidatePath("/", "layout");
  return null;
}
