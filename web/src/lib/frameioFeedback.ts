import { prisma } from "./prisma";
import { frameioConnected, shareComments, shareIdFrom, type FrameioComment } from "./frameio";
import { claudeJson, claudeKey } from "./claude";
import { takeSnapshots } from "./snapshots";
import { categorise } from "./categorise";
import { parseStageChange } from "./stages";
import { refreshVideoScores } from "./videoScores";
import { VIDEO_SCORING_KEY, withVideoScoringDefaults } from "./videoScore";

// Review comments from Frame.io, turned into the editor's feedback log.
//
// Every comment left on an editor's review link becomes one entry against
// them, sorted by its words (lib/categorise.ts, no AI): a mistake of one of
// core's own types (Typos, UK/US spelling…, set up on the Performance
// settings page), a creative change (for that video only, never counted),
// praise, or a tip for them to work on from now on. Core can correct any of it by hand, or ask Claude to
// re-sort (Sort with AI, only when clicked). Each comment's frame is kept as a small snapshot, and whether
// the editor has ticked it done in Frame.io is read back on every sync.
// Nothing here writes to Frame.io.

export const FEEDBACK_SYNCED = "frameio.feedbackSyncedAt";
// review links on work that moved in the last this-many days
const WINDOW_DAYS = 60;
const BATCH = 40;
const WITH_CLIENT = ["sent_for_client_approval", "final_export_ready", "delivered_and_uploaded"];

function system(categories: { name: string; description: string | null; keywords: string | null }[]) {
  return `You sort the review comments left on a video editor's cuts in Frame.io, for a video agency's review of its editors. Each comment is from our own reviewers or from the client, and many are written in Hinglish.

Give each comment one kind:
- point: a mistake in this video that has to be fixed. Put it in the closest category below.
- creative: a change for this video only that isn't an error: a creative preference (music, pacing, style, broll, a different take), a question, or a fragment.
- praise: positive feedback on the work.
- tip: advice for the editor to apply from now on, beyond this video.

The categories:
${categories.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ""}${c.keywords ? ` (for instance: ${c.keywords})` : ""}`).join("\n")}

