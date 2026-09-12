import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { ClientsSyncButton } from "./ClientsSyncButton";

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
    orderBy: [{ status: "asc" }, { name: "asc" }], // current before on_hold, alphabetical within each
  });

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
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {clients.map((client) => {
            const taskCount = client.projects.reduce((sum, p) => sum + p._count.tasks, 0);
            return (
              <Link
                key={client.id}
                href={`/tasks/clients/${client.id}`}
                className="card-surface flex flex-col gap-2 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-medium">{client.name}</h2>
                  {client.status === "on_hold" && (
                    <span className="shrink-0 rounded-full bg-orange-400/15 px-2 py-0.5 text-[11px] text-orange-300">
                      On hold
                    </span>
                  )}
                </div>
                {client.niche && <p className="text-xs text-muted">{client.niche}</p>}
                <p className="mt-auto text-xs text-muted">
                  {client.projects.length} project{client.projects.length === 1 ? "" : "s"} · {taskCount} task
                  {taskCount === 1 ? "" : "s"} · {client._count.invoices} invoice
                  {client._count.invoices === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
