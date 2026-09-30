import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { displayTeam, EMPLOYMENT_TYPE_LABEL } from "@/lib/teams";
import { ACTIVE_STATUSES, LIVE_TASK, LIVE_WORK_TASK, ALL_STATUSES, type TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { hoursLabel, ENTRY_KINDS, periodFrom } from "@/lib/editorKpi";
import { collectedIn, isOverdue, ledger, payroll, upcoming } from "@/lib/finance";
import { clipText } from "@/lib/assistant";
import type { Tool } from "@/lib/ai";
import { loadPerformance } from "../performance/data";
import { feedbackLines, qualityLines, quantityLines } from "../performance/shared";
import { billingCycle, loadFinance, money } from "../finance/data";

// What the admin's assistant can read and propose, and nothing else: the
// dashboard's own tables, never settings, keys, passwords or client links.
//
// Every answer is plain text, one line per item, with a short ref (the first
// 8 characters of an id) rather than the id itself: a list of tasks as
// "title · client · person · stage" is a fraction of the tokens the same
// rows cost as JSON.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (x: Date | null | undefined) => (x ? ((s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`)(indiaDay(x)) : "");
const ref = (id: string) => id.slice(0, 8);
const today = () => indiaDay(new Date());
const MAX_ROWS = 30;
const more = (n: number) => (n > 0 ? `\n(${n} more; narrow the search to see them)` : "");

export const TOOLS: Tool[] = [
  {
    name: "search",
    description: "Find tasks, people, clients, projects, contracts or invoices whose name or title contains the words.",
    input_schema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
  },
  {
    name: "person",
    description: "One employee by name or ref: their record, what they're working on and this month's numbers.",
    input_schema: { type: "object", properties: { who: { type: "string" } }, required: ["who"] },
  },
  {
    name: "tasks",
    description:
      "List tasks (client editing work and everyone's own work). state: open (default), done or overdue. Dates are yyyy-mm-dd: completion dates for done, due dates otherwise.",
    input_schema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["open", "done", "overdue"] },
        person: { type: "string" },
        client: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
      },
    },
  },
  {
    name: "performance",
    description: "Editors' score out of 100 for a month (yyyy-mm, default this one) and its parts: quality (mistakes per video), deadlines (first drafts on time), revisions, output (weighted videos). Leave out person for every editor.",
    input_schema: { type: "object", properties: { person: { type: "string" }, month: { type: "string" } } },
  },
  {
    name: "feedback",
    description: "The mistakes and feedback logged about one editor in a month (yyyy-mm, default this one).",
    input_schema: {
      type: "object",
      properties: { person: { type: "string" }, month: { type: "string" }, kind: { type: "string", enum: Object.keys(ENTRY_KINDS) } },
      required: ["person"],
    },
  },
  {
    name: "client",
    description: "One client by name or ref: contact, billing, projects, open work and invoices.",
    input_schema: { type: "object", properties: { who: { type: "string" } }, required: ["who"] },
  },
  {
    name: "overview",
    description: "A summary: workload (open and overdue work per person), finance (money in and out, the team's pay), contracts, or clients.",
    input_schema: { type: "object", properties: { topic: { type: "string", enum: ["workload", "finance", "contracts", "clients"] } }, required: ["topic"] },
  },
  {
    name: "propose",
    description:
      "Propose a change. Nothing changes until the admin confirms it in the panel, so say what you proposed. action and changes: task_status {status}; task_due {due: yyyy-mm-dd}; task_assign {person}; employee {phone, email, position, department, salary, status: active|on_leave|former, joined, type: full_time|part_time|freelance|intern, notes}; feedback {kind: mistake|positive|negative, category (a mistake's category, or what praise or negative feedback is about), body, day, points (for positive or negative)}; invoice_status {status: draft|ready|sent|paid|overdue}. ref: the task's title or ref, the person's name, or the invoice number; no need to search first.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["task_status", "task_due", "task_assign", "employee", "feedback", "invoice_status"] },
        ref: { type: "string" },
        changes: { type: "object" },
      },
      required: ["action", "ref", "changes"],
    },
  },
];

