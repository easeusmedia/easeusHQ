/**
 * Pulls a client's real content out of Notion into this app:
 *   - the three editor-workbook pages (Client Information / Editing SOP /
 *     Quality Checklist) -> markdown in client.brandGuidelines / .sop /
 *     .qualityChecklist
 *   - the per-client content database (one page per episode/video) ->
 *     Project rows, with the page cover saved to public/covers
 *   - the "Content" database nested inside each of those pages (the reels,
 *     the long-form cut, thumbnails, YT copy) -> ProjectAsset rows
 *
 * Run:  npx tsx scripts/sync-client-notion.ts "<client name>" <contentDbId>
 *
 * One-off per client for now — Notion's per-client databases aren't
 * discoverable by a stable rule, so the content DB id is passed in. Wire
 * this into the Sync button once the ids are recorded on the Client row.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) throw new Error("NOTION_TOKEN not set");

// the database of per-client editor workbooks — one page per client, each
// holding Client Information / Editing SOP / Quality Checklist
const WORKBOOK_DB = "3acb6a20-8044-8028-89dc-faec7fb8aa34";
const COVER_DIR = join(process.cwd(), "public", "covers");

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

      if (t === "heading_1" || t === "heading_2") lines.push(`## ${text}`);
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
  return (await blocksToMarkdown(pageId)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Notion's file URLs are signed and expire within the hour, so a cover has
 * to be copied locally to survive. Downscaled with `sips`, which ships with
 * macOS — a full-size Notion cover is several MB, and these are rendered as
 * small cards.
 */
async function saveCover(url: string, id: string): Promise<string | null> {
  try {
    mkdirSync(COVER_DIR, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) return null;
    const tmp = join(COVER_DIR, `${id}.tmp`);
    const out = join(COVER_DIR, `${id}.jpg`);
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    execFileSync("sips", ["-Z", "800", "-s", "format", "jpeg", "-s", "formatOptions", "70", tmp, "--out", out], {
      stdio: "ignore",
    });
    rmSync(tmp, { force: true });
    console.log(`    cover ${(statSync(out).size / 1024).toFixed(0)}kb`);
    return `/covers/${id}.jpg`;
  } catch {
    return null;
  }
}

type Props = Record<string, { type: string } & Record<string, never>>;
const propVal = (props: Props, name: string) => props[name] as unknown as Record<string, never> | undefined;

function selectName(p: unknown): string | null {
  const v = p as { select?: { name: string }; status?: { name: string } } | undefined;
  return v?.select?.name ?? v?.status?.name ?? null;
}

