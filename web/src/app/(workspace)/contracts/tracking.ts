import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { agreementName, readAdobeMail, withDefaults, type SignEvent } from "@/lib/contract";
import { gmailAccount, mailAttachment, readMail, searchMail } from "@/lib/gmail";

// Following contracts sent through Acrobat, from the emails Adobe sends
// easeus.media@gmail.com: "… has been sent out for signature to …" marks one
// sent, "… is Signed and Filed!" marks it signed and brings the signed PDF
// with it. Nothing to press — each contract page (and the list) checks.

export type TrackedEvent = SignEvent & { id: string; at: string };

// ponytail: an in-memory throttle per server instance; a shared timestamp if
// Gmail's quota ever complains
const lastRun = new Map<string, number>();

export async function trackContracts(onlyId?: string, force = false): Promise<void> {
  const key = onlyId ?? "all";
  if (!force && Date.now() - (lastRun.get(key) ?? 0) < 60_000) return;
  lastRun.set(key, Date.now());
  if ((await gmailAccount()) === null) return;

  const contracts = await prisma.contract.findMany({
    where: {
      approvedAt: { not: null },
      ...(onlyId ? { id: onlyId } : {}),
      // waiting on signatures — or marked signed by hand and still
      // missing its signed copy and steps
      OR: [{ status: { in: ["approved", "sent"] } }, { status: "signed", signedPdf: null }],
    },
  });
  if (!contracts.length) return;
  // which already hold their signed copy (the file itself stays in the database)
  const filed = new Set(
    (await prisma.contract.findMany({ where: { id: { in: contracts.map((c) => c.id) }, signedPdf: { not: null } }, select: { id: true } })).map((c) => c.id),
  );

  // one search covers them all: Adobe's mail since the earliest approval
  const since = Math.floor(Math.min(...contracts.map((c) => c.approvedAt!.getTime())) / 1000) - 86_400;
  const ids = await searchMail(`from:adobesign@adobesign.com after:${since}`);
  const mail = (await Promise.all(ids.map((id) => readMail(id)))).sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const c of contracts) {
    const details = withDefaults(c.details);
    const name = agreementName(details, c.name);
    const events = ((c.events as TrackedEvent[] | null) ?? []).slice();
    const seen = new Set(events.map((e) => e.id));
    let signedPdf: Buffer | null = null;
    for (const m of mail) {
      if (seen.has(m.id) || m.at < c.approvedAt!) continue;
      const event = readAdobeMail(m.subject, m.snippet, name);
      if (!event) continue;
      events.push({ ...event, id: m.id, at: m.at.toISOString() });
      if (event.kind === "completed" && !filed.has(c.id)) {
        // the signed copy comes attached to Adobe's "Signed and Filed" email
        const full = await readMail(m.id, true);
        const pdf = full.files.find((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
        if (pdf) signedPdf = await mailAttachment(m.id, pdf.attachmentId);
      }
    }
    if (events.length === ((c.events as TrackedEvent[] | null) ?? []).length) continue;

    const sent = events.find((e) => e.kind !== "cancelled" && e.kind !== "expired" && e.kind !== "undeliverable");
    const done = events.find((e) => e.kind === "completed");
    const status = done ? "signed" : sent && c.status === "approved" ? "sent" : c.status;
    await prisma.contract.update({
      where: { id: c.id },
      data: {
        events,
        status,
        ...(sent && !c.sentAt ? { sentAt: new Date(sent.at) } : {}),
        ...(done ? { signedAt: new Date(done.at) } : {}),
        ...(signedPdf ? { signedPdf: new Uint8Array(signedPdf) } : {}),
        // dated the day it went out, if no date was set
        ...(sent && !details.signingDate ? { details: { ...details, signingDate: indiaDay(new Date(sent.at)) } } : {}),
      },
    });
  }
}
