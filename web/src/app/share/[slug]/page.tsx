import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ChevronDown, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES, type TaskStatus } from "@/lib/workflow";
import { batchPayment, invoiceBatches, type Payment } from "@/lib/invoiceBatches";
import { clientLogoSrc } from "@/lib/photos";
import { normalizeUrl } from "@/lib/links";
import { Markdown } from "../../(workspace)/clients/Markdown";
import { FeedbackForm } from "./FeedbackForm";

// A client's own page, shown at /clients/<name> to anyone who isn't signed
// in (see proxy.ts) — only while ops has sharing switched on. Read-only:
// the work in progress, what's been delivered and its files, the plan, and
// every document prepared for them, plus a way to send the team feedback.
// Never the team's side of things: no billing amounts, internal work,
// editor names, private notes or onboarding.

export const dynamic = "force-dynamic";

async function sharedClient(slug: string) {
  const client = await prisma.client.findUnique({
    where: { slug },
    include: {
      deliverables: { orderBy: { sortOrder: "asc" } },
      projects: {
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        include: { assets: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  return client?.shareEnabled ? client : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const client = await sharedClient((await params).slug);
  return {
    title: client ? `${client.name} · Easeus Media` : "Easeus Media",
    // a private link: keep it out of search engines
    robots: { index: false, follow: false },
  };
}

// The editing stages, in the client's words
const STAGE: Partial<Record<TaskStatus, { label: string; className: string }>> = {
  queued: { label: "Up next", className: "border-border bg-surface text-muted" },
  editing: { label: "In production", className: "border-blue-400/30 bg-blue-400/15 text-blue-300" },
  revision_requested: { label: "In production", className: "border-blue-400/30 bg-blue-400/15 text-blue-300" },
  sent_for_approval: { label: "In our review", className: "border-purple-400/30 bg-purple-400/15 text-purple-300" },
  sent_for_client_approval: { label: "Ready for your review", className: "border-cyan-400/30 bg-cyan-400/15 text-cyan-300" },
  final_export_ready: { label: "Finalising", className: "border-green-400/30 bg-green-400/15 text-green-300" },
};

const PAYMENT: Record<Payment, { label: string; className: string } | null> = {
  paid: { label: "Paid", className: "border-green-400/30 bg-green-400/15 text-green-300" },
  unpaid: { label: "Awaiting payment", className: "border-amber-400/30 bg-amber-400/15 text-amber-300" },
  part_paid: { label: "Part paid", className: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  not_sent: { label: "Not invoiced yet", className: "border-border bg-surface text-muted" },
  not_marked: null,
};

const DOCS = [
  ["brandGuidelines", "Brand guidelines"],
  ["sop", "How we work (SOP)"],
  ["qualityChecklist", "Quality checklist"],
  ["meetingNotes", "Meeting notes"],
  ["resources", "Resources"],
] as const;

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const pill = "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-border bg-surface/40 p-5 sm:p-6">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function SharedClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const client = await sharedClient(slug);
  // not shared (or no such client): this address is the team's page
  if (!client) redirect("/login");

  const projectIds = client.projects.map((p) => p.id);
  const inProgress = await prisma.task.findMany({
    where: { projectId: { in: projectIds }, status: { in: ACTIVE_STATUSES }, internal: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, frameioLink: true, project: { select: { name: true, type: true } } },
  });

  const finished = client.projects.filter((p) => p.completedAt);
  const batches = invoiceBatches(
    finished.map((p) => ({ id: p.id, date: p.completedAt!.toISOString().slice(0, 10) })),
    { cadence: client.billingCadence, dayOfMonth: client.billingDayOfMonth, every: client.billingMilestoneCount },
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })
  );
  // by invoice where the client has a rule; otherwise one list, newest first
  const deliveredGroups = batches.length
    ? batches.map((b) => {
        const items = finished.filter((p) => b.ids.includes(p.id));
        return { key: b.key, label: b.label, detail: b.detail, payment: PAYMENT[batchPayment(items.map((p) => p.invoiceStatus), b.complete)], items };
      })
    : [{ key: "all", label: "", detail: "", payment: null, items: finished }];

  const docs = DOCS.filter(([field]) => client[field]?.trim());
  const logo = clientLogoSrc(client);
  const nav = [
    ["progress", "In progress"],
    ["delivered", "Delivered"],
    ...(client.deliverables.length ? [["plan", "Your plan"]] : []),
    ...(docs.length ? [["documents", "Documents"]] : []),
    ["feedback", "Feedback"],
  ];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Image src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
          Prepared by Easeus Media
        </div>
        <div className="flex items-center gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small, already-resized logo
            <img src={logo} alt="" className="photo h-16 w-16" />
          ) : (
            <span className="photo flex h-16 w-16 items-center justify-center bg-surface-2 text-xl font-semibold">
              {client.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{client.name}</h1>
            {client.niche && <p className="truncate text-sm text-muted">{client.niche}</p>}
          </div>
        </div>
        <nav className="flex flex-wrap gap-1.5">
          {nav.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="progress" title="In progress">
        {inProgress.length === 0 ? (
          <p className="text-sm text-muted">Nothing in production right now.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            {inProgress.map((t) => {
              const stage = STAGE[t.status] ?? STAGE.editing!;
              const review = t.status === "sent_for_client_approval" && t.frameioLink ? normalizeUrl(t.frameioLink) : null;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 bg-surface/40 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.title}</span>
                    <span className="block truncate text-xs text-muted">{t.project.name || t.project.type}</span>
                  </span>
                  {review && (
                    <a href={review} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 whitespace-nowrap text-xs text-blue-400 hover:underline">
                      Review on Frame.io <ExternalLink size={11} />
                    </a>
                  )}
                  <span className={`${pill} ${stage.className}`}>{stage.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="delivered" title="Delivered">
        {finished.length === 0 ? (
          <p className="text-sm text-muted">Nothing delivered yet.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {deliveredGroups.map((g) => (
              <div key={g.key} className="flex flex-col gap-2">
                {g.label && (
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{g.label}</h3>
                    <span className="text-xs text-muted">{g.detail}</span>
                    {g.payment && <span className={`ml-auto ${pill} ${g.payment.className}`}>{g.payment.label}</span>}
                  </div>
                )}
                <ul className="flex flex-col gap-2">
                  {g.items.map((p) => (
                    <li key={p.id}>
                      {/* a project opens to show its files */}
                      <details className="group rounded-xl border border-border bg-surface/40">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{p.name || p.type}</span>
                            <span className="block text-xs text-muted">
                              {day(p.completedAt!)} · {p.assets.length} file{p.assets.length === 1 ? "" : "s"}
                            </span>
                          </span>
                          {p.driveLink && normalizeUrl(p.driveLink) && (
                            <a
                              href={normalizeUrl(p.driveLink)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 whitespace-nowrap text-xs text-blue-400 hover:underline"
                            >
                              Folder <ExternalLink size={11} />
                            </a>
                          )}
                          <ChevronDown size={15} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
                        </summary>
                        {p.assets.length > 0 && (
                          <ul className="flex flex-col divide-y divide-border border-t border-border">
                            {p.assets.map((a) => {
                              const href = a.link ? normalizeUrl(a.link) : null;
                              return (
                                <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                                  <span className="shrink-0 text-xs text-muted">{a.contentType}</span>
                                  {href ? (
                                    <a href={href} target="_blank" rel="noopener noreferrer" className="flex w-14 shrink-0 items-center justify-end gap-1 text-xs text-blue-400 hover:underline">
                                      Open <ExternalLink size={11} />
                                    </a>
                                  ) : (
                                    <span className="w-14 shrink-0" />
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {client.deliverables.length > 0 && (
        <Section id="plan" title="Your plan">
          <ul className="grid gap-2 sm:grid-cols-2">
            {client.deliverables.map((d) => (
              <li key={d.id} className="rounded-xl border border-border bg-surface/40 px-4 py-3">
                <p className="text-sm font-medium">{d.name}</p>
                {d.detail && <p className="mt-0.5 text-xs text-muted">{d.detail}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {docs.length > 0 && (
        <Section id="documents" title="Documents">
          <div className="flex flex-col gap-2">
            {docs.map(([field, label]) => (
              <details key={field} className="group rounded-xl border border-border bg-surface/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                  {label}
                  <ChevronDown size={15} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border px-4 py-4">
                  <Markdown text={client[field]!} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      <Section id="feedback" title="Feedback">
        <p className="-mt-2 mb-4 text-sm text-muted">Anything you&apos;d like us to know or change — it goes straight to the team.</p>
        <FeedbackForm slug={client.slug} />
      </Section>
    </main>
  );
}
