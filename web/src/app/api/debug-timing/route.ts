import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// TEMPORARY: how long the database takes from the server. Numbers only.
export const dynamic = "force-dynamic";

export async function GET() {
  const ms = async (f: () => Promise<unknown>) => {
    const t = performance.now();
    await f();
    return Math.round((performance.now() - t) * 10) / 10;
  };
  const first = await ms(() => prisma.$queryRaw`select 1`);
  const seq: number[] = [];
  for (let i = 0; i < 5; i++) seq.push(await ms(() => prisma.$queryRaw`select 1`));
  const par5 = await ms(() => Promise.all([1, 2, 3, 4, 5].map(() => prisma.$queryRaw`select 1`)));
  const users = await ms(() => prisma.user.findMany({ select: { id: true, name: true, avatarUrl: true, lastSeenAt: true } }));
  const clientsFull = await ms(() =>
    prisma.client.findMany({ include: { tags: true, deliverables: true, projects: { include: { _count: { select: { assets: true, tasks: true } } } } } })
  );
  const tasks = await ms(() => prisma.task.findMany({ include: { project: { include: { client: true } }, assignee: true } }));
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? null, first, seq, par5, users, clientsFull, tasks });
}
