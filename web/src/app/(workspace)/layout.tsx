import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRealUserId, getSessionUserId } from "@/lib/auth";
import { getAllUsers, onStaff } from "@/lib/users";
import { logout } from "./actions";
import { Sidebar } from "./Sidebar";
import { visibleDepartments } from "./org/departments";
import { spaceTree } from "./org/space/data";
import { Pulse } from "./Pulse";
import { Spotlight } from "./Spotlight";
import { ApprovalWatcher } from "./ApprovalWatcher";
import { FeedbackWatcher } from "./FeedbackWatcher";
import { canEditPeople, isFounder, isMember, LEVEL_LABEL, runsClients, worksTheBoard, seesClient } from "@/lib/scope";
import { ViewAsBanner } from "./ViewAsBanner";
import { getViewer } from "@/lib/viewer";
import { isAbhishekOrAdmin } from "@/lib/actingUser";
import { Assistant } from "./assistant/Assistant";
import { getUnreadBySender } from "./presence/actions";
import { MainScroll } from "./MainScroll";
import { ClientDock } from "./clients/ClientDock";
import { PeopleProvider } from "./photos";
import { ACTIVE_WINDOW_MS } from "./presence/constants";
import { clientLogoSrc } from "@/lib/photos";
import { liveLine } from "@/lib/live";
import { overdueToAnswer } from "@/lib/taskTrack";
import { OverdueLock } from "./OverdueLock";

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  // read server-side so the very first paint already matches the user's
  // saved preference — a client-only localStorage read meant every reload
  // rendered open by default, then snapped collapsed a moment later once
  // the effect ran, which is the "flickers open then collapses" bug
  const jar = await cookies();
  const sidebarOpen = jar.get("tasks-sidebar-open")?.value !== "0";

  // Everything the frame needs, asked for at once: this renders on every
  // page, so its queries running one after another was a fixed cost on
  // every click.
  const [realUserId, sessionUserId, viewer, users, unreadBySender, clientRows, draftContracts] = await Promise.all([
    getRealUserId(),
    getSessionUserId(),
    getViewer(),
    getAllUsers().catch(() => []),
    getUnreadBySender().catch(() => ({})),
    // the current clients: the sidebar's tree and the client bar — everyone sees them
    prisma.client.findMany({
      where: { status: "current" },
      select: { id: true, slug: true, name: true, avatarUrl: true, editors: { select: { id: true } }, hiddenFrom: { select: { id: true } } },
      // the same order as the Clients dashboard
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    // clients who've sent their contract form, waiting on us for the terms
    prisma.contract.count({ where: { status: "draft" } }).catch(() => 0),
  ]);
  if (!sessionUserId) redirect("/login");
  const sessionUser = users.find((u) => u.id === sessionUserId);
  if (!sessionUser || !viewer) redirect("/login"); // stale/deleted-user cookie
  // a Level 1 looking as someone else (lib/auth): who they really are, and
  // everyone they could look as
  const realUser = users.find((u) => u.id === realUserId);
  const viewingAs = realUserId !== sessionUserId;
  const viewAsPeople =
    realUser && isFounder(realUser) ? users.filter((u) => onStaff(u) && u.id !== realUser.id).map((u) => ({ id: u.id, name: u.name, level: LEVEL_LABEL[u.role] })) : null;

  // a Level 2 or 3 who left an overdue notice unanswered for over a day sees
  // only that until each task has a new date and a reason (Level 1 never)
  const toAnswer = realUser && !viewingAs && realUser.role !== "admin" && !isFounder(realUser) ? await overdueToAnswer(realUser.id).catch(() => []) : [];
  if (toAnswer.length)
    return (
      <div className="app-root flex h-screen bg-background text-foreground" data-theme={realUser?.theme === "mist" ? "mist" : "dark"}>
        <OverdueLock items={toAnswer} logout={logout} />
      </div>
    );

  // Founders and Leads run things; Members do their own work
  const isOps = !isMember(viewer);
  const contractsWaiting = isOps ? draftContracts : 0;
  const hearsFromClients = runsClients(viewer);
  // an editor has only the clients given to them (lib/scope)
  const editor = worksTheBoard(viewer);
  const currentClients = clientRows
    .filter((c) => seesClient(viewer, c))
    .map((c) => ({ id: c.id, slug: c.slug, name: c.name, logo: clientLogoSrc(c) }));

  const departments = await visibleDepartments(viewer);

  const [noticesWaiting, spaces] = await Promise.all([
    // notices they haven't seen yet: a number on Home, like unread chat
    prisma.notice.count({ where: { forId: viewer.id, readAt: null } }).catch(() => 0),
    // each department's portals (and any older sections with theirs), nested under it in the sidebar
    spaceTree(departments.map((d) => d.id)).catch(() => []),
  ]);
  const departmentTree = departments.map((d) => ({
    ...d,
    children: spaces
      .filter((s) => s.teamId === d.id && s.parentId === null)
      .map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        href: `/org/${d.slug}/${s.slug}`,
        children: spaces
          .filter((p) => p.parentId === s.id && p.kind === "portal")
          .map((p) => ({ id: p.id, slug: p.slug, name: p.name, href: `/org/${d.slug}/${s.slug}/${p.slug}` })),
      })),
  }));

  const photos = Object.fromEntries(users.flatMap((u) => (u.avatarUrl ? [[u.name, u.avatarUrl]] : [])));
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the moment of this request
  const now = Date.now();
  const online = users
    .filter((u) => onStaff(u) && u.lastSeenAt && now - u.lastSeenAt.getTime() < ACTIVE_WINDOW_MS)
    .map((u) => u.name);

  return (
    <PeopleProvider photos={photos} online={online} self={sessionUser.name}>
    {/* their own look (the profile menu's Theme): dark, or mist (globals.css) */}
    <div className="app-root flex h-screen bg-background text-foreground" data-theme={realUser?.theme === "mist" ? "mist" : "dark"}>
      <Pulse live={liveLine()} />
      {viewingAs && <ViewAsBanner name={sessionUser.name} level={LEVEL_LABEL[sessionUser.role]} />}
      <Spotlight />
      <Sidebar
        isOps={isOps}
        isFounder={isFounder(viewer)}
        // the departments they may open under Organization: Level 1 all, others their own
        departments={departmentTree}
        viewAsPeople={viewAsPeople}
        canSeeFinance={canEditPeople(sessionUser)}
        name={sessionUser.name}
        fullAccess={isAbhishekOrAdmin(sessionUser)}
        isEditor={editor}
        sessionUserId={sessionUser.id}
        unreadBySender={unreadBySender}
        contractsWaiting={contractsWaiting}
        noticesWaiting={noticesWaiting}
        theme={realUser?.theme === "mist" ? "mist" : "dark"}
        clients={currentClients}
        logout={logout}
        initialOpen={sidebarOpen}
      />
      {/* the page scrolls; the client bar floats over its foot, and the page
          makes room for it whenever it's there */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <MainScroll className="min-h-0 flex-1 overflow-y-auto p-(--page-pad) [--page-pad:--spacing(4)] sm:[--page-pad:--spacing(5)] xl:[--page-pad:--spacing(6)] [&:has(+[data-dock])]:pb-24">{children}</MainScroll>
        <ClientDock clients={currentClients} />
      </div>
      {sessionUser.role === "employee" && <ApprovalWatcher userId={sessionUser.id} />}
      {hearsFromClients && <FeedbackWatcher />}
      {/* the admin's assistant, over whatever page is open */}
      {canEditPeople(sessionUser) && <Assistant name={sessionUser.name.split(" ")[0]} />}
    </div>
    </PeopleProvider>
  );
}
