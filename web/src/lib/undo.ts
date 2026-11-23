import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getRealUserId } from "./auth";
import type { TaskRef } from "./taskTrack";
import { stageChangeAction, stageLabel } from "./stages";
import { WORK_TASK_STAGE } from "./workTaskStages";
import type { TaskStatus } from "./workflow";
import { changedAny, keyOf, plan, type Kept, type Plan, type Row } from "./undoPlan";

// Undo and redo on anything (Abhishek, 21 Nov 2026: "so that we can have
// anything restored, at least one time"; tasks first, then everything):
// each person's last change, one step back and one forward. A change runs
// inside withUndo, which keeps the rows it touched, before and after: the
// row itself and what hangs off it, found from the database's own links
// (lib/undoPlan says what putting them back means). One step per person,
// under AppSetting "undo:<userId>" (what it was, for the bar) and
// "undo-rows:<userId>" (the rows), so nothing piles up.

export type Ref = { table: string; id: string } | TaskRef;
export type UndoStep = { label: string; undone: boolean; at: string };
type Item = { ref: { table: string; id: string }; before: Kept[]; after: Kept[] };

const q = (name: string) => `"${name.replace(/"/g, "")}"`;
const norm = (r: Ref) => ("table" in r ? r : { table: r.kind === "task" ? "Task" : "WorkTask", id: r.id });
const metaKey = (userId: string) => `undo:${userId}`;
const rowsKey = (userId: string) => `undo-rows:${userId}`;
export const UNDO_COOKIE = "undo-step";
// never kept in a step
const SECRET = /password|secret|token/i;
// a change bigger than this isn't kept (it still happens)
const MAX_ROWS = 4000;

// ---------- what hangs off what ----------

type Rel = { t: string; col: string; kept: boolean };
// links the database doesn't have
const EXTRA: Record<string, Rel[]> = {
  Task: [{ t: "Notice", col: "taskId", kept: false }],
  WorkTask: [{ t: "Notice", col: "workTaskId", kept: false }],
};
let graph: Promise<Map<string, Rel[]>> | null = null;
// table -> the tables that point at it: going with it (cascade, or blocked
// until they're gone) or staying and only pointing (set null)
function links(): Promise<Map<string, Rel[]>> {
  graph ??= prisma
    .$queryRawUnsafe<{ parent: string; child: string; col: string; del: string }[]>(
      `select trim(both '"' from c.confrelid::regclass::text) as parent, trim(both '"' from c.conrelid::regclass::text) as child, a.attname as col, c.confdeltype::text as del
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.connamespace = 'public'::regnamespace`,
    )
    .then((rows) => {
      const m = new Map<string, Rel[]>();
      for (const r of rows) {
        if (r.child === "ActivityLog") continue; // history stays as it is
        const list = m.get(r.parent) ?? [];
        list.push({ t: r.child, col: r.col, kept: r.del === "n" });
        m.set(r.parent, list);
      }
      for (const [t, rels] of Object.entries(EXTRA)) m.set(t, [...(m.get(t) ?? []), ...rels]);
      return m;
    })
    .catch((e) => {
      graph = null;
      throw e;
    });
  return graph;
}

// tables in the order rows can be put in: a table before the ones pointing at it
let ranks: Map<string, number> | null = null;
function rankOf(g: Map<string, Rel[]>): Map<string, number> {
  if (ranks) return ranks;
  const tables = new Set<string>([...g.keys(), ...[...g.values()].flat().map((r) => r.t)]);
  const parents = new Map<string, Set<string>>([...tables].map((t) => [t, new Set<string>()]));
  for (const [p, rels] of g) for (const r of rels) if (r.t !== p) parents.get(r.t)!.add(p);
  const order = new Map<string, number>();
  let left = [...tables];
  while (left.length) {
    const ready = left.filter((t) => [...parents.get(t)!].every((p) => order.has(p)));
    // a loop of tables pointing at each other: the rest in any order
    for (const t of ready.length ? ready : left) order.set(t, order.size);
    left = left.filter((t) => !order.has(t));
  }
  return (ranks = order);
}

// a contract's or an invite's own link ("token") is how it's found, so it's kept: without it the row can't come back
const clean = (r: Row): Row => Object.fromEntries(Object.entries(r).filter(([c]) => c === "token" || !SECRET.test(c)));

