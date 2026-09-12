import { prisma } from "./prisma";

// Pulls one client's working data out of Notion:
//   - their content database (one page per episode)   -> Project rows
//   - the "Content" database nested in each of those  -> ProjectAsset rows
//   - their editor workbook pages                     -> the client documents
//
// Idempotent: everything is keyed on notionPageId, so re-running updates
// rather than duplicating. Covers aren't copied — Notion's file URLs expire
// within the hour, so they're served live through /api/project-cover.

const WORKBOOK_DB = "3acb6a20-8044-8028-89dc-faec7fb8aa34"; // per-client editor workbooks

type RichText = { plain_text: string };
type Props = Record<string, { type: string } & Record<string, unknown>>;

function token() {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new Error("NOTION_TOKEN is not set on the server.");
  return t;
}

async function notion(path: string, body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Notion ${res.status} on ${path.split("?")[0]}`);
  return res.json();
}

const rt = (a: RichText[] | undefined) => (a ?? []).map((x) => x.plain_text).join("").trim();

function titleOf(props: Props) {
  const t = Object.values(props).find((p) => p.type === "title") as { title?: RichText[] } | undefined;
  return rt(t?.title);
}

function selectName(p: unknown): string | null {
  const v = p as { select?: { name: string }; status?: { name: string } } | undefined;
  return v?.select?.name ?? v?.status?.name ?? null;
}

/** Notion blocks -> the markdown subset <Markdown> renders. */
async function blocksToMarkdown(blockId: string, depth = 0): Promise<string[]> {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const q = await notion(`blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
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

/** The "Content" database sitting inside an episode page, wherever it's nested. */
async function findNestedDb(blockId: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  const kids = await notion(`blocks/${blockId}/children?page_size=100`);
  for (const k of kids.results as Record<string, never>[]) {
    if (k.type === "child_database") return k.id as string;
  }
  for (const k of kids.results as Record<string, never>[]) {
    if (k.has_children && k.type !== "child_page") {
      const found = await findNestedDb(k.id as string, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export type ImportResult = { projects: number; assets: number; docs: number; error?: string };

export async function importClientFromNotion(clientId: string): Promise<ImportResult> {
  const empty: ImportResult = { projects: 0, assets: 0, docs: 0 };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { projects: { take: 1, orderBy: { createdAt: "asc" } } },
  });
  if (!client) return { ...empty, error: "Client not found." };

  const result: ImportResult = { ...empty };

  // --- the four documents, from the client's editor workbook -------------
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const wb = await notion(`databases/${WORKBOOK_DB}/query`, { page_size: 100 });
  const workbook = (wb.results as Record<string, never>[]).find((p) => {
    const name = titleOf(p.properties as Props);
    return !!name && (norm(name).includes(norm(client.name)) || norm(client.name).includes(norm(name)));
  });

  if (workbook) {
    const docs: Record<string, string> = {};
    const children = await notion(`blocks/${workbook.id}/children?page_size=100`);
    for (const c of children.results as Record<string, never>[]) {
      if (c.type !== "child_page") continue;
      const title = ((c.child_page as { title: string }).title ?? "").toLowerCase();
      const field =
        title.includes("client information") ? "brandGuidelines"
        : title.includes("sop") ? "sop"
        : title.includes("quality") ? "qualityChecklist"
        : title.includes("meeting") ? "meetingNotes"
        : null;
      if (!field) continue;
      const md = await pageMarkdown(c.id as string);
      if (md) { docs[field] = md; result.docs++; }
    }
    if (result.docs > 0) await prisma.client.update({ where: { id: client.id }, data: docs });
  }

  // --- projects and their files -----------------------------------------
  if (!client.notionContentDbId) {
    return result.docs > 0
      ? result
      : { ...result, error: "No Notion content database linked for this client yet." };
  }

  const projectType = client.projects[0]?.type ?? "Podcast";

  // Each project needs a handful of round trips to Notion (its nested
  // content database has to be found, then read). Serially that's a minute
  // for a client with a year of episodes — past what a serverless function
  // will sit still for. Four at a time keeps it well inside the limit
  // without hammering Notion's rate limit.
  const rows: Record<string, never>[] = [];
  let cursor: string | undefined;
  do {
    const q = await notion(`databases/${client.notionContentDbId}/query`, { page_size: 100, start_cursor: cursor });
    rows.push(...(q.results as Record<string, never>[]));
    cursor = q.has_more ? (q.next_cursor as string) : undefined;
  } while (cursor);

  for (let i = 0; i < rows.length; i += 4) {
    const counts = await Promise.all(rows.slice(i, i + 4).map(async (row) => {
      const props = row.properties as Props;
      const name = titleOf(props);
      if (!name) return 0;

      const statusName = (selectName(props.Status) ?? "").toLowerCase();
      const invoice = (selectName(props.Invoice) ?? "").toLowerCase();

      const data = {
        clientId: client.id,
        name,
        type: projectType,
        status: statusName.includes("complete") ? "completed" : "in_progress",
        driveLink: (props.Link as { url?: string } | undefined)?.url ?? null,
        invoiceStatus: invoice === "paid" || invoice === "unpaid" ? invoice : null,
        completedAt: new Date(row.created_time as string),
      };
      const project = await prisma.project.upsert({
        where: { notionPageId: row.id as string },
        create: { ...data, notionPageId: row.id as string },
        update: data,
      });
      result.projects++;

      const assetDb = await findNestedDb(row.id as string);
      if (!assetDb) return 0;
      const assets = await notion(`databases/${assetDb}/query`, { page_size: 100 });
      let order = 0;
      let made = 0;
      for (const a of assets.results as Record<string, never>[]) {
        const aProps = a.properties as Props;
        const aName = titleOf(aProps);
        if (!aName) continue;
        const aData = {
          projectId: project.id,
          name: aName,
          contentType: selectName(aProps["Content Type"]) ?? "Misc.",
          link: (aProps.Link as { url?: string } | undefined)?.url ?? null,
          sortOrder: order++,
        };
        await prisma.projectAsset.upsert({
          where: { notionPageId: a.id as string },
          create: { ...aData, notionPageId: a.id as string },
          update: aData,
        });
        made++;
      }
      return made;
    }));
    result.assets += counts.reduce((a, b) => a + b, 0);
  }

  return result;
}

/** The current signed URL for a Notion page's cover — they expire hourly. */
export async function notionCoverUrl(notionPageId: string): Promise<string | null> {
  const page = await notion(`pages/${notionPageId}`);
  const cover = page.cover as { file?: { url: string }; external?: { url: string } } | null;
  return cover?.file?.url ?? cover?.external?.url ?? null;
}
