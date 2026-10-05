import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRealViewer } from "@/lib/auth";
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
  // who's asking: the one lookup, with their level and departments
  const user = await getRealViewer();
  if (!user) return NextResponse.json({ signedOut: true }, { status: 401 });
  const userId = user.id;
  const now = new Date();

  const [writes, online, approvals, feedback] = await Promise.all([
    // a counter every write to a table the pages show bumps the moment it
    // happens (scripts/realtime.ts): it moves whenever any of their rows do
    prisma.$queryRaw<{ n: bigint | null }[]>`select last_value as n from public.hq_change_seq`.catch(() => null),
    prisma.user.findMany({
      where: { lastSeenAt: { gt: new Date(now.getTime() - ACTIVE_WINDOW_MS) }, employment: { not: "former" } },
      select: { name: true },
    }),
    // only for those it's for: a Member's own tasks, client messages for those who run clients
    user.role === "employee"
      ? prisma.task.findMany({
          where: { assignedToId: userId, status: { not: "delivered_and_uploaded" } },
          select: { id: true, title: true, status: true },
        })
      : null,
    runsClients(user)
      ? prisma.clientFeedback.findMany({
          where: { readAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, name: true, message: true, client: { select: { name: true, slug: true } } },
        })
      : null,
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

  return NextResponse.json(
    {
      // if the count can't be read, a fresh value each time: the page then
      // refreshes on every tick, as it did before this existed. Who's online
      // travels on its own (the avatars' dots), never reloading the page.
      v: String(writes?.[0]?.n ?? now.getTime()),
      online: online.map((u) => u.name),
      approvals: approvals ?? undefined,
      feedback: feedback?.map((r) => ({ id: r.id, from: r.name, message: r.message.slice(0, 140), client: r.client.name, slug: r.client.slug })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