// The row and, `depth` links out, what hangs off it
async function snap(ref: { table: string; id: string }, depth: number, only?: string[]): Promise<Kept[]> {
  const g = await links();
  const [main] = await prisma.$queryRawUnsafe<{ r: Row }[]>(`select to_jsonb(x) as r from ${q(ref.table)} x where x.${ref.table === "AppSetting" ? "key" : "id"}::text = $1`, ref.id); // a setting's key is its id
  if (!main) return [];
  const out: Kept[] = [{ t: ref.table, d: 0, r: clean(main.r) }];
  let level: { t: string; ids: string[] }[] = [{ t: ref.table, ids: [ref.id] }];
  for (let d = 1; d <= depth && level.length; d++) {
    const asks = level.flatMap(({ t, ids }) => (g.get(t) ?? []).filter((rel) => !only || only.includes(rel.t)).map((rel) => ({ rel, ids })));
    if (!asks.length) break;
    // one round trip a level
    const sql = asks
      .map((a, i) => `select ${i} as n, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from ${q(a.rel.t)} x where x.${q(a.rel.col)}::text = any($${i + 1}::text[])`)
      .join(" union all ");
    const got = await prisma.$queryRawUnsafe<{ n: number; rows: Row[] }[]>(sql, ...asks.map((a) => a.ids));
    const next = new Map<string, string[]>();
    for (const { n, rows } of got) {
      const { rel } = asks[n];
      for (const r of rows) out.push(rel.kept ? { t: rel.t, d, c: rel.col, r: clean(r) } : { t: rel.t, d, r: clean(r) });
      if (!rel.kept) {
        const ids = rows.map((r) => r.id).filter((id): id is string => typeof id === "string");
        if (ids.length) next.set(rel.t, [...(next.get(rel.t) ?? []), ...ids]);
      }
    }
    if (out.length > MAX_ROWS) throw new Error("too big to keep");
    level = [...next].map(([t, ids]) => ({ t, ids }));
  }
  // a row reached twice: as one that goes with it rather than one that points, and the nearest
  const seen = new Map<string, Kept>();
  for (const k of out) {
    const key = keyOf(k);
    const had = seen.get(key);
    if (!had || (had.c && !k.c) || (!!had.c === !!k.c && k.d < had.d)) seen.set(key, k);
  }
  return [...seen.values()];
}

// rows as they are now, by keyOf
async function current(rows: Kept[]): Promise<Map<string, Row>> {
  const byTable = new Map<string, Kept[]>();
  for (const k of rows) byTable.set(k.t, [...(byTable.get(k.t) ?? []), k]);
  const now = new Map<string, Row>();
  for (const [t, ks] of byTable) {
    const ids = ks.filter((k) => k.r.id != null).map((k) => String(k.r.id));
    const whole = ks.filter((k) => k.r.id == null).map((k) => JSON.stringify(k.r));
    const found = [
      ...(ids.length ? await prisma.$queryRawUnsafe<{ r: Row }[]>(`select to_jsonb(x) as r from ${q(t)} x where x.id::text = any($1::text[])`, [...new Set(ids)]) : []),
      ...(whole.length ? await prisma.$queryRawUnsafe<{ r: Row }[]>(`select to_jsonb(x) as r from ${q(t)} x where to_jsonb(x) = any($1::text[]::jsonb[])`, whole) : []),
    ];
    for (const { r } of found) now.set(keyOf({ t, r }), clean(r));
  }
  return now;
}

// ---------- the step ----------

const NOUN: Record<string, string> = {
  Lead: "lead",
  Client: "client",
  Project: "project",
  ProjectAsset: "file",
  Contract: "contract",
  Invoice: "invoice",
  Deliverable: "deliverable",
  ClientDocument: "document",
  Space: "board",
  BoardStage: "stage",
  BoardField: "field",
  StageMessage: "message",
  Team: "department",
  JobTitle: "role",
  TaskTag: "type",
  Tag: "tag",
  User: "person",
  OnboardingStep: "step",
};
const nameOf = (r: Row | undefined) => String(r?.title ?? r?.name ?? r?.label ?? r?.fileName ?? r?.subject ?? "").trim();

function stageName(table: string, row: Row): string {
  const status = String(row.status);
  return table === "Task" ? stageLabel(status as TaskStatus, row.workflow as string) : (WORK_TASK_STAGE[status as keyof typeof WORK_TASK_STAGE]?.label ?? status);
}

// what the step did, in a few words
export function stepLabel(items: Item[]): string {
  if (items.length > 1) {
    const nouns = new Set(items.map((i) => NOUN[i.ref.table] ?? "task"));
    const what = nouns.size === 1 ? `${[...nouns][0]}s` : "items";
    if (items.every((i) => !i.after.some((k) => k.d === 0))) return `Deleted ${items.length} ${what}`;
    if (items.every((i) => !i.before.some((k) => k.d === 0))) return `Added ${items.length} ${what}`;
    return `Changed ${items.length} ${what}`;
  }
  const { ref, before, after } = items[0];
  const b = before.find((k) => k.d === 0)?.r;
  const a = after.find((k) => k.d === 0)?.r;
  const name = nameOf(a ?? b);
  const noun = NOUN[ref.table];
  const what = name ? `${noun ? `${noun} ` : ""}"${name}"` : noun ? `a ${noun}` : "a task";
  if (!a) return `Deleted ${what}`;
  if (!b) return `Added ${what}`;
  if ((ref.table === "Task" || ref.table === "WorkTask") && b.status !== a.status) return `Moved ${what} to ${stageName(ref.table, a)}`;
  if ("dueDate" in a && b.dueDate !== a.dueDate) return `Changed the date on ${what}`;
  return `Edited ${what}`;
}

