"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// Called every ~60s by PresenceHeartbeat while a tab is open. Re-derives
// who's pinging from the session rather than trusting a client-passed id —
// same reasoning as every other action here that actually mutates data.
export async function pingPresence(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) return;
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
}

export type ThreadMessage = { id: string; fromId: string; body: string; createdAt: Date };

// Every message either direction between me and one other person, oldest
// first — there's no separate Conversation row, a thread is just this
// query. Also marks whatever they sent me as read, since opening the
// thread is exactly "I've now seen this".
export async function getThreadMessages(otherUserId: string): Promise<ThreadMessage[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { fromId: userId, toId: otherUserId },
        { fromId: otherUserId, toId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, fromId: true, body: true, createdAt: true },
  });

  await prisma.message.updateMany({
    where: { fromId: otherUserId, toId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  return messages;
}

export async function sendMessage(toUserId: string, body: string): Promise<{ error?: string }> {
  const fromUserId = await getSessionUserId();
  if (!fromUserId) return { error: "Not signed in." };
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message is empty." };

  await prisma.message.create({ data: { fromId: fromUserId, toId: toUserId, body: trimmed } });
  revalidatePath("/tasks"); // the unread badge lives in the layout, above every page
  return {};
}

// Drives the small dot on the stacked-avatars header trigger — unread
// count across every sender, not per-thread, since the trigger itself
// doesn't know which thread(s) to look at until it's opened.
export async function getUnreadCount(): Promise<number> {
  const userId = await getSessionUserId();
  if (!userId) return 0;
  return prisma.message.count({ where: { toId: userId, readAt: null } });
}
