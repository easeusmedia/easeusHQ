// Brings the Notion performance review (Index → Performance Review) into
// the editors' feedback log, so their record carries on from where it was.
//   node --env-file=.env scripts/run.cjs scripts/import-notion-performance.ts
//
// Each Notion row is a recurring mistake with a flag and, on the newer
// databases, how many times it happened in each week of the month. A row
// with weekly counts becomes one entry per week; one without is a single
// mistake on its date. Safe to run again: rows already brought in are
// skipped.
import { prisma } from "@/lib/prisma";

const DATABASES: Record<string, string> = {
  "Narendra Mehta": "1a21ba619ac8409dabc86e351ab387b4",
  Sparsh: "d28a64675ab34c37a2725a67ac8e2a68",
  "Rounak Jangid": "a1e181aaffed4bc9b267d77609889f83",
};

const FLAG: Record<string, string> = {
  Typos: "Typos",
  "UK/US Spelling": "UK/US spelling",
  Subtitle: "Subtitles",
  Sound: "Sound",
  Typography: "Typography",
  Animation: "Animation",
};

type Prop = { type: string; title?: { plain_text: string }[]; select?: { name: string } | null; date?: { start: string } | null; number?: number | null };
type Row = { id: string; created_time: string; properties: Record<string, Prop> };

async function rows(db: string): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${db}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message);
    out.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return out;
}

(async () => {
  let added = 0;
  for (const [name, db] of Object.entries(DATABASES)) {
    const editor = await prisma.user.findFirst({ where: { name }, select: { id: true } });
    if (!editor) {
      console.log(`No one called ${name} here; skipped.`);
      continue;
    }
    for (const r of await rows(db)) {
      const p = r.properties;
      const body = (p.Feedback?.title ?? []).map((t) => t.plain_text).join("").trim();
      if (!body) continue;
      const day = (p.Date?.date?.start ?? r.created_time).slice(0, 10);
      const category = FLAG[p.Flags?.select?.name ?? ""] ?? "Others";
      const weeks = [1, 2, 3, 4, 5].map((w) => p[`Week-${w}`]?.number ?? null);
      const entries = weeks.some((n) => n)
        ? weeks.flatMap((n, i) =>
            n ? [{ sourceId: `notion:${r.id}:w${i + 1}`, count: n, day: `${day.slice(0, 8)}${String(i * 7 + 1).padStart(2, "0")}` }] : []
          )
        : [{ sourceId: `notion:${r.id}`, count: 1, day }];
      const res = await prisma.performanceEntry.createMany({
        data: entries.map((e) => ({
          editorId: editor.id,
          kind: "mistake",
          category,
          body,
          count: e.count,
          at: new Date(`${e.day}T12:00:00+05:30`),
          source: "notion",
          sourceId: e.sourceId,
          by: "Notion review",
          reviewed: true,
        })),
        skipDuplicates: true,
      });
      added += res.count;
    }
  }
  console.log(`Brought in ${added} entries.`);
  await prisma.$disconnect();
})();
