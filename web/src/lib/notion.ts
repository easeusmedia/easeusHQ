// Temporary — for testing only, while the team is still creating tasks in
// Notion during the transition. Pulls tasks in from Notion on demand (via
// the "Sync with Notion" button, admin-triggered, never automatic). Delete
// this whole file, the notionPageId column, the button, and the action in
// actions.ts when Notion is retired for real.

const NOTION_VERSION = "2022-06-28";
const ROOT_PAGE_ID = "143b6a20-8044-8085-a32b-c73648b5f3c4"; // "Editors's Workspace"

function token(): string {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new Error("NOTION_TOKEN isn't set.");
  return t;
}

async function notionFetch(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? `Notion API error (${res.status})`);
  return body;
}

type NotionDatabaseRef = { databaseId: string; editorPageTitle: string };

// Walks the workspace hub page looking for every inline database nested
// under it, tagging each with the nearest enclosing page's title (that's
// how we infer "whose" database it is — "Narendra's Workbook" contains
// Narendra's — rather than needing a specific Notion property for it).
// Bounded depth/node count since this is a live tree walk, not a fixed list.
export async function findTaskDatabases(): Promise<NotionDatabaseRef[]> {
  const found: NotionDatabaseRef[] = [];
  let visited = 0;

  async function walk(blockId: string, nearestPageTitle: string, depth: number) {
    if (depth > 6 || visited > 200) return;
    const { results } = await notionFetch(`/blocks/${blockId}/children?page_size=100`);
    for (const block of results) {
      visited++;
      if (block.type === "child_database") {
        found.push({ databaseId: block.id, editorPageTitle: nearestPageTitle });
      } else if (block.type === "child_page") {
        await walk(block.id, block.child_page.title as string, depth + 1);
      } else if (block.has_children) {
        await walk(block.id, nearestPageTitle, depth + 1);
      }
    }
  }

  await walk(ROOT_PAGE_ID, "Editors's Workspace", 0);
  return found;
}

export type NotionRow = { id: string; properties: Record<string, unknown> };

export async function fetchDatabaseRows(databaseId: string): Promise<NotionRow[]> {
  const rows: NotionRow[] = [];
  let cursor: string | undefined;
  do {
    const body = await notionFetch(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    rows.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// Notion always marks exactly one property type: "title", regardless of
// what it's actually called ("Name", "Task", whatever) — this is the one
// field extraction that's reliable without knowing the exact schema.
export function getTitleText(properties: Record<string, unknown>): string | null {
  for (const prop of Object.values(properties) as { type: string; title?: { plain_text: string }[] }[]) {
    if (prop.type === "title") {
      return (prop.title ?? []).map((t) => t.plain_text).join("").trim() || null;
    }
  }
  return null;
}

// Best-effort match on a named property by substring on the property name
// (case-insensitive) — everything below title is a guess until the actual
// database schema is visible (blocked on Notion sharing as of writing this).
export function getTextByNameGuess(properties: Record<string, unknown>, nameContains: RegExp): string | null {
  for (const [name, prop] of Object.entries(properties) as [string, Record<string, unknown>][]) {
    if (!nameContains.test(name)) continue;
    const type = prop.type as string;
    if (type === "rich_text") {
      const arr = prop.rich_text as { plain_text: string }[];
      const text = arr.map((t) => t.plain_text).join("").trim();
      if (text) return text;
    } else if (type === "select" && prop.select) {
      return (prop.select as { name: string }).name;
    } else if (type === "url" && prop.url) {
      return prop.url as string;
    }
  }
  return null;
}
