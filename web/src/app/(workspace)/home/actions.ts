"use server";

import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { isFounder, isLead } from "@/lib/scope";
import { createMeeting, MEETINGS_TAG } from "@/lib/googleCalendar";

// A town hall or group meeting, made from Home: into easeus.media@gmail.com's
// calendar with a Meet link, and an invite to each person picked. Only a
// Founder makes one; the people are checked against the team, never taken
// as addresses from the form.
export async function scheduleMeeting(input: { title: string; day: string; time: string; minutes: number; people: string[]; note: string }): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me || !(isFounder(me) || isLead(me))) return { error: "Only Level 1 and Level 2 can schedule a meeting." };
  const title = input.title.trim();
  if (!title) return { error: "Give the meeting a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || !/^\d{2}:\d{2}$/.test(input.time)) return { error: "Pick a day and a time." };
  const minutes = Math.min(Math.max(Math.round(input.minutes), 15), 8 * 60);
  const start = new Date(`${input.day}T${input.time}:00+05:30`);
  if (Number.isNaN(start.getTime())) return { error: "That time isn't valid." };

  const people = await prisma.user.findMany({ where: { id: { in: input.people }, employment: { not: "former" } }, select: { email: true } });
  try {
    await createMeeting({ title, start, end: new Date(start.getTime() + minutes * 60_000), attendees: people.map((p) => p.email), description: input.note.trim() });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Google Calendar didn't take the meeting." };
  }
  // the held week's list is out of date now: the next render asks Google again
  updateTag(MEETINGS_TAG);
  revalidatePath("/home");
  return {};
}

// A line on Home's Notices, for Level 1: a reminder, a deadline, anything
export async function addNotice(body: string): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me || !isFounder(me)) return { error: "Only Level 1 can add a notice." };
  const text = body.trim();
  if (!text) return { error: "Write the notice first." };
  await prisma.notice.create({ data: { body: text.slice(0, 500), by: me.name } });
  revalidatePath("/home");
  return {};
}

// Clearing a notice: your own, or (Level 1) any, so it works in View as too,
// where a save runs as the real person
export async function clearNotice(id: string): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me) return { error: "Your session has ended. Please sign in again." };
  await prisma.notice.deleteMany({ where: isFounder(me) ? { id } : { id, forId: me.id } });
  revalidatePath("/home");
  return {};
}

// Hiding a notice the app works out for Level 1 (contracts waiting, an
// invoice due, client messages): it's kept hidden, for this person, until
// what it says changes ("2 contracts" after "1 contract" shows again). The
// list is read by home/page.tsx under the same key.
export async function hideNotice(key: string, text: string): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me) return { error: "Your session has ended. Please sign in again." };
  const at = `home.hiddenNotices:${me.id}`;
  const row = await prisma.appSetting.findUnique({ where: { key: at } });
  const hidden: string[] = row ? JSON.parse(row.value) : [];
  // the latest few are plenty: an old one that's back to the same words can show again
  const value = JSON.stringify([...hidden.filter((h) => h !== `${key}|${text}`), `${key}|${text}`].slice(-50));
  await prisma.appSetting.upsert({ where: { key: at }, create: { key: at, value }, update: { value } });
  revalidatePath("/home");
  return {};
}

// Level 1 and 2 annotate and pass on the notices they get (12 Oct 2026)
const upper = (u: { role: string; email?: string | null }) => isFounder(u) || isLead(u);
// theirs, or (Level 1) one of Level 1's own notes
const theirs = (me: { id: string; role: string; email?: string | null }, n: { forId: string | null }) => n.forId === me.id || (n.forId === null && isFounder(me));

// A remark of their own on a notice they got; empty clears it
export async function setNoticeRemark(id: string, text: string): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me || !upper(me)) return { error: "Only Level 1 and Level 2 can add a remark." };
  const notice = await prisma.notice.findUnique({ where: { id }, select: { forId: true } });
  if (!notice || !theirs(me, notice)) return { error: "That notice isn't yours." };
  await prisma.notice.update({ where: { id }, data: { remark: text.trim().slice(0, 1000) || null } });
  revalidatePath("/home");
  return {};
}

// Passing a notice on: each person picked gets it in their Notices, saying
// who forwarded it and with the forwarder's remark, if they wrote one. A
// notice the app works out (contracts waiting, an invoice due) goes as its
// words.
export async function forwardNotice(from: { id?: string; text?: string }, userIds: string[]): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me || !upper(me)) return { error: "Only Level 1 and Level 2 can forward a notice." };
  const to = await prisma.user.findMany({ where: { id: { in: userIds, not: me.id }, employment: { not: "former" } }, select: { id: true } });
  if (!to.length) return { error: "Pick who to forward it to." };
  const original = from.id ? await prisma.notice.findUnique({ where: { id: from.id } }) : null;
  if (from.id && (!original || !theirs(me, original))) return { error: "That notice isn't yours." };
  const body = original?.body ?? from.text?.trim().slice(0, 500);
  if (!body) return { error: "There's nothing to forward." };
  await prisma.notice.createMany({
    data: to.map((p) => ({
      forId: p.id,
      body,
      kind: original?.kind ?? "note",
      taskId: original?.taskId ?? null,
      workTaskId: original?.workTaskId ?? null,
      forwardedBy: me.name,
      forwardRemark: original?.remark ?? null,
    })),
  });
  revalidatePath("/home");
  return {};
}
