// A project's cover from its Notion page. Covers aren't copied: Notion's
// file URLs expire within the hour, so they're served live through
// /api/project-cover. (The rest of the Notion client import was retired.)

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

/** The current signed URL for a Notion page's cover — they expire hourly. */
export async function notionCoverUrl(notionPageId: string): Promise<string | null> {
  const page = await notion(`pages/${notionPageId}`);
  const cover = page.cover as { file?: { url: string }; external?: { url: string } } | null;
  return cover?.file?.url ?? cover?.external?.url ?? null;
}
