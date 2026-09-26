import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { clientLogoSrc } from "@/lib/photos";
import { Avatar } from "../../(workspace)/TaskCard";
import { ClientStats } from "../../(workspace)/clients/ClientStats";
import { ClientTabs } from "../../(workspace)/clients/ClientTabs";
import { ClientDeliverables } from "../../(workspace)/clients/ClientDeliverables";
import { ClientDocuments } from "../../(workspace)/clients/ClientInfo";
import { ProjectsSection } from "../../(workspace)/clients/ProjectsSection";
import { TagPill } from "../../(workspace)/clients/TagPill";
import { ProfileHead } from "../../(workspace)/ProfileHead";
import { FeedbackForm } from "./FeedbackForm";
import { OngoingList, sharedClient } from "./shared";
import { ContentCalendar } from "../../(workspace)/clients/ContentCalendar";
import { indiaDay } from "@/lib/due";

// A client's own page, shown at /clients/<name> to anyone not signed in
// (see proxy.ts), only while ops has sharing switched on. The same layout
// as the team's page for this client — header, the four numbers, then
// Overview / Deliverables / Client info — made read-only, with the team's
// side taken out: no billing, no internal work, no editing, no editor
// names, no private notes or onboarding. Feedback for the team at the end.

export const dynamic = "force-dynamic";

const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const client = await sharedClient((await params).slug);
  return {
    title: client ? `${client.name} · Easeus Media` : "Easeus Media",
    // a private link: keep it out of search engines
    robots: { index: false, follow: false },
  };
}

export default async function SharedClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; show?: string; layout?: string }>;
}) {
  const [{ slug }, { tab, show, layout }] = await Promise.all([params, searchParams]);
  const found = await sharedClient(slug);
  // not shared (or no such client): this address is the team's page
  if (!found) redirect("/login");

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: found.id },
    include: {
      tags: true,
      deliverables: { orderBy: { sortOrder: "asc" } },
      projects: {
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        include: { _count: { select: { assets: true, tasks: { where: { status: { in: ACTIVE_STATUSES }, internal: false } } } } },
      },
    },
  });
  const tasks = await prisma.task.findMany({
    where: { projectId: { in: client.projects.map((p) => p.id) }, status: { in: ACTIVE_STATUSES }, internal: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, frameioLink: true, project: { select: { name: true, type: true } } },
  });

  // the plan by day, as the team sees it — only what's made for them
  const dated = await prisma.task.findMany({
    where: { projectId: { in: client.projects.map((p) => p.id) }, dueDate: { not: null }, internal: false },
    select: { id: true, title: true, status: true, dueDate: true },
  });

  const logo = clientLogoSrc(client);
  const projectCards = client.projects.map((p) => ({
    id: p.id,
    name: p.name || p.type,
    status: p.status,
    coverUrl: p.coverUrl,
    completedAt: p.completedAt ? shortDate(p.completedAt) : null,
    date: (p.completedAt ?? p.createdAt).toISOString().slice(0, 10),
    assetCount: p._count.assets,
    activeTasks: p._count.tasks,
    invoiceStatus: p.invoiceStatus,
    invoiceBatch: p.invoiceBatch,
  }));

  return (
    <div className="flex flex-col">
      <div className="mb-8 flex">
        <ProfileHead
          photo={
            logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a small, already-resized logo
              <img src={logo} alt="" className="photo size-full" />
            ) : (
              <Avatar name={client.name} size="fill" />
            )
          }
        >
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            {client.niche && <p className="text-sm text-muted">{client.niche}</p>}
            {client.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {client.tags.map((t) => (
                  <TagPill key={t.id} name={t.name} color={t.color} />
                ))}
              </div>
            )}
          </div>
        </ProfileHead>
      </div>

      <div className="mb-10">
        <ClientStats
          activeTasks={tasks.length}
          inProgress={client.projects.filter((p) => p.status !== "completed").length}
          completed={client.projects.filter((p) => p.status === "completed").length}
          unpaid={client.projects.filter((p) => p.invoiceStatus === "unpaid").length}
        />
      </div>

      <ClientTabs
        initialTab={tab}
        width=""
        tabs={[
          {
            key: "overview",
            label: "Overview",
            content: (
              <div className="flex flex-col gap-10">
                <section>
                  <h2 className="mb-4 text-sm font-medium">Ongoing work</h2>
                  <p className="-mt-3 mb-3 text-xs text-muted">What we&apos;re making for you right now, and where each piece is.</p>
                  <OngoingList
                    tasks={tasks.map((t) => ({ ...t, subtitle: t.project.name || t.project.type }))}
                  />
                </section>
                <ContentCalendar
                  items={dated.map((t) => ({
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    due: indiaDay(t.dueDate!),
                    // the team's deadline, not something to flag red at the client
                    overdue: false,
                  }))}
                  today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })}
                />
                <ProjectsSection
                  clientId={client.id}
                  projects={projectCards}
                  initialShow={show}
                  initialLayout={layout}
                  billing={{ cadence: client.billingCadence, dayOfMonth: client.billingDayOfMonth, every: client.billingMilestoneCount }}
                  today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kolkata" })}
                  projectBase={`/share/${client.slug}/projects`}
                />
              </div>
            ),
          },
          {
            key: "deliverables",
            label: "Deliverables",
            content: <ClientDeliverables clientId={client.id} deliverables={client.deliverables} readOnly />,
          },
          {
            key: "info",
            label: "Client info",
            content: (
              <ClientDocuments
                docs={{
                  brandGuidelines: client.brandGuidelines,
                  sop: client.sop,
                  qualityChecklist: client.qualityChecklist,
                  meetingNotes: client.meetingNotes,
                  resources: client.resources,
                }}
              />
            ),
          },
        ]}
      />

      <section id="feedback" className="mt-14 rounded-2xl border border-border bg-surface/40 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Feedback</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Anything you&apos;d like us to know or change — it goes straight to the team.</p>
        <FeedbackForm slug={client.slug} />
      </section>
    </div>
  );
}
