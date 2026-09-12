import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { Avatar } from "../TaskCard";
import { ClientsSyncButton } from "./ClientsSyncButton";
import { StatusDropdown } from "./StatusDropdown";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const users = await getAllUsers();
  const me = users.find((u) => u.id === sessionUserId);
  if (me?.role === "employee") redirect("/tasks"); // admin/core only — same bar as Calendar

  const clients = await prisma.client.findMany({
    where: { status: { in: ["current", "on_hold"] } },
    include: {
      projects: { include: { _count: { select: { tasks: true } } } },
      _count: { select: { invoices: true } },
    },
    orderBy: { name: "asc" },
  });

  const current = clients.filter((c) => c.status === "current");
  const onHold = clients.filter((c) => c.status === "on_hold");

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <ClientsSyncButton />
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted">
          No clients yet — click &quot;Sync clients&quot; to pull the current roster in from Notion.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <ClientGroup label="Current" clients={current} />
          <ClientGroup label="On hold" clients={onHold} />
        </div>
      )}
    </>
  );
}

type ClientRow = {
  id: string;
  name: string;
  status: string;
  niche: string | null;
  projects: { _count: { tasks: number } }[];
  _count: { invoices: number };
};

function ClientGroup({ label, clients }: { label: string; clients: ClientRow[] }) {
  if (clients.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {label} <span className="text-muted/70">({clients.length})</span>
      </h2>
      <div className="card-surface flex flex-col divide-y divide-border overflow-hidden rounded-xl shadow-sm">
        {clients.map((client) => {
          const taskCount = client.projects.reduce((sum, p) => sum + p._count.tasks, 0);
          return (
            <Link
              key={client.id}
              href={`/tasks/clients/${client.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-hover"
            >
              <Avatar name={client.name} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{client.name}</p>
                {client.niche && <p className="truncate text-xs text-muted">{client.niche}</p>}
              </div>
              <p className="hidden shrink-0 text-xs text-muted sm:block">
                {client.projects.length} project{client.projects.length === 1 ? "" : "s"} · {taskCount} task
                {taskCount === 1 ? "" : "s"} · {client._count.invoices} invoice{client._count.invoices === 1 ? "" : "s"}
              </p>
              <StatusDropdown clientId={client.id} status={client.status} />
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
