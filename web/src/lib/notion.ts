// Temporary — for testing only, while the team is still creating tasks in
// Notion during the transition. Pulls tasks in from Notion on demand (via
// the "Sync with Notion" button, admin-triggered, never automatic). Delete
// this whole file, the notionPageId column, the button, and the action in
// actions.ts when Notion is retired for real.

const NOTION_VERSION = "2022-06-28";

// The team's shared editing-queue database. Their original ("My assigned
// videos", under Narendra's Workbook) turned out to be a legacy database
// with no "data source" registered on Notion's backend — the newer API
// genuinely cannot read it (confirmed via the database-retrieve endpoint
// returning an empty data_sources array, not a permissions error — sharing
// it every possible way still didn't fix that). Duplicating it produced a
// fresh database object that Notion registers properly, and it already
// covers every editor via its own "Editor" person property, not per-editor
// pages. This is that duplicate's ID. If the team starts a truly new
// database later, update this one ID and the mapping below still applies
// as long as the property names match.
const TASK_DATABASE_ID = "c8fe3e3f-bc0b-47bf-8681-e13b1e1eb62b";

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

export type NotionRow = { id: string; properties: Record<string, NotionProp> };
type NotionProp = { type: string; [key: string]: unknown };

// India has no DST, so a fixed +5:30 offset is enough — same approach as
// formatDate/formatDateTime elsewhere in this app, kept independent here
// since this file has no client-side rendering to worry about matching.
function todayInIST(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10); // YYYY-MM-DD
}

// Scoped to "Editor Queu Date" on or before today — this is a testing-only
// sync button, not a backfill of the team's whole task history, but it
// still needs to catch anything still active from an earlier day (e.g. a
// task queued two days ago that's now sitting in "Sent for Client
// Approval"), not just rows dated exactly today. Notion's own query filter
// does this server-side, so there's no need to fetch everything and filter
// client-side. Future-dated rows (not queued yet) are still excluded.
export async function fetchTaskRows(): Promise<NotionRow[]> {
  const rows: NotionRow[] = [];
  let cursor: string | undefined;
  const filter = { property: "Editor Queu Date", date: { on_or_before: todayInIST() } };
  do {
    const body = await notionFetch(`/databases/${TASK_DATABASE_ID}/query`, {
      method: "POST",
      body: JSON.stringify({ filter, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    rows.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// Notion always marks exactly one property type: "title" — reliable
// regardless of what it's actually called ("Video / Subject" here).
export function getTitleText(properties: Record<string, NotionProp>): string | null {
  for (const prop of Object.values(properties)) {
    if (prop.type === "title") {
      const rich = prop.title as { plain_text: string }[];
      return rich.map((t) => t.plain_text).join("").trim() || null;
    }
  }
  return null;
}

// The database's real property schema (verified directly, not guessed):
//   "Video / Subject" (title), "Status" (status), "Editor" (people),
//   "Raw Links" (url), "Exported Link" (url), "Reference " (url, note the
//   trailing space in the actual name), "Assets" (url), "Editor Queu Date"
// (date) — a leftover typo in their own property name, not mine.
export function getUrl(properties: Record<string, NotionProp>, name: string): string | null {
  return (properties[name]?.url as string | undefined) ?? null;
}

export function getStatusName(properties: Record<string, NotionProp>): string | null {
  const status = properties["Status"]?.status as { name: string } | undefined;
  return status?.name ?? null;
}

export function getFirstPersonName(properties: Record<string, NotionProp>, name: string): string | null {
  const people = properties[name]?.people as { name: string }[] | undefined;
  return people?.[0]?.name ?? null;
}

export function getDate(properties: Record<string, NotionProp>, name: string): Date | null {
  const date = properties[name]?.date as { start: string } | undefined;
  return date ? new Date(date.start) : null;
}