// ---------- lookups ----------

async function staff() {
  return prisma.user.findMany({ where: { employment: { not: "former" } }, include: { team: true, jobTitle: true }, orderBy: { name: "asc" } });
}

export async function findPerson(who: string) {
  const q = who.trim().toLowerCase();
  const all = await staff();
  const hit = all.filter((u) => u.id.startsWith(q) || u.name.toLowerCase() === q);
  const loose = hit.length ? hit : all.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().startsWith(q));
  return loose.length === 1 ? loose[0] : { none: loose.length === 0, options: loose.map((u) => u.name) };
}

async function findClient(who: string) {
  const q = who.trim().toLowerCase();
  const all = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const hit = all.filter((c) => c.id.startsWith(q) || c.name.toLowerCase() === q || c.slug === q);
  const loose = hit.length ? hit : all.filter((c) => c.name.toLowerCase().includes(q));
  return loose.length === 1 ? loose[0] : { none: loose.length === 0, options: loose.map((c) => c.name) };
}

const notFound = (what: string, r: { none: boolean; options: string[] }) =>
  r.none ? `No ${what} matches that.` : `Which ${what}? ${r.options.slice(0, 10).join(", ")}`;

const taskLine = (t: { id: string; title: string; status: TaskStatus; dueDate: Date | null; assignedTo: { name: string } | null; project: { name: string; type: string; client: { name: string } } }) =>
  `${ref(t.id)} · ${t.title} · ${t.project.client.name} · ${t.assignedTo?.name ?? "unassigned"} · ${STAGE[t.status].label}${t.dueDate ? ` · due ${d(t.dueDate)}` : ""}`;
const workLine = (t: { id: string; title: string; status: keyof typeof WORK_TASK_STAGE; dueDate: Date | null; completedAt?: Date | null; assignedTo: { name: string }; project: { client: { name: string } } | null }) =>
  `${ref(t.id)} · ${t.title} · ${t.project?.client.name ?? "own work"} · ${t.assignedTo.name} · ${WORK_TASK_STAGE[t.status].label}${t.dueDate ? ` · due ${d(t.dueDate)}` : ""}`;

const TASK_INCLUDE = { assignedTo: { select: { name: true } }, project: { select: { name: true, type: true, client: { select: { name: true } } } } } as const;

// ---------- the read tools ----------

