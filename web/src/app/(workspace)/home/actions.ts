"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { isFounder } from "@/lib/scope";
import { createMeeting } from "@/lib/googleCalendar";

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
  revalidatePath("/home");
  return {};
}