For creative, praise and tips, the category is "None".`;
}

type Sorted = { items: { id: string; kind: "point" | "creative" | "praise" | "tip"; category: string }[] };
const AI_KIND = { creative: "creative", praise: "positive", tip: "guidance" } as const;

const schema = (names: string[]) => ({
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["point", "creative", "praise", "tip"] },
          category: { type: "string", enum: [...names, "None"] },
        },
        required: ["id", "kind", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
});

// byClient: the client wrote it. fromClient: it's from the client stage (the
// client wrote it, or it was left once the video had gone to the client),
// so it counts against Client acceptance, not Quality.
type Found = FrameioComment & { taskId: string; taskTitle: string; editorId: string; byClient: boolean; fromClient: boolean };

// Asked for, never automatic: Claude re-sorts these entries into the
// categories. Only Frame.io comments nobody has sorted by hand; every call
// goes through the usage meter (Haiku).
export async function aiSortEntries(ids: string[]): Promise<number> {
  if (!(await claudeKey())) throw new Error("Claude isn't set up, so only the keywords can sort.");
  const [entries, categories] = await Promise.all([
    prisma.performanceEntry.findMany({
      where: { id: { in: ids }, source: "frameio", reviewed: false },
      select: { id: true, body: true, fromClient: true, task: { select: { title: true } } },
    }),
    prisma.feedbackCategory.findMany({ select: { name: true, description: true, keywords: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const names = categories.map((c) => c.name);
  const fallback = names.includes("Others") ? "Others" : (names.at(-1) ?? "Others");
  let sorted = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const prompt = batch.map((e) => JSON.stringify({ id: e.id, from: e.fromClient ? "client" : "our review", video: e.task?.title ?? "", comment: e.body })).join("\n");
    const res = await claudeJson<Sorted>({ system: system(categories), prompt: `Sort these comments, one per line:\n${prompt}`, schema: schema(names) });
    for (const r of res.items) {
      if (!batch.some((e) => e.id === r.id)) continue;
      await prisma.performanceEntry.update({
        where: { id: r.id },
        data: r.kind === "point" ? { kind: "mistake", category: r.category !== "None" ? r.category : fallback } : { kind: AI_KIND[r.kind], category: null, points: null },
      });
      sorted++;
    }
  }
  return sorted;
}

// Pulls in whatever's new since the last run. Safe to run as often as
// anyone likes: a comment already in the log is never added twice.
export async function syncFrameioFeedback(): Promise<{ added: number; mistakes: number; snapshots: number }> {
  if (!(await frameioConnected())) throw new Error("Frame.io isn't connected. Connect it under Integrations first.");

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [tasks, ours] = await Promise.all([
    prisma.task.findMany({
      where: { frameioLink: { not: null }, assignedToId: { not: null }, updatedAt: { gte: since } },
      select: { id: true, title: true, frameioLink: true, assignedToId: true },
    }),
    prisma.user.findMany({ select: { email: true, name: true } }),
  ]);
  // when each video first went to the client
  const logs = await prisma.activityLog.findMany({ where: { entity: "Task", entityId: { in: tasks.map((t) => t.id) } }, select: { entityId: true, action: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const withClient = new Map<string, Date>();
  for (const l of logs) {
    const to = parseStageChange(l.action)?.to;
    if (to && WITH_CLIENT.includes(to) && !withClient.has(l.entityId)) withClient.set(l.entityId, l.createdAt);
  }
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
        return comments.map((c) => {
          const byClient = !isOurs(c);
          const since = withClient.get(t.id);
          return { ...c, taskId: t.id, taskTitle: t.title, editorId: t.assignedToId!, byClient, fromClient: byClient || (!!since && new Date(c.createdAt) >= since) };
        });
      })
    );
    found.push(...lists.flat());
  }

  const logged = await prisma.performanceEntry.findMany({
    where: { sourceId: { in: found.map((c) => `frameio:${c.id}`) } },
    select: { id: true, sourceId: true, resolvedAt: true, frameioFileId: true },
  });
  const known = new Map(logged.map((e) => [e.sourceId, e]));
  const fresh = found.filter((c) => !known.has(`frameio:${c.id}`));

  // ticked or unticked in Frame.io since the last sync: follow it; and
  // note where each was left, for its snapshot
  for (const c of found) {
    const e = known.get(`frameio:${c.id}`);
    if (!e) continue;
    const resolvedAt = c.completedAt ? new Date(c.completedAt) : null;
    if ((e.resolvedAt?.toISOString() ?? null) === (resolvedAt?.toISOString() ?? null) && e.frameioFileId) continue;
    await prisma.performanceEntry.update({ where: { id: e.id }, data: { resolvedAt, frameioFileId: c.fileId, frame: c.frame } });
  }

  // sorted by their words; free, and the same answer every time
  const [categories, scoring] = await Promise.all([
    prisma.feedbackCategory.findMany({ select: { name: true, keywords: true }, orderBy: { sortOrder: "asc" } }),
    prisma.appSetting.findUnique({ where: { key: VIDEO_SCORING_KEY } }),
  ]);
  const { creativeWords } = withVideoScoringDefaults(JSON.parse(scoring?.value ?? "{}"));
  const sorted = new Map(fresh.map((c) => [c.id, categorise(c.text, categories, c.byClient, creativeWords)]));
  await prisma.performanceEntry.createMany({
    data: fresh.map((c) => {
      const s = sorted.get(c.id);
      return {
        editorId: c.editorId,
        taskId: c.taskId,
        kind: s?.kind ?? "mistake",
        category: s ? s.category : "Others",
        body: c.text,
        at: new Date(c.createdAt),
        source: "frameio",
        sourceId: `frameio:${c.id}`,
        by: c.by,
        fromClient: c.fromClient,
        resolvedAt: c.completedAt ? new Date(c.completedAt) : null,
        frameioFileId: c.fileId,
        frame: c.frame,
      };
    }),
    skipDuplicates: true,
  });

  // a snapshot of each comment's frame, new or not yet taken
  const ids = new Map(
    (await prisma.performanceEntry.findMany({ where: { sourceId: { in: found.map((c) => `frameio:${c.id}`) } }, select: { id: true, sourceId: true } })).map((e) => [e.sourceId, e.id])
  );
  const snapshots = await takeSnapshots(
    found.filter((c) => c.frame !== null && ids.has(`frameio:${c.id}`)).map((c) => ({ entryId: ids.get(`frameio:${c.id}`)!, accountId: c.accountId, fileId: c.fileId, frame: c.frame! }))
  ).catch(() => 0);
  const now = new Date().toISOString();
  await prisma.appSetting.upsert({ where: { key: FEEDBACK_SYNCED }, create: { key: FEEDBACK_SYNCED, value: now }, update: { value: now } });
  // new comments (and ones ticked done) change their videos' scores
  if (fresh.length) await refreshVideoScores([...new Set(fresh.map((c) => c.taskId))]).catch(() => {});
  return { added: fresh.length, mistakes: [...sorted.values()].filter((s) => s.kind === "mistake").length, snapshots };
}
