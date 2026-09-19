/**
 * Pulls each project's Notion page cover into public/covers and points the
 * project at it. Covers are what makes a client's Projects grid readable at
 * a glance, and only Courageous Leaders had them — this fills in the rest.
 *
 * Run:  node --env-file=.env scripts/run.cjs scripts/fetch-covers.ts [--all] ["Client name"]
 *   --all          re-fetch covers that are already saved, not just missing ones
 *   "Client name"  just that client (default: every current client)
 *
 * Notion's file URLs are signed and expire within the hour, so the image has
 * to be copied locally to survive; `sips` (ships with macOS) downscales it,
 * since a full-size Notion cover is several MB and these render as thumbnails.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TOKEN = process.env.NOTION_TOKEN;
if (!TOKEN) throw new Error("NOTION_TOKEN not set");

const COVER_DIR = join(process.cwd(), "public", "covers");
const args = process.argv.slice(3); // argv[2] is this script, passed by run.cjs
const refreshAll = args.includes("--all");
const onlyClient = args.find((a) => !a.startsWith("--"));

async function notionPage(id: string) {
  const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28" },
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.json())?.message ?? ""}`);
  return res.json();
}

async function saveCover(url: string, id: string): Promise<string | null> {
  try {
    mkdirSync(COVER_DIR, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) return null;
    const tmp = join(COVER_DIR, `${id}.tmp`);
    const out = join(COVER_DIR, `${id}.jpg`);
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    // same size/quality the per-client importer uses, so every cover matches
    execFileSync("sips", ["-Z", "800", "-s", "format", "jpeg", "-s", "formatOptions", "70", tmp, "--out", out], {
      stdio: "ignore",
    });
    rmSync(tmp, { force: true });
    return `/covers/${id}.jpg`;
  } catch {
    return null;
  }
}

const clients = await prisma.client.findMany({
  where: { status: "current", ...(onlyClient ? { name: onlyClient } : {}) },
  select: { name: true, projects: { select: { id: true, name: true, type: true, notionPageId: true, coverUrl: true } } },
  orderBy: { name: "asc" },
});

for (const client of clients) {
  const todo = client.projects.filter((p) => p.notionPageId && (refreshAll || !p.coverUrl));
  console.log(`\n${client.name}: ${todo.length} to fetch (${client.projects.length} projects)`);
  let saved = 0;
  const problems: string[] = [];

  for (const project of todo) {
    const label = project.name || project.type;
    try {
      const page = await notionPage(project.notionPageId!);
      const cover = (page.cover as { file?: { url: string }; external?: { url: string } } | null) ?? null;
      const url = cover?.file?.url ?? cover?.external?.url;
      if (!url) {
        problems.push(`${label}: no cover set in Notion`);
        continue;
      }
      const path = await saveCover(url, project.id);
      if (!path) {
        problems.push(`${label}: couldn't download the image`);
        continue;
      }
      await prisma.project.update({ where: { id: project.id }, data: { coverUrl: path } });
      saved++;
      console.log(`  ✓ ${label} (${(statSync(join(COVER_DIR, `${project.id}.jpg`)).size / 1024).toFixed(0)}kb)`);
    } catch (err) {
      problems.push(`${label}: ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((r) => setTimeout(r, 350)); // Notion allows ~3 requests a second
  }

  console.log(`  saved ${saved}${problems.length ? `, ${problems.length} without one:` : ""}`);
  problems.forEach((p) => console.log(`    – ${p}`));
}

await prisma.$disconnect();
