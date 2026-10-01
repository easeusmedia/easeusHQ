import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Network, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { visibleDepartments } from "./departments";

export const dynamic = "force-dynamic";

// The agency's departments, as the Clients page shows its clients: each
// one a card that opens its own page. Only the departments someone is in
// (Level 1: all).
export default async function OrganizationPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const departments = await visibleDepartments(viewer);
  const people = await prisma.user.findMany({ where: { employment: { not: "former" } }, select: { teamId: true, departments: { select: { id: true } } } });
  const count = (id: string) => people.filter((p) => p.teamId === id || p.departments.some((d) => d.id === id)).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/25">
          <Network size={19} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
          <p className="text-sm text-muted">Each department and its board</p>
        </div>
      </header>
      {departments.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">You aren&apos;t in a department yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <Link key={d.id} href={`/org/${d.slug}`} className="panel panel-hover group flex items-center gap-3 rounded-2xl px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.05] text-sm font-semibold text-foreground/80 ring-1 ring-white/[0.08]">{d.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Users size={12} /> {count(d.id)} {count(d.id) === 1 ? "person" : "people"}
                </span>
              </span>
              <ArrowUpRight size={15} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