async function tellBrowser(meta: UndoStep) {
  // the bar at the top picks it up (UndoRedo), whichever page made the change
  try {
    (await cookies()).set(UNDO_COOKIE, encodeURIComponent(JSON.stringify(meta)), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 });
  } catch {
    // not from a browser (a script, the MCP): nothing to tell
  }
}

async function keep(userId: string, meta: UndoStep, items?: Item[]) {
  const value = JSON.stringify(meta);
  const writes = [prisma.appSetting.upsert({ where: { key: metaKey(userId) }, create: { key: metaKey(userId), value }, update: { value } })];
  if (items) {
    const rows = JSON.stringify({ items });
    writes.push(prisma.appSetting.upsert({ where: { key: rowsKey(userId) }, create: { key: rowsKey(userId), value: rows }, update: { value: rows } }));
  }
  await prisma.$transaction(writes);
  await tellBrowser(meta);
}

type Opts = {
  // how many links out to keep: 0 the row alone (an edit to something big
  // like a client), 1 (the default) what hangs straight off it, more for a
  // delete that takes a whole tree with it
  depth?: number;
  label?: string;
  // past the row itself, only these tables (a person, whose links are many)
  only?: string[];
  // whose step it is, when not the signed-in person's (a script)
  userId?: string;
};

// Runs a change to these rows and keeps it as the person's step to undo. A
// change that changed nothing (refused, or the same value) keeps no step;
// one that can't be kept still happens. For something made by the change,
// pass a function that names it from what `run` returned.
export async function withUndo<R>(refs: Ref[] | ((result: R) => Ref[] | null | undefined), run: () => Promise<R>, opts: Opts = {}): Promise<R> {
  const userId = opts.userId ?? (await getRealUserId().catch(() => null));
  if (!userId) return run();
  const depth = opts.depth ?? 1;
  const made = typeof refs === "function";
  let targets = made ? [] : refs.map(norm);
  let before: Kept[][] | null = null;
  if (!made) before = await Promise.all(targets.map((r) => snap(r, depth, opts.only))).catch(() => null);
  const result = await run();
  try {
    if (made) {
      targets = (refs(result) ?? []).map(norm);
      before = targets.map(() => []);
    }
    if (!before || !targets.length) return result;
    const after = await Promise.all(
      targets.map(async (r, i) => {
        const now = await snap(r, depth, opts.only);
        // what only pointed here before, wherever it points now
        const have = new Set(now.map(keyOf));
        const left = before![i].filter((k) => k.c && !have.has(keyOf(k)));
        const found = left.length ? await current(left) : new Map<string, Row>();
        // ...or, if the change deleted it, that it's gone
        return [...now, ...left.map((k): Kept => (found.has(keyOf(k)) ? { ...k, r: found.get(keyOf(k))! } : { ...k, x: true }))];
      }),
    );
    const items = targets.map((ref, i) => ({ ref, before: before![i], after: after[i] })).filter((i) => changedAny(i.before, i.after));
    if (items.length) await keep(userId, { label: opts.label ?? stepLabel(items), undone: false, at: new Date().toISOString() }, items);
  } catch (e) {
    console.error("undo: step not kept", e);
  }
  return result;
}

// what the frame shows: the step, without its rows
export async function undoStepFor(userId: string): Promise<UndoStep | null> {
  const s = await prisma.appSetting.findUnique({ where: { key: metaKey(userId) }, select: { value: true } });
  try {
    const m = s ? (JSON.parse(s.value) as UndoStep) : null;
    return m?.label ? { label: m.label, undone: !!m.undone, at: m.at } : null;
  } catch {
    return null;
  }
}

// ---------- putting rows back ----------

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const where = (k: Kept, from: number) =>
  k.r.id != null ? { sql: `x.id::text = $${from}`, args: [String(k.r.id)] } : { sql: `to_jsonb(x) = $${from}::jsonb`, args: [JSON.stringify(k.r)] };

