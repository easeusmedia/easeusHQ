import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAllUsers, onStaff } from "@/lib/users";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
// one shared definition of "not delivered yet" — this page used to keep
// its own copy, which silently dropped a new status from the board
import { LIVE_TASK, type Role } from "@/lib/workflow";
import { assigneeWhere, effectiveRole, isFounder, isMember, runsProduction, visibleClientWhere, visibleTagWhere } from "@/lib/scope";
import { getViewer } from "@/lib/viewer";
import { PUBLIC_CLIENT_SELECT, PUBLIC_USER_SELECT } from "@/lib/publicUser";
import { BoardViews } from "../BoardViews";
import { DepartmentHead } from "./DepartmentHead";
import { DepartmentTitle } from "./space/SpaceGrid";

// Production's board, on its page under Organization: its Video editing and
// Graphic design queues, switched between at the top
export async function ProductionBoard({ scope, id, name }: { scope?: string; id: string; name: string }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const member = isMember(viewer);

  const [users, rawProjects, tasks, kinds, held] = await Promise.all([
    getAllUsers(),
    prisma.project.findMany({
      where: { client: { status: "current", ...visibleClientWhere(viewer) } },
      // only what a task form's project list shows
      select: { id: true, name: true, type: true, client: { select: PUBLIC_CLIENT_SELECT } },
      // newest first within each client: a task form lists a client's
      // latest few projects and searches for the rest
      orderBy: [{ client: { name: "asc" } }, { createdAt: "desc" }],
    }),
    // the Production queues: video and design work this person may see
    prisma.task.findMany({
      where: { AND: [LIVE_TASK, assigneeWhere(viewer), { workflow: { in: ["video", "design"] } }] },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: { select: PUBLIC_CLIENT_SELECT } } }, shares: { where: { userId: viewer.id }, select: { id: true } } },
    }),
    // the kinds of work this person's roles offer, and the ones they may label with
    prisma.taskTag.findMany({ where: visibleTagWhere(viewer), orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    // how the roles this person holds move: which queues are theirs
    prisma.jobTitle.findMany({ where: { holders: { some: { id: viewer.id } } }, select: { workflow: true } }),
  ]);
  // a project set up before names were required can still have "" — fall
  // back to its type so the new/reassign-task dropdown never shows a blank
  const projects = rawProjects.map((p) => ({ ...p, name: p.name || p.type }));

  const actingUser = users.find((u) => u.id === viewer.id);
  if (!actingUser) redirect("/login");

  // Who Production work can go to: a Member only themselves; a Founder any
  // Member, or themselves; a Lead the Members in their departments, or
  // themselves (lib/scope canAssign)
  const deptIds = viewer.departments.map((d) => d.id);
  const editors = member
    ? users.filter((u) => u.id === viewer.id)
    : users.filter((u) => onStaff(u) && (u.id === viewer.id || (u.role === "employee" && (isFounder(viewer) || (!!u.teamId && deptIds.includes(u.teamId))))));

  // The Board is Production's: its Video and Design queues, for whoever
  // works or runs them. Everyone else's work is to-dos, in My tasks.
  const mine = new Set(held.map((r) => r.workflow));
  // theirs, or work they've been added to
  const hasOwn = (w: string) => tasks.some((t) => t.workflow === w && (t.assignedToId === viewer.id || t.shares.length > 0));
  const queue = (w: "video" | "design") => (member ? mine.has(w) || hasOwn(w) : runsProduction(viewer) || mine.has(w) || hasOwn(w));
  const scopes = [...(queue("video") ? [{ key: "editors", label: "Video editing" }] : []), ...(queue("design") ? [{ key: "design", label: "Graphic design" }] : [])];
  if (!scopes.length)
    return (
      <>
        <DepartmentHead>
          <DepartmentTitle id={id} name={name} />
        </DepartmentHead>
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No video or design work of yours here yet.</p>
      </>
    );
  const initialScope = scopes.find((s) => s.key === scope)?.key ?? scopes[0].key;

  // a scheduled-for-the-future task stays off the assigned Member's board
  // until that date — Founders and Leads always see everything
  const visibleTasks = member ? tasks.filter((t) => !t.scheduledFor || t.scheduledFor <= new Date()) : tasks;

  const canSyncNotion = isAbhishekOrAdmin(actingUser);
  const tagOptions = kinds.map((k) => ({ id: k.id, name: k.name, clientFacing: k.clientFacing, workflow: k.workflow }));
  const env = { projects, editors, actingUserId: actingUser.id, actingRole: effectiveRole(actingUser) as Role };

  return (
    <>
    <DepartmentHead>
          <DepartmentTitle id={id} name={name} />
        </DepartmentHead>
    <BoardViews
      scopes={scopes}
      initialScope={initialScope}
      editors={{ ...env, tasks: visibleTasks.filter((t) => t.workflow !== "design"), taskTags: tagOptions.filter((k) => k.workflow === "video") }}
      design={{ ...env, tasks: visibleTasks.filter((t) => t.workflow === "design"), taskTags: tagOptions.filter((k) => k.workflow === "design") }}
      canSyncNotion={canSyncNotion}
    />
    </>
  );
}
