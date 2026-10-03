"use server";

import { revalidatePath, updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { isFounder } from "@/lib/scope";
import { createMeeting, MEETINGS_TAG } from "@/lib/googleCalendar";

// A town hall or group meeting, made from Home: into easeus.media@gmail.com's
// calendar with a Meet link, and an invite to each person picked. Only a
// Founder makes one; the people are checked against the team, never taken
// as addresses from the form.
export async function scheduleMeeting(input: { title: string; day: string; time: string; minutes: number; people: string[]; note: string }): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me || !isFounder(me)) return { error: "Only a Founder can schedule a meeting." };
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

// Clearing a notice: your own, or (Level 1) a note on Home
export async function clearNotice(id: string): Promise<{ error?: string }> {
  const me = await getViewer();
  if (!me) return { error: "Your session has ended. Please sign in again." };
  await prisma.notice.deleteMany({ where: { id, OR: [{ forId: me.id }, ...(isFounder(me) ? [{ forId: null }] : [])] } });
  revalidatePath("/home");
  return {};
}
