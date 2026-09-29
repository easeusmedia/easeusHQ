import { prisma } from "./prisma";
import { frameioConnected, shareComments, shareIdFrom, type FrameioComment } from "./frameio";
import { claudeJson, claudeKey } from "./claude";
import { MISTAKE_CATEGORIES } from "./editorKpi";
import { syncIssues } from "./issues";

// Review comments from Frame.io, turned into the editor's feedback log.
//
// Every comment left on an editor's review link becomes one entry against
// them, open until the editor ticks it done in Frame.io (read back on every
// sync, so ticking or unticking there shows here). Claude sorts each: an actual editing mistake (with its kind, the
// same kinds the Notion review used), ordinary creative direction, praise,
// or just a note. The sorting is a first pass, not a verdict: every entry
// arrives unreviewed, and ops confirms or flips it on the editor's page.
// Nothing here writes to Frame.io.

export const FEEDBACK_SYNCED = "frameio.feedbackSyncedAt";
// review links on work that moved in the last this-many days
const WINDOW_DAYS = 60;
const BATCH = 40;

const SYSTEM = `You sort the review comments left on a video editor's cuts in Frame.io, for a video agency's performance review of its editors. Each comment is from our own reviewers or from the client, and many are written in Hinglish.

Give each comment one kind:
- mistake: something the editor got wrong that a careful editor would have caught. Typos or misspellings in on-screen text or subtitles; UK/US spelling slips; subtitles that don't match what's said; audio problems such as clipped words, bad levels or noise; text styling errors such as spacing, size or alignment; sloppy animation or keyframes; visual glitches such as black lines, uneven frames, jumps or bad renders; content cut that shouldn't have been, or the wrong asset, overlay or fact; and repeating something they were already told ("again", "how many times").
- creative: ordinary direction or taste. Add b-roll, change the music level, try another style, new ideas, anything that wasn't in the brief.
- praise: positive feedback on the work.
- note: anything else, such as questions, reminders, fragments or a lone word.

A mistake counts against the editor, so when a comment could be either a mistake or creative direction, choose creative. For a mistake, pick the closest category; for anything else, the category is "None".`;

type Sorted = { items: { id: string; kind: "mistake" | "creative" | "praise" | "note"; category: string }[] };

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["mistake", "creative", "praise", "note"] },
          category: { type: "string", enum: [...MISTAKE_CATEGORIES, "None"] },
        },
        required: ["id", "kind", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

type Found = FrameioComment & { taskId: string; taskTitle: string; editorId: string; fromClient: boolean };

async function sort(found: Found[]): Promise<Map<string, { kind: string; category: string | null }>> {
  const out = new Map<string, { kind: string; category: string | null }>();
  for (let i = 0; i < found.length; i += BATCH) {
    const batch = found.slice(i, i + BATCH);
    const prompt = batch
      .map((c) => JSON.stringify({ id: c.id, from: c.fromClient ? "client" : "our review", video: c.taskTitle, cut: c.version, comment: c.text }))
      .join("\n");
    const res = await claudeJson<Sorted>({ system: SYSTEM, prompt: `Sort these comments, one per line:\n${prompt}`, schema: SCHEMA });
    for (const r of res.items) out.set(r.id, { kind: r.kind, category: r.kind === "mistake" && r.category !== "None" ? r.category : r.kind === "mistake" ? "Others" : null });
  }
  return out;
}

// Pulls in whatever's new since the last run. Safe to run as often as
// anyone likes: a comment already in the log is never added twice.
export async function syncFrameioFeedback(): Promise<{ added: number; mistakes: number; sorted: boolean }> {
  if (!(await frameioConnected())) throw new Error("Frame.io isn't connected. Connect it under Integrations first.");

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [tasks, ours] = await Promise.all([
    prisma.task.findMany({
      where: { frameioLink: { not: null }, assignedToId: { not: null }, updatedAt: { gte: since } },
      select: { id: true, title: true, frameioLink: true, assignedToId: true },
    }),
    prisma.user.findMany({ select: { email: true, name: true } }),
  ]);
  // our own reviewers: anyone with an account here, or on the agency's own login
  const emails = new Set(ours.map((u) => u.email.toLowerCase()));
  const isOurs = (c: FrameioComment) =>
    (!!c.byEmail && (emails.has(c.byEmail.toLowerCase()) || c.byEmail.toLowerCase().endsWith("@easeus.media"))) || /easeus/i.test(c.by ?? "");

  // a few review links at a time: quick, without leaning on Frame.io
  const found: Found[] = [];
  for (let i = 0; i < tasks.length; i += 6) {
    const lists = await Promise.all(
      tasks.slice(i, i + 6).map(async (t) => {
        const share = await shareIdFrom(t.frameioLink!);
        const comments = share ? await shareComments(share).catch(() => []) : [];
        return comments.map((c) => ({ ...c, taskId: t.id, taskTitle: t.title, editorId: t.assignedToId!, fromClient: !isOurs(c) }));
      })
    );
    found.push(...lists.flat());
  }

  const logged = await prisma.performanceEntry.findMany({
    where: { sourceId: { in: found.map((c) => `frameio:${c.id}`) } },
    select: { id: true, sourceId: true, resolvedAt: true },
  });
  const known = new Map(logged.map((e) => [e.sourceId, e]));
  const fresh = found.filter((c) => !known.has(`frameio:${c.id}`));

  // ticked or unticked in Frame.io since the last sync: follow it
  for (const c of found) {
    const e = known.get(`frameio:${c.id}`);
    if (!e || (e.resolvedAt?.toISOString() ?? null) === (c.completedAt ? new Date(c.completedAt).toISOString() : null)) continue;
    await prisma.performanceEntry.update({ where: { id: e.id }, data: { resolvedAt: c.completedAt ? new Date(c.completedAt) : null } });
  }

  // without Claude they still arrive, as creative feedback for ops to sort
  const sorted = fresh.length && (await claudeKey()) ? await sort(fresh) : new Map();
  await prisma.performanceEntry.createMany({
    data: fresh.map((c) => {
      const s = sorted.get(c.id);
      return {
        editorId: c.editorId,
        taskId: c.taskId,
        kind: s?.kind ?? "creative",
        category: s?.category ?? null,
        body: c.text,
        at: new Date(c.createdAt),
        source: "frameio",
        sourceId: `frameio:${c.id}`,
        by: c.by,
        fromClient: c.fromClient,
        resolvedAt: c.completedAt ? new Date(c.completedAt) : null,
      };
    }),
    skipDuplicates: true,
  });
  // new mistakes can make a kind of mistake recurring
  await syncIssues();
  const now = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key: FEEDBACK_SYNCED }, create: { key: FEEDBACK_SYNCED, value: now }, update: { value: now } });
  return { added: fresh.length, mistakes: [...sorted.values()].filter((s) => s.kind === "mistake").length, sorted: sorted.size > 0 };
}
