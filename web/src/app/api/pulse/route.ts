import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRealUserId as getSessionUserId } from "@/lib/auth";
import { runsClients } from "@/lib/scope";
import { ACTIVE_WINDOW_MS } from "@/app/(workspace)/presence/constants";

export const dynamic = "force-dynamic";

// What an open tab asks every few seconds (see Pulse.tsx), in one light GET:
// has anything it shows changed since it last asked, and — for the people
// they're for — tasks just delivered and client messages. It also marks the
// asker as active. A GET rather than server actions because Next runs a
// page's actions one after another, and three background polls queued as
// actions made a click wait behind them.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ signedOut: true }, { status: 401 });
  const now = new Date();

  const [user, writes, online, approvals, feedback] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, departments: { select: { id: true, slug: true } } } }),
    // a counter every write to a table the pages show bumps the moment it
    // happens (scripts/realtime.ts): it moves whenever any of their rows do
    prisma.$queryRaw<{ n: bigint | null }[]>`select last_value as n from public.hq_change_seq`.catch(() => null),
    prisma.user.findMany({
      where: { lastSeenAt: { gt: new Date(now.getTime() - ACTIVE_WINDOW_MS) } },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    prisma.task.findMany({
      where: { assignedToId: userId, status: { not: "delivered_and_uploaded" } },
      select: { id: true, title: true, status: true },
    }),
    prisma.clientFeedback.findMany({
      where: { readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, message: true, client: { select: { name: true, slug: true } } },
    }),
    // here: at most once every 45s, not a write on every ask. Never from a
    // local dev server: it shares the live database, so testing there would
    // show whoever it's signed in as online to the whole team.
    process.env.NODE_ENV === "production"
      ? prisma.user.updateMany({
          where: { id: userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now.getTime() - 45_000) } }] },
          data: { lastSeenAt: now },
        })
      : null,
  ]);

  const seesFeedback = !!user && runsClients(user);
  return NextResponse.json(
    {
      // if the count can't be read, a fresh value each time: the page then
      // refreshes on every tick, as it did before this existed
      v: `${writes?.[0]?.n ?? now.getTime()}:${online.map((u) => u.id).join(",")}`,
      approvals: user?.role === "employee" ? approvals : undefined,
      feedback: seesFeedback
        ? feedback.map((r) => ({ id: r.id, from: r.name, message: r.message.slice(0, 140), client: r.client.name, slug: r.client.slug }))
        : undefined,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
