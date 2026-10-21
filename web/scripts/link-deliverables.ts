// One-off (21 Oct 2026): link the tasks already on projects to their
// placeholders, the way every task is linked from now on (lib/deliverableLink),
// and fill each placeholder whose task is delivered with its Drive link.
//   node --env-file=.env scripts/run.cjs scripts/link-deliverables.ts [--dry] [--live]
// --dry shows what it would do and writes nothing. --live: the live database.

import "./live";

async function main() {
  const dry = process.argv.includes("--dry");
  const { prisma } = await import("@/lib/prisma");
  const { linkDeliverables } = await import("@/lib/deliverableLink");
  const { pickSlot, typesOf } = await import("@/lib/deliverableMatch");
  try {
    // client work on projects that have placeholders, oldest due first, so
    // earlier work takes the earlier slots
    // a preview can run before the column exists on live (then nothing is linked yet)
    const hasColumn = (await prisma.$queryRaw<{ n: number }[]>`select count(*)::int n from information_schema.columns where table_name = 'ProjectAsset' and column_name = 'taskId'`)[0].n > 0;
    if (!hasColumn && !dry) throw new Error("Push the schema first (ProjectAsset.taskId).");
    const projects = await prisma.project.findMany({
      where: { assets: { some: {} } },
      select: {
        id: true,
        name: true,
        client: { select: { name: true } },
        assets: { select: { id: true, name: true, contentType: true, dueDate: true, sortOrder: true, link: true, ...(hasColumn ? { taskId: true } : {}) } },
        tasks: {
          where: { internal: false },
          select: { id: true, title: true, status: true, driveLink: true, tags: { select: { name: true } } },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    let linked = 0, filled = 0;
    for (const p of projects) {
      const slots = p.assets.map((a) => ({ ...a, taskId: ("taskId" in a ? a.taskId : null) as string | null, due: a.dueDate?.toISOString().slice(0, 10) ?? null }));
      const lines: string[] = [];
      for (const t of p.tasks) {
        const types = typesOf(t.tags.map((g) => g.name), t.title);
        if (!types.length) continue;
        const delivered = t.status === "delivered_and_uploaded" && !!t.driveLink;
        // as linkDeliverables does without "delivering": a link only into an
        // empty placeholder, and no new placeholders
        const s = pickSlot({ id: t.id, title: t.title, types, driveLink: t.driveLink }, slots);
        if (!s) continue;
        const fresh = s.taskId !== t.id;
        s.taskId = t.id;
        if (delivered && !s.link) {
          s.link = t.driveLink;
          filled++;
          lines.push(`  ${t.title} -> ${s.name}  (link filled)`);
        } else if (fresh) lines.push(`  ${t.title} -> ${s.name}`);
        if (fresh) linked++;
      }
      if (lines.length) console.log(`${p.client.name} · ${p.name}\n${lines.join("\n")}`);
      if (!dry) await linkDeliverables(p.tasks.map((t) => t.id));
    }
    console.log(`\n${dry ? "Would link" : "Linked"} ${linked} tasks and fill ${filled} placeholders with their Drive link.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
