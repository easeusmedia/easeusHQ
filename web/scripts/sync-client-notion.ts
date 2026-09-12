/**
 * Pulls a client's real content out of Notion into this app:
 *   - the three editor-workbook pages (Client Information / Editing SOP /
 *     Quality Checklist) -> markdown in client.brandGuidelines / .sop /
 *     .qualityChecklist
 *   - the per-client content database (the episode/video gallery) ->
 *     WorkItem rows, the delivered-work track record
 *
 * Run:  npx tsx scripts/sync-client-notion.ts "<client name>" <contentDbId>
 *
 * One-off per client for now — Notion's per-client databases aren't
 * discoverable by a stable rule, so the content DB id is passed in. Wire
 * this into the Sync button once the ids are recorded on the Client row.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) throw new Error("NOTION_TOKEN not set");

// the database of per-client editor workbooks — one page per client, each
// holding Client Information / Editing SOP / Quality Checklist
const WORKBOOK_DB = "3acb6a20-8044-8028-89dc-faec7fb8aa34";

async function notion(path: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

type RichText = { plain_text: string; href: string | null };
const rt = (a: RichText[] | undefined) => (a ?? []).map((x) => x.plain_text).join("").trim();

/** Notion blocks -> the markdown subset <Markdown> renders. */
async function blocksToMarkdown(blockId: string, depth = 0): Promise<string[]> {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const q: Record<string, unknown> = await notion(
      `blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`
    );
    for (const b of q.results as Record<string, never>[]) {
      const t = b.type as string;
      const v = (b[t] ?? {}) as { rich_text?: RichText[]; cells?: RichText[][]; url?: string };
      const text = rt(v.rich_text);
      const indent = "  ".repeat(depth);

      if (t === "heading_1") lines.push(`## ${text}`);
      else if (t === "heading_2") lines.push(`## ${text}`);
      else if (t === "heading_3") lines.push(`### ${text}`);
      else if (t === "bulleted_list_item" || t === "to_do") lines.push(`${indent}- ${text}`);
      else if (t === "numbered_list_item") lines.push(`${indent}1. ${text}`);
      else if (t === "quote" || t === "callout") { if (text) lines.push(`> ${text}`); }
      else if (t === "divider") lines.push("---");
      else if (t === "table_row") lines.push(`| ${(v.cells ?? []).map((c) => rt(c)).join(" | ")} |`);
      else if (t === "bookmark" || t === "embed") { if (v.url) lines.push(v.url); }
      else if (text) lines.push(text);

      // callouts/toggles wrap most of the real content — recurse, but keep
      // list nesting visible via indentation
      if (b.has_children && t !== "child_page" && t !== "child_database") {
        const nested = t === "bulleted_list_item" || t === "numbered_list_item" || t === "to_do";
        lines.push(...(await blocksToMarkdown(b.id as string, nested ? depth + 1 : depth)));
      }
    }
    cursor = q.has_more ? (q.next_cursor as string) : undefined;
  } while (cursor);
  return lines;
}

async function pageMarkdown(pageId: string) {
  const lines = await blocksToMarkdown(pageId);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function main() {
  const [clientName, contentDbId] = process.argv.slice(2);
  if (!clientName) throw new Error('usage: sync-client-notion.ts "<client name>" [contentDbId]');

  const client = await prisma.client.findFirst({ where: { name: { contains: clientName, mode: "insensitive" } } });
  if (!client) throw new Error(`no client in the app matching "${clientName}"`);
  console.log(`client: ${client.name} (${client.id})`);

  // --- docs -------------------------------------------------------------
  const wb = await notion(`databases/${WORKBOOK_DB}/query`, { page_size: 100 });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const workbook = (wb.results as Record<string, never>[]).find((p) => {
    const title = Object.values(p.properties as Record<string, { type: string; title?: RichText[] }>)
      .find((v) => v.type === "title");
    const name = rt(title?.title);
    return norm(name).includes(norm(clientName)) || norm(clientName).includes(norm(name));
  });

  const docs: Record<string, string> = {};
  if (!workbook) {
    console.log("! no editor workbook page found in Notion — skipping docs");
  } else {
    const children = await notion(`blocks/${workbook.id}/children?page_size=100`);
    for (const c of children.results as Record<string, never>[]) {
      if (c.type !== "child_page") continue;
      const title = ((c.child_page as { title: string }).title ?? "").toLowerCase();
      const field =
        title.includes("client information") ? "brandGuidelines"
        : title.includes("editing sop") || title.includes("sop") ? "sop"
        : title.includes("quality") ? "qualityChecklist"
        : null;
      if (!field) continue;
      docs[field] = await pageMarkdown(c.id as string);
      console.log(`  doc ${field}: ${docs[field].length} chars`);
    }
    if (Object.keys(docs).length) await prisma.client.update({ where: { id: client.id }, data: docs });
  }

  // --- delivered work ---------------------------------------------------
  if (!contentDbId) {
    console.log("no contentDbId passed — skipping work history");
    return;
  }
  let cursor: string | undefined;
  let n = 0;
  do {
    const q = await notion(`databases/${contentDbId}/query`, { page_size: 100, start_cursor: cursor });
    for (const row of q.results as Record<string, never>[]) {
      const props = row.properties as Record<string, { type: string }>;
      const pick = (type: string) => Object.values(props).find((p) => p.type === type);
      const title = rt((pick("title") as { title?: RichText[] })?.title);
      if (!title) continue;

      const statusProp = props.Status as { status?: { name: string }; select?: { name: string } } | undefined;
      const statusName = (statusProp?.status?.name ?? statusProp?.select?.name ?? "").toLowerCase();
      const invoiceProp = props.Invoice as { select?: { name: string }; status?: { name: string } } | undefined;
      const invoice = (invoiceProp?.select?.name ?? invoiceProp?.status?.name ?? "").toLowerCase();
      const link = (props.Link as { url?: string } | undefined)?.url ?? null;
      const batch = rt((props.Batch as { rich_text?: RichText[]; select?: { name: string } } | undefined)?.rich_text)
        || (props.Batch as { select?: { name: string } } | undefined)?.select?.name
        || null;

      const data = {
        clientId: client.id,
        title,
        status: statusName.includes("complete") ? "completed" : "in_progress",
        batch,
        link,
        invoiceStatus: invoice === "paid" || invoice === "unpaid" ? invoice : null,
        completedAt: new Date(row.created_time as string),
      };
      await prisma.workItem.upsert({
        where: { notionPageId: row.id as string },
        create: { ...data, notionPageId: row.id as string },
        update: data,
      });
      n++;
    }
    cursor = q.has_more ? (q.next_cursor as string) : undefined;
  } while (cursor);
  console.log(`  work items synced: ${n}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
