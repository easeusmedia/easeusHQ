import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { dayOf } from "@/lib/editorKpi";
import { visibleDepartments } from "./departments";
import { OrgMap } from "./OrgMap";

export const dynamic = "force-dynamic";

// The agency's departments: a map of them (OrgMap), then each as a card
// that opens its own page. Only the departments someone is in (Level 1:
// all).
export default async function OrganizationPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const departments = await visibleDepartments(viewer);
  // the start of today in IST: anything due before it and not done is late
  const today = new Date(`${dayOf(new Date())}T00:00:00+05:30`);
  const ids = departments.map((d) => d.id);
  const [people, tasks, todos] = await Promise.all([
    prisma.user.findMany({ where: { employment: { not: "former" } }, select: { teamId: true, departments: { select: { id: true } } } }),
    prisma.task.findMany({ where: { AND: [LIVE_TASK, { teamId: { in: ids } }] }, select: { teamId: true, dueDate: true, handedOffAt: true } }),
    prisma.workTask.findMany({ where: { AND: [LIVE_WORK_TASK, { teamId: { in: ids } }] }, select: { teamId: true, dueDate: true } }),
  ]);
  const count = (id: string) => people.filter((p) => p.teamId === id || p.departments.some((d) => d.id === id)).length;
  const work = [...tasks.map((t) => ({ teamId: t.teamId, late: !!t.dueDate && !t.handedOffAt && t.dueDate < today })), ...todos.map((t) => ({ teamId: t.teamId, late: !!t.dueDate && t.dueDate < today }))];
  const map = departments.map((d) => ({
    slug: d.slug,
    name: d.name,
    people: count(d.id),
    open: work.filter((w) => w.teamId === d.id).length,
    late: work.filter((w) => w.teamId === d.id && w.late).length,
  }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="mt-1.5 text-sm text-muted">Each department and its board.</p>
      </header>
      {departments.length > 0 && <OrgMap departments={map} />}
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
