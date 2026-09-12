import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import type { Role, TaskStatus } from "@/lib/workflow";
import { Board } from "../../Board";
import { BillingPanel } from "../BillingPanel";
import { ClientOverview } from "../ClientOverview";
import { StatusDropdown } from "../StatusDropdown";
import { ClientTabs } from "../ClientTabs";

export const dynamic = "force-dynamic";

// same cutoff as the main board (page.tsx) — once delivered, a task drops
// off every live board, this client-scoped one included
const ACTIVE_STATUSES: TaskStatus[] = [
  "queued",
  "editing",
  "sent_for_approval",
  "revision_requested",
  "final_export_ready",
];

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (!me) redirect("/login");
  if (me.role === "employee") redirect("/tasks"); // admin/core only

  const client = await prisma.client.findUnique({
    where: { id },
    include: { projects: true, invoices: { orderBy: { createdAt: "desc" } } },
  });
  if (!client) notFound();

  const projectIds = client.projects.map((p) => p.id);
  const editors = users.filter((u) => u.role === "employee");

  const [tasks, deliveredSinceInvoice] = await Promise.all([
    prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: true, project: { include: { client: true } } },
    }),
    prisma.task.count({
      where: {
        status: "delivered_and_uploaded",
        projectId: { in: projectIds },
        updatedAt: { gt: client.lastInvoicedAt ?? new Date(0) },
      },
    }),
  ]);

  return (
    <>
      <Link href="/tasks/clients" className="mb-4 flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Clients
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-semibold">{client.name}</h1>
        <StatusDropdown clientId={client.id} status={client.status} size="md" />
      </div>

      <ClientTabs
        overview={
          <ClientOverview
            clientId={client.id}
            niche={client.niche}
            contact={client.contact}
            scopeOfWork={client.scopeOfWork}
            notes={client.notes}
            brandGuidelinesUrl={client.brandGuidelinesUrl}
            sopUrl={client.sopUrl}
            resourcesUrl={client.resourcesUrl}
            projects={client.projects}
          />
        }
        deliverables={
          <Board
            tasks={tasks}
            projects={client.projects.map((p) => ({ id: p.id, client: { name: client.name } }))}
            editors={editors}
            actingUserId={me.id}
            actingRole={me.role as Role}
            canCreate
          />
        }
        billing={
          <BillingPanel
            clientId={client.id}
            cadence={client.billingCadence}
            dayOfMonth={client.billingDayOfMonth}
            milestoneCount={client.billingMilestoneCount}
            deliveredSinceInvoice={deliveredSinceInvoice}
            invoices={client.invoices.map((inv) => ({ ...inv, amount: inv.amount.toString() }))}
          />
        }
      />
    </>
  );
}