// every part of the step together, so a link one part lets go of is free
// for another to take
async function apply(tx: Tx, plans: Plan[], now: Map<string, Row>, actorId: string) {
  const conflict = plans.find((x) => x.conflict)?.conflict;
  if (conflict) return conflict;
  const p = { deletes: plans.flatMap((x) => x.deletes), inserts: plans.flatMap((x) => x.inserts), updates: plans.flatMap((x) => x.updates), links: plans.flatMap((x) => x.links) };
  const rank = rankOf(await links());
  const r = (k: Kept) => rank.get(k.t) ?? 0;
  p.inserts.sort((a, b) => r(a) - r(b) || a.d - b.d);
  p.deletes.sort((a, b) => r(b) - r(a) || b.d - a.d);
  for (const k of p.deletes) {
    // a task's link on the placeholder it filled goes with it (lib/taskTrack deleteForGood)
    if (k.t === "Task")
      await tx.$executeRawUnsafe(`update "ProjectAsset" a set link = null, "deliveredAt" = null from "Task" t where a."taskId" = t.id and t.id = $1 and a.link = t."driveLink"`, String(k.r.id));
    const w = where(k, 1);
    await tx.$executeRawUnsafe(`delete from ${q(k.t)} x where ${w.sql}`, ...w.args);
  }
  for (const k of p.inserts)
    await tx.$executeRawUnsafe(`insert into ${q(k.t)} select * from jsonb_populate_record(null::${q(k.t)}, $1::jsonb) on conflict do nothing`, JSON.stringify(k.r));
  // what's let go of (set empty) before what's taken, the row itself before
  // what hangs off it: a one-to-one link (a placeholder's task) can move
  // from one row to another without two holding it at once
  const runs = [
    ...p.updates.map(({ k, cols }) => ({ k, cols: cols.filter((c) => k.r[c] == null) })),
    ...[...p.updates].sort((a, b) => a.k.d - b.k.d).map(({ k, cols }) => ({ k, cols: cols.filter((c) => k.r[c] != null) })),
  ].filter((u) => u.cols.length);
  for (const { k, cols } of runs) {
    const w = where(k, 2);
    await tx.$executeRawUnsafe(
      `update ${q(k.t)} x set (${cols.map(q).join(", ")}) = (select ${cols.map((c) => `r.${q(c)}`).join(", ")} from jsonb_populate_record(null::${q(k.t)}, $1::jsonb) r) where ${w.sql}`,
      JSON.stringify(k.r),
      ...w.args,
    );
    // a stage it moved back or on is a move in its history, as any other
    if (k.t === "Task" && k.d === 0 && cols.includes("status")) {
      const was = now.get(keyOf(k))?.status;
      await tx.activityLog.create({ data: { actorId, action: stageChangeAction(String(was), String(k.r.status)), entity: "Task", entityId: String(k.r.id) } });
    }
  }
  for (const { k, value } of p.links) {
    const c = q(k.c!);
    const w = where(k, 3);
    // only while it still points where it did: another part of the step may have moved it on
    const still = value == null ? `x.${c}::text = $2` : `(x.${c} is null and $2::text is null)`;
    await tx.$executeRawUnsafe(`update ${q(k.t)} x set ${c} = $1 where ${w.sql} and ${still}`, value, value == null ? String(k.r[k.c!]) : null, ...w.args);
  }
  return null;
}

export async function undoOrRedo(userId: string, redo: boolean): Promise<{ error?: string; label?: string }> {
  const [m, r] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: metaKey(userId) } }),
    prisma.appSetting.findUnique({ where: { key: rowsKey(userId) } }),
  ]);
  let meta: UndoStep | null = null;
  let items: Item[] | null = null;
  try {
    meta = m ? (JSON.parse(m.value) as UndoStep) : null;
    items = r ? (JSON.parse(r.value) as { items: Item[] }).items : null;
  } catch {
    // an older step, kept another way
  }
  if (!meta || !items || !!meta.undone !== redo) return { error: redo ? "Nothing to redo." : "Nothing to undo." };
  const from = redo ? "before" : "after";
  const to = redo ? "after" : "before";
  const now = await current(items.flatMap((i) => [...i.before, ...i.after]));
  try {
    await prisma.$transaction(
      async (tx) => {
        const clash = await apply(tx, items!.map((i) => plan(i[from], i[to], now)), now, userId);
        if (clash) {
          const name = nameOf(clash.r);
          throw new Clash(`${name ? `"${name}"` : "That"} has changed since, so it can't be ${redo ? "redone" : "undone"}.`);
        }
      },
      { timeout: 30000, maxWait: 10000 },
    );
  } catch (e) {
    if (e instanceof Clash) return { error: e.message };
    console.error("undo failed", e);
    return { error: `That can't be ${redo ? "redone" : "undone"} any more: something it relied on has changed.` };
  }
  await keep(userId, { ...meta, undone: !redo });
  return { label: meta.label };
}

class Clash extends Error {}