async function main() {
  const [clientName, contentDbId] = process.argv.slice(2);
  if (!clientName) throw new Error('usage: sync-client-notion.ts "<client name>" [contentDbId]');

  const client = await prisma.client.findFirst({
    where: { name: { contains: clientName, mode: "insensitive" } },
    include: { projects: { take: 1 } },
  });
  if (!client) throw new Error(`no client in the app matching "${clientName}"`);
  const projectType = client.projects[0]?.type ?? "podcast";
  console.log(`client: ${client.name} (${client.id})`);

  // --- docs -------------------------------------------------------------
  const wb = await notion(`databases/${WORKBOOK_DB}/query`, { page_size: 100 });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const workbook = (wb.results as Record<string, never>[]).find((p) => {
    const title = Object.values(p.properties as Record<string, { type: string; title?: RichText[] }>).find((v) => v.type === "title");
    const name = rt(title?.title);
    return norm(name).includes(norm(clientName)) || norm(clientName).includes(norm(name));
  });

  if (!workbook) {
    console.log("! no editor workbook page found in Notion — skipping docs");
  } else {
    const docs: Record<string, string> = {};
    const children = await notion(`blocks/${workbook.id}/children?page_size=100`);
    for (const c of children.results as Record<string, never>[]) {
      if (c.type !== "child_page") continue;
      const title = ((c.child_page as { title: string }).title ?? "").toLowerCase();
      const field =
        title.includes("client information") ? "brandGuidelines"
        : title.includes("sop") ? "sop"
        : title.includes("quality") ? "qualityChecklist"
        : null;
      if (!field) continue;
      docs[field] = await pageMarkdown(c.id as string);
      console.log(`  doc ${field}: ${docs[field].length} chars`);
    }
    if (Object.keys(docs).length) await prisma.client.update({ where: { id: client.id }, data: docs });
  }

  // --- projects ---------------------------------------------------------
  if (!contentDbId) {
    console.log("no contentDbId passed — skipping projects");
    return;
  }
  let cursor: string | undefined;
  let nProjects = 0;
  let nAssets = 0;
  do {
    const q = await notion(`databases/${contentDbId}/query`, { page_size: 100, start_cursor: cursor });
    for (const row of q.results as Record<string, never>[]) {
      const props = row.properties as Props;
      const titleProp = Object.values(props).find((p) => p.type === "title") as { title?: RichText[] } | undefined;
      const name = rt(titleProp?.title);
      if (!name) continue;

      const statusName = (selectName(propVal(props, "Status")) ?? "").toLowerCase();
      const invoice = (selectName(propVal(props, "Invoice")) ?? "").toLowerCase();
      const link = (propVal(props, "Link") as { url?: string } | undefined)?.url ?? null;
      const completedAt = new Date(row.created_time as string);

      const data = {
        clientId: client.id,
        name,
        type: projectType,
        status: statusName.includes("complete") ? "completed" : "in_progress",
        driveLink: link,
        invoiceStatus: invoice === "paid" || invoice === "unpaid" ? invoice : null,
        completedAt,
      };
      const project = await prisma.project.upsert({
        where: { notionPageId: row.id as string },
        create: { ...data, notionPageId: row.id as string },
        update: data,
      });
      nProjects++;
      console.log(`  project: ${name}`);

      const cover = (row.cover as { file?: { url: string }; external?: { url: string } } | null) ?? null;
      const coverUrl = cover?.file?.url ?? cover?.external?.url;
      if (coverUrl) {
        const saved = await saveCover(coverUrl, project.id);
        if (saved) await prisma.project.update({ where: { id: project.id }, data: { coverUrl: saved } });
      }

      // the page's nested "Content" database holds what the project produced
      const blocks = await notion(`blocks/${row.id}/children?page_size=100`);
      const findDb = async (id: string): Promise<string | null> => {
        const kids = await notion(`blocks/${id}/children?page_size=100`);
        for (const k of kids.results as Record<string, never>[]) {
          if (k.type === "child_database") return k.id as string;
          if (k.has_children) {
            const found = await findDb(k.id as string);
            if (found) return found;
          }
        }
        return null;
      };
      let assetDb: string | null = null;
      for (const b of blocks.results as Record<string, never>[]) {
        if (b.type === "child_database") { assetDb = b.id as string; break; }
        if (b.has_children) {
          assetDb = await findDb(b.id as string);
          if (assetDb) break;
        }
      }
      if (!assetDb) continue;

      const assets = await notion(`databases/${assetDb}/query`, { page_size: 100 });
      let order = 0;
      for (const a of assets.results as Record<string, never>[]) {
        const aProps = a.properties as Props;
        const aTitle = Object.values(aProps).find((p) => p.type === "title") as { title?: RichText[] } | undefined;
        const aName = rt(aTitle?.title);
        if (!aName) continue;
        const aData = {
          projectId: project.id,
          name: aName,
          contentType: selectName(propVal(aProps, "Content Type")) ?? "Misc.",
          link: (propVal(aProps, "Link") as { url?: string } | undefined)?.url ?? null,
          sortOrder: order++,
        };
        await prisma.projectAsset.upsert({
          where: { notionPageId: a.id as string },
          create: { ...aData, notionPageId: a.id as string },
          update: aData,
        });
        nAssets++;
      }
    }
    cursor = q.has_more ? (q.next_cursor as string) : undefined;
  } while (cursor);
  console.log(`\nsynced ${nProjects} projects, ${nAssets} assets`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
