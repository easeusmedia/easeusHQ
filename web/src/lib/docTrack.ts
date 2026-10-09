import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { folder, parentFolderId, resumableUploadUrl } from "./drive";
import { LEADS } from "./mailReport";

// Tracked PDFs (Mailsuite's PDF analytics, rebuilt). A PDF is kept in Google
// Drive ("Tracked PDFs" in the app's folder) and sent as a link to its
// viewer, /d/[id], which tells us here which page is on screen and for how
// long. The mail tracker adds the email to the link (?m=), so each reading
// belongs to the email (and recipient) it came from.

export const DOC_ID = /^[A-Za-z0-9_-]{12,40}$/;
export const newDocId = () => randomBytes(12).toString("base64url");

// where the browser sends the file itself, straight to Drive
export async function docUploadUrl(file: { name: string; size: number }, origin: string): Promise<string> {
  const into = await folder("Tracked PDFs", await parentFolderId());
  return resumableUploadUrl({ name: file.name, type: "application/pdf", size: file.size }, into.id, origin);
}

// A reading starts. One of us (signed in to the app) is kept but not counted.
export async function startView(docId: string, input: { mailId?: unknown; pages?: unknown }, self: boolean, agent: string | null): Promise<string | null> {
  if (!DOC_ID.test(docId)) return null;
  const doc = await prisma.trackedDoc.findUnique({ where: { id: docId }, select: { pages: true } });
  if (!doc) return null;
  const mailId = typeof input.mailId === "string" && DOC_ID.test(input.mailId) ? input.mailId : null;
  const known = mailId ? await prisma.trackedMail.findUnique({ where: { id: mailId }, select: { id: true } }) : null;
  const pages = Number(input.pages);
  if (!doc.pages && Number.isInteger(pages) && pages > 0 && pages < 5000) await prisma.trackedDoc.update({ where: { id: docId }, data: { pages } });
  const view = await prisma.docView.create({ data: { docId, mailId: known?.id ?? null, self, agent: agent?.slice(0, 200) }, select: { id: true } });
  return view.id;
}

// Time on the page on screen, a few seconds at a time; a reading left
// open for hours stops counting after two
export async function tick(viewId: string, page: unknown, seconds: unknown) {
  const p = Number(page);
  const s = Math.min(15, Math.max(0, Math.round(Number(seconds))));
  if (!Number.isInteger(p) || p < 1 || p > 5000 || !s) return;
  await prisma.$executeRaw`
    update "DocView" set pages = jsonb_set(pages, array[${String(p)}], to_jsonb(coalesce((pages ->> ${String(p)})::int, 0) + ${s})),
      seconds = seconds + ${s}, "lastAt" = now()
    where id = ${viewId} and "startedAt" > now() - interval '2 hours'`;
}

export async function markDownloaded(viewId: string) {
  await prisma.docView.updateMany({ where: { id: viewId }, data: { downloaded: true } });
}

// ---------- the PDFs page ----------

export type DocRow = { id: string; name: string; pages: number; createdAt: string; sends: number; viewedSends: number; views: number; seconds: number; downloads: number; lastAt: string | null };

export async function docs(alias: string | null): Promise<DocRow[]> {
  // sent to leads only (lib/mailReport.ts), and one alias or all
  const byAlias = Prisma.sql`and t."to" in ${LEADS} ${alias ? Prisma.sql`and t."from" = ${alias}` : Prisma.empty}`;
  const rows = await prisma.$queryRaw<(Omit<DocRow, "createdAt" | "lastAt"> & { createdAt: Date; lastAt: Date | null })[]>`
    select d.id, d.name, d.pages, d."createdAt",
      (select count(*) from "TrackedMail" t where d.id = any(t.docs) ${byAlias})::int sends,
      (select count(*) from "TrackedMail" t where d.id = any(t.docs) ${byAlias}
         and exists (select 1 from "DocView" v2 where v2."mailId" = t.id and v2."docId" = d.id and not v2.self))::int "viewedSends",
      count(v.id) filter (where not v.self)::int views, coalesce(sum(v.seconds) filter (where not v.self), 0)::int seconds,
      count(v.id) filter (where not v.self and v.downloaded)::int downloads, max(v."startedAt") filter (where not v.self) "lastAt"
    from "TrackedDoc" d left join "DocView" v on v."docId" = d.id and v."mailId" in (select t.id from "TrackedMail" t where true ${byAlias})
    group by d.id order by d."createdAt" desc`;
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), lastAt: r.lastAt?.toISOString() ?? null }));
}

// One PDF: seconds on each page over every reading, and each reading
export async function docDetail(id: string) {
  const [doc, pages, views] = await Promise.all([
    prisma.trackedDoc.findUnique({ where: { id }, select: { id: true, name: true, pages: true, createdAt: true } }),
    prisma.$queryRaw<{ page: number; seconds: number }[]>`
      select p.key::int page, sum(p.value::int)::int seconds from "DocView" v, jsonb_each_text(v.pages) p
      where v."docId" = ${id} and not v.self and v."mailId" in (select t.id from "TrackedMail" t where t."to" in ${LEADS}) group by 1 order by 1`,
    prisma.$queryRaw<{ id: string; to: string | null; startedAt: Date; seconds: number; visited: number; downloaded: boolean }[]>`
      select v.id, t."to", v."startedAt", v.seconds, (select count(*) from jsonb_each_text(v.pages) p where p.value::int >= 2)::int visited, v.downloaded
      from "DocView" v left join "TrackedMail" t on t.id = v."mailId"
      where v."docId" = ${id} and not v.self and t."to" in ${LEADS} order by v."startedAt" desc limit 100`,
  ]);
  if (!doc) return null;
  return { ...doc, createdAt: doc.createdAt.toISOString(), pageSeconds: pages, views: views.map((v) => ({ ...v, startedAt: v.startedAt.toISOString() })) };
}
