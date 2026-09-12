/**
 * Rebuilds the live task board from Notion's Editing Queue.
 *
 *   npx tsx scripts/restore-tasks-from-notion.ts          # dry run, prints what it would do
 *   npx tsx scripts/restore-tasks-from-notion.ts --write  # actually creates them
 *
 * Only restores rows whose Notion status is one of RESTORE_STATUSES —
 * deliberately NOT "Final export ready" or "Delivered and uploaded", which
 * between them cover ~88 old rows that have never been in this app and
 * must not be backfilled into it (see the 302-row import incident).
 *
 * Idempotent: a row already present by notionPageId is skipped.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) throw new Error("NOTION_TOKEN not set");

const TASK_DATABASE_ID = "c8fe3e3f-bc0b-47bf-8681-e13b1e1eb62b";

// the stages that describe work actually in flight right now
const RESTORE_STATUSES: Record<string, string> = {
  "sent for client approval": "sent_for_client_approval",
  "sent for approval": "sent_for_approval",
  "revision requested": "revision_requested",
  editing: "editing",
  queued: "queued",
};

type RichText = { plain_text: string };

async function main() {
  const write = process.argv.includes("--write");

  const rows: Record<string, never>[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${TASK_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    const body = await res.json();
    rows.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);

  const clients = await prisma.client.findMany({ include: { projects: { orderBy: { createdAt: "asc" } } } });
  const existing = new Set(
    (await prisma.task.findMany({ where: { notionPageId: { not: null } }, select: { notionPageId: true } })).map(
      (t) => t.notionPageId
    )
  );

  let restored = 0;
  let skipped = 0;
  for (const row of rows) {
    const props = row.properties as Record<string, { type: string; title?: RichText[]; status?: { name: string }; select?: { name: string } }>;
    const title = Object.values(props).find((p) => p.type === "title");
    const name = (title?.title ?? []).map((x) => x.plain_text).join("").trim();
    if (!name) continue;

    const statusProp = Object.values(props).find((p) => p.type === "status" || (p.type === "select" && p.select));
    const notionStatus = (statusProp?.status?.name ?? statusProp?.select?.name ?? "").toLowerCase();
    const status = RESTORE_STATUSES[notionStatus];
    if (!status) continue;
    if (existing.has(row.id as string)) {
      skipped++;
      continue;
    }

    // client is the prefix before " - " in the title, same rule the live
    // sync uses ("CL - Energy - Katie" -> Courageous Leaders)
    const prefix = name.split(" - ")[0].trim().toLowerCase();
    const client = clients.find((c) => {
      const initials = c.name.split(/\s+/).map((w) => w[0]).join("").toLowerCase();
      return initials === prefix || c.name.toLowerCase().includes(prefix);
    });
    if (!client || client.projects.length === 0) {
      console.log(`  ? no client match for "${name}" (prefix "${prefix}") — skipped`);
      continue;
    }

    console.log(`  ${write ? "restore" : "would restore"}: ${status.padEnd(26)} ${name}  [${client.name}]`);
    if (write) {
      await prisma.task.create({
        data: {
          title: name,
          status: status as never,
          projectId: client.projects[0].id,
          notionPageId: row.id as string,
        },
      });
    }
    restored++;
  }

  console.log(`\n${write ? "restored" : "would restore"} ${restored} tasks (${skipped} already present)`);
  if (!write) console.log("dry run — pass --write to apply");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