async function search({ q }: { q: string }) {
  const words = q.trim();
  if (!words) return "Give some words to look for.";
  const has = { contains: words, mode: "insensitive" as const };
  const [tasks, work, people, clients, projects, contracts, invoices] = await Promise.all([
    prisma.task.findMany({ where: { title: has }, include: TASK_INCLUDE, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.workTask.findMany({ where: { title: has }, include: { assignedTo: { select: { name: true } }, project: { select: { client: { select: { name: true } } } } }, orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.user.findMany({ where: { name: has, employment: { not: "former" } }, include: { jobTitle: true }, take: 5 }),
    prisma.client.findMany({ where: { name: has }, take: 5 }),
    prisma.project.findMany({ where: { OR: [{ name: has }, { type: has }] }, include: { client: true }, take: 6 }),
    prisma.contract.findMany({ where: { name: has }, select: { id: true, name: true, status: true }, take: 5 }),
    prisma.invoice.findMany({ where: { number: has }, include: { client: true }, take: 5 }),
  ]);
  const out = [
    ...tasks.map((t) => `task ${taskLine(t)}`),
    ...work.map((t) => `own task ${workLine(t)}`),
    ...people.map((p) => `person ${ref(p.id)} · ${p.name} · ${p.jobTitle?.name ?? ""}`),
    ...clients.map((c) => `client ${ref(c.id)} · ${c.name} · ${c.status}`),
    ...projects.map((p) => `project ${ref(p.id)} · ${p.name || p.type} · ${p.client.name} · ${p.status}`),
    ...contracts.map((c) => `contract ${ref(c.id)} · ${c.name ?? "Untitled"} · ${c.status}`),
    ...invoices.map((i) => `invoice ${ref(i.id)} · ${i.number} · ${i.client.name} · ${money(Number(i.amount), i.currency)} · ${i.status}`),
  ];
  return out.length ? out.join("\n") : "Nothing matches.";
}

async function editorLine(id: string, name: string, month: string) {
  const period = periodFrom({ view: "month", month }, today());
  const data = await loadPerformance({ from: period.from, editorId: id });
  if (!data.editors.length) return null;
  const k = data.score(period.from, period.to, id);
  const cats = k.byCategory.map((c) => `${c.category} ${c.count}${c.repeats ? ` (${c.repeats} repeated)` : ""}`).join(", ");
  return [
    `${name}, ${month}${period.current ? " so far" : ""}: ${k.total ?? "–"} of ${k.max || 15} (Quantity ${k.quantity ?? "–"}/5, Quality ${k.quality ?? "–"}/5, Feedback ${k.feedback ?? "not scored, none given"}/5)`,
    `Quantity: ${quantityLines(k).join("; ")} (target ${data.scoring.reelsPerDay} reels a working day; each video timed from Editing to Sent for approval)`,
    `Quality: ${qualityLines(k).join("; ")}${cats ? ` · by category: ${cats}` : ""} (5, less ${data.scoring.mistakePoints} a mistake per video; a repeat, the same category on another video within 90 days, counts ${data.scoring.repeatWeight}×)`,
    `Feedback: ${feedbackLines(k).join("; ")} (starts at ${data.scoring.feedbackStart})`,
    k.editHours !== null ? `Typical time from Editing to Sent for approval: ${hoursLabel(k.editHours)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function person({ who }: { who: string }) {
  const p = await findPerson(who);
  if (!("id" in p)) return notFound("person", p);
  const [open, work, done30] = await Promise.all([
    prisma.task.findMany({ where: { assignedToId: p.id, ...LIVE_TASK }, include: TASK_INCLUDE, orderBy: { dueDate: "asc" } }),
    prisma.workTask.findMany({ where: { assignedToId: p.id, ...LIVE_WORK_TASK }, include: { assignedTo: { select: { name: true } }, project: { select: { client: { select: { name: true } } } } } }),
    prisma.task.count({ where: { assignedToId: p.id, status: "delivered_and_uploaded", updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  const record = [
    `${ref(p.id)} · ${p.name} · ${p.jobTitle?.name ?? "no position"} · ${displayTeam(p)?.name ?? "no department"} · access ${p.role} · ${p.employment}`,
    [
      p.email,
      p.phone,
      p.joinedAt && `joined ${indiaDay(p.joinedAt)} (${Math.floor((Date.now() - p.joinedAt.getTime()) / (30.44 * 86_400_000))} months ago)`,
      p.employmentType && EMPLOYMENT_TYPE_LABEL[p.employmentType],
      p.salary && `salary ₹${Number(p.salary).toLocaleString("en-IN")}/month`,
    ]
      .filter(Boolean)
      .join(" · "),
    p.notes ? `notes: ${clipText(p.notes, 200)}` : "",
  ];
  const now = [...open.map(taskLine), ...work.map(workLine)];
  const kpi = await editorLine(p.id, p.name, today().slice(0, 7));
  return [
    ...record.filter(Boolean),
    `Open now (${now.length}): ${now.length ? `\n${now.slice(0, 12).join("\n")}` : "nothing"}${more(now.length - 12)}`,
    `Client videos delivered in the last 30 days: ${done30}`,
    kpi ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function tasks(input: { state?: string; person?: string; client?: string; from?: string; to?: string }) {
  const state = input.state ?? "open";
  let assignedToId: string | undefined;
  let clientId: string | undefined;
  if (input.person) {
    const p = await findPerson(input.person);
    if (!("id" in p)) return notFound("person", p);
    assignedToId = p.id;
  }
  if (input.client) {
    const c = await findClient(input.client);
    if (!("id" in c)) return notFound("client", c);
    clientId = c.id;
  }
  const day = (s: string | undefined, end = false) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? "23:59:59" : "00:00:00"}+05:30`) : undefined);
  const range = input.from || input.to ? { ...(day(input.from) ? { gte: day(input.from) } : {}), ...(day(input.to, true) ? { lte: day(input.to, true) } : {}) } : undefined;
  const who = assignedToId ? { assignedToId } : {};
  const inClient = clientId ? { project: { clientId } } : {};

  if (state === "done") {
    const [t, w] = await Promise.all([
      prisma.task.findMany({ where: { ...who, ...inClient, status: "delivered_and_uploaded", ...(range ? { updatedAt: range } : {}) }, include: TASK_INCLUDE, orderBy: { updatedAt: "desc" }, take: 60 }),
      clientId
        ? Promise.resolve([])
        : prisma.workTask.findMany({ where: { ...who, status: "done", ...(range ? { completedAt: range } : {}) }, include: { assignedTo: { select: { name: true } }, project: { select: { client: { select: { name: true } } } } }, orderBy: { completedAt: "desc" }, take: 60 }),
    ]);
    const rows = [
      ...t.map((x) => ({ at: x.updatedAt, line: `${ref(x.id)} · ${x.title} · ${x.project.client.name} · ${x.assignedTo?.name ?? "unassigned"} · delivered ${d(x.updatedAt)}` })),
      ...w.map((x) => ({ at: x.completedAt ?? x.updatedAt, line: `${ref(x.id)} · ${x.title} · ${x.project?.client.name ?? "own work"} · ${x.assignedTo.name} · done ${d(x.completedAt ?? x.updatedAt)}` })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    return rows.length ? `${rows.length} finished:\n${rows.slice(0, MAX_ROWS).map((r) => r.line).join("\n")}${more(rows.length - MAX_ROWS)}` : "Nothing finished matches.";
  }

  const overdue = state === "overdue" ? { dueDate: { lt: new Date(`${today()}T00:00:00+05:30`) } } : range ? { dueDate: range } : {};
  const [t, w] = await Promise.all([
    // LIVE_TASK's own project filter (current clients) takes the client too
    prisma.task.findMany({
      where: { ...who, ...LIVE_TASK, ...(clientId ? { project: { clientId, client: { status: "current" } } } : {}), ...overdue },
      include: TASK_INCLUDE,
      orderBy: { dueDate: "asc" },
    }),
    prisma.workTask.findMany({
      where: { ...who, ...LIVE_WORK_TASK, ...(clientId ? { projectId: { not: null }, project: { clientId } } : {}), ...overdue },
      include: { assignedTo: { select: { name: true } }, project: { select: { client: { select: { name: true } } } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);
  const rows = [...t.map(taskLine), ...w.map(workLine)];
  return rows.length ? `${rows.length} ${state}:\n${rows.slice(0, MAX_ROWS).join("\n")}${more(rows.length - MAX_ROWS)}` : `Nothing ${state} matches.`;
}

async function performance({ person: who, month }: { person?: string; month?: string }) {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
  if (who) {
    const p = await findPerson(who);
    if (!("id" in p)) return notFound("person", p);
    return (await editorLine(p.id, p.name, m)) ?? `${p.name} isn't an editor, so has no editor numbers.`;
  }
  const period = periodFrom({ view: "month", month: m }, today());
  const data = await loadPerformance({ from: period.from });
  const team = data.score(period.from, period.to);
  const lines = await Promise.all(data.editors.map((e) => editorLine(e.id, e.name, m)));
  return [
    `Team, ${m}: completed ${team.completed} (${team.units} reels' worth) · ${team.mistakes} mistakes (${team.repeated} repeated) · ${team.within} of ${team.timed} timed videos within time`,
    ...lines.filter(Boolean),
  ].join("\n");
}

async function feedback({ person: who, month, kind }: { person: string; month?: string; kind?: string }) {
  const p = await findPerson(who);
  if (!("id" in p)) return notFound("person", p);
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : today().slice(0, 7);
  const start = new Date(`${m}-01T00:00:00+05:30`);
  const end = new Date(new Date(start).setMonth(start.getMonth() + 1));
  const rows = await prisma.performanceEntry.findMany({
    where: { editorId: p.id, at: { gte: start, lt: end }, ...(kind ? { kind } : {}) },
    include: { task: { select: { title: true } } },
    orderBy: { at: "asc" },
  });
  if (!rows.length) return `Nothing logged about ${p.name} in ${m}.`;
  const lines = rows.map(
    (e) =>
      `${d(e.at)} · ${e.kind}${e.category ? `/${e.category}` : ""}${e.count > 1 ? ` ×${e.count}` : ""} · ${clipText(e.body.replace(/\s+/g, " "), 140)}${e.task ? ` · ${e.task.title}` : ""}${e.by ? ` · ${e.by}${e.fromClient ? " (client)" : ""}` : ""}${e.source === "manual" ? "" : ` · ${e.source}${e.reviewed ? "" : ", unreviewed"}`}`
  );
  return `${rows.length} entries for ${p.name}, ${m}:\n${lines.slice(0, 40).join("\n")}${more(lines.length - 40)}`;
}

async function client({ who }: { who: string }) {
  const c = await findClient(who);
  if (!("id" in c)) return notFound("client", c);
  const [projects, open, delivered, invoices] = await Promise.all([
    prisma.project.findMany({ where: { clientId: c.id, status: "in_progress" }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.task.count({ where: { project: { clientId: c.id }, status: { in: ACTIVE_STATUSES } } }),
    prisma.task.count({ where: { project: { clientId: c.id }, status: "delivered_and_uploaded", updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.invoice.findMany({ where: { clientId: c.id }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const l = ledger(
    invoices.map((i) => ({ amount: Number(i.amount), status: i.status, dueDate: i.dueDate ? indiaDay(i.dueDate) : null, paidAt: i.paidAt ? indiaDay(i.paidAt) : null })),
    today()
  );
  return [
    `${ref(c.id)} · ${c.name} · ${c.status}${c.niche ? ` · ${c.niche}` : ""}`,
    [c.contact && `contact ${c.contact}`, c.email, c.whatsapp].filter(Boolean).join(" · "),
    `billing: ${billingCycle(c) ?? "not set"} · outstanding ${money(l.outstanding)}${l.overdue ? ` (${l.overdue} overdue)` : ""}`,
    `open tasks ${open} · delivered in the last 30 days ${delivered}`,
    projects.length ? `projects: ${projects.map((p) => `${p.name || p.type} (${p.status})`).join("; ")}` : "no active projects",
    invoices.length ? `invoices: ${invoices.map((i) => `${i.number ?? d(i.createdAt)} ${money(Number(i.amount), i.currency)} ${i.status}`).join("; ")}` : "",
    c.notes ? `notes: ${clipText(c.notes.replace(/\s+/g, " "), 240)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function overview({ topic }: { topic: string }) {
  const now = today();
  if (topic === "workload") {
    const [people, open, work] = await Promise.all([
      staff(),
      prisma.task.findMany({ where: LIVE_TASK, select: { assignedToId: true, dueDate: true } }),
      prisma.workTask.findMany({ where: LIVE_WORK_TASK, select: { assignedToId: true, dueDate: true } }),
    ]);
    const late = (x: { dueDate: Date | null }) => !!x.dueDate && indiaDay(x.dueDate) < now;
    const rows = people
      .map((p) => {
        const mine = [...open.filter((t) => t.assignedToId === p.id), ...work.filter((t) => t.assignedToId === p.id)];
        return { p, n: mine.length, late: mine.filter(late).length };
      })
      .filter((r) => r.n)
      .sort((a, b) => b.n - a.n);
    const unassigned = open.filter((t) => !t.assignedToId).length;
    return `Open work by person (overdue in brackets):\n${rows.map((r) => `${r.p.name}: ${r.n}${r.late ? ` (${r.late} overdue)` : ""}`).join("\n") || "no one has open work"}${unassigned ? `\nUnassigned client tasks: ${unassigned}` : ""}`;
  }
  if (topic === "finance") {
    const f = await loadFinance();
    const inr = f.invoices.filter((i) => i.currency === "INR");
    const l = ledger(inr, f.today);
    const soon = upcoming(inr, f.today);
    const paid = f.team.filter((t) => t.salary !== null || t.now.paid > 0);
    const pay = payroll(paid.map((t) => t.now));
    const unpaid = f.invoices.filter((i) => ["ready", "sent", "overdue"].includes(i.status));
    return [
      `Clients (paid through Skydo, not connected yet): collected this month ${money(collectedIn(inr, f.month))} · outstanding ${money(l.outstanding)} (${l.unpaid} unpaid, ${l.overdue} overdue) · due in the next 30 days ${money(soon.amount)}`,
      unpaid.length ? `Unpaid invoices:\n${unpaid.map((i) => `${ref(i.id)} · ${i.client.name} · ${money(i.amount, i.currency)} · ${i.status}${i.dueDate ? ` · due ${i.dueDate}` : ""}${isOverdue(i, f.today) ? " · OVERDUE" : ""}`).join("\n")}` : "No unpaid invoices.",
      `Team pay ${f.month} (from the payroll sheet${f.sheet ? "" : ", not linked yet"}): due ${money(pay.obligations)} · recorded paid ${money(pay.paid)} · pending ${money(pay.pending)}`,
      paid.map((t) => `${t.p.name}: salary ${t.salary === null ? "not set" : money(t.salary)}, paid ${money(t.now.paid)}`).join("\n"),
    ].join("\n");
  }
  if (topic === "contracts") {
    const rows = await prisma.contract.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, name: true, status: true, details: true, updatedAt: true }, take: 40 });
    if (!rows.length) return "No contracts yet.";
    return rows
      .map((c) => {
        const x = (c.details ?? {}) as { entity?: string; termMonths?: number | null; monthlyFee?: number | null; currency?: string; country?: string };
        return `${ref(c.id)} · ${x.entity || c.name || "Untitled"} · ${c.status}${x.monthlyFee ? ` · ${x.currency ?? ""} ${x.monthlyFee}/month` : ""}${x.termMonths ? ` · ${x.termMonths} months` : ""}${x.country ? ` · ${x.country}` : ""} · updated ${d(c.updatedAt)}`;
      })
      .join("\n");
  }
  if (topic === "clients") {
    const rows = await prisma.client.findMany({
      where: { status: { not: "previous" } },
      include: { _count: { select: { projects: { where: { status: "in_progress" } } } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const open = await prisma.task.groupBy({ by: ["projectId"], where: LIVE_TASK, _count: true });
    const projectClient = new Map((await prisma.project.findMany({ where: { id: { in: open.map((o) => o.projectId) } }, select: { id: true, clientId: true } })).map((p) => [p.id, p.clientId]));
    const openBy = new Map<string, number>();
    for (const o of open) openBy.set(projectClient.get(o.projectId)!, (openBy.get(projectClient.get(o.projectId)!) ?? 0) + o._count);
    return rows.map((c) => `${ref(c.id)} · ${c.name} · ${c.status} · ${c._count.projects} active projects · ${openBy.get(c.id) ?? 0} open tasks · billing ${billingCycle(c) ?? "not set"}`).join("\n");
  }
  return "Topics: workload, finance, contracts, clients.";
}

const READERS: Record<string, (input: never) => Promise<string>> = {
  search: search as never,
  person: person as never,
  tasks: tasks as never,
  performance: performance as never,
  feedback: feedback as never,
  client: client as never,
  overview: overview as never,
};

// one tool call, its answer clipped so a big list can't run up the bill
export async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  const reader = READERS[name];
  if (!reader) return `No tool called ${name}.`;
  try {
    return clipText(await reader(input as never), 3500);
  } catch (err) {
    return `That didn't work: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

export { person as personSummary, client as clientSummary, overview as overviewOf, performance as performanceOf, feedback as feedbackOf };
export const VALID = { taskStatuses: ALL_STATUSES, kinds: Object.keys(ENTRY_KINDS) };
