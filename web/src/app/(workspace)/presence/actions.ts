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
  // not just hidden from the list — refused, so an old thread left open in a
  // tab can't keep writing to someone who has left
  const to = await prisma.user.findUnique({ where: { id: toUserId }, select: { employment: true } });
  if (!to || to.employment === "former") return { error: "They're no longer on the team." };

  await prisma.message.create({ data: { fromId: fromUserId, toId: toUserId, body: trimmed } });
  revalidatePath("/", "layout"); // the unread badge lives in the layout, above every page
  return {};
}

// Unread count per sender — drives both the header's aggregate badge (sum
// of these) and, more usefully, which specific person's row gets a badge
// in the team roster itself: seeing "1 unread" on the stack doesn't tell
// you who it's from without opening the panel and guessing.
export async function getUnreadBySender(): Promise<Record<string, number>> {
  const userId = await getSessionUserId();
  if (!userId) return {};
  const rows = await prisma.message.groupBy({
    by: ["fromId"],
    // someone who has left isn't in the chat list any more, so an unread
    // message from them would sit in the badge with no way to open it
    where: { toId: userId, readAt: null, from: { employment: { not: "former" } } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.fromId, r._count._all]));
}

export type Conversation = {
  userId: string;
  lastBody: string;
  lastAt: Date;
  lastFromMe: boolean;
  unread: number;
};

// One row per person you've actually exchanged messages with, newest
// first — the left column of the chat dashboard. Done as a single query
// over every message either direction and folded in memory rather than N
// queries (one per teammate): the whole team is under a dozen people and
// this table is small, so the simple version is also the fast one.
export async function listConversations(): Promise<Conversation[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];

  const messages = await prisma.message.findMany({
    where: { OR: [{ fromId: userId }, { toId: userId }] },
    orderBy: { createdAt: "desc" },
    select: { fromId: true, toId: true, body: true, createdAt: true, readAt: true },
  });

  const byPerson = new Map<string, Conversation>();
  for (const m of messages) {
    const other = m.fromId === userId ? m.toId : m.fromId;
    // messages come newest-first, so the first one seen per person is the
    // latest; everything after only contributes to the unread count
    const existing = byPerson.get(other);
    if (!existing) {
      byPerson.set(other, {
        userId: other,
        lastBody: m.body,
        lastAt: m.createdAt,
        lastFromMe: m.fromId === userId,
        unread: m.toId === userId && !m.readAt ? 1 : 0,
      });
    } else if (m.toId === userId && !m.readAt) {
      existing.unread += 1;
    }
  }
  return [...byPerson.values()];
}
