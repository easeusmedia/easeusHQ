import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers, onStaff } from "@/lib/users";
import { logout } from "./actions";
import { Sidebar } from "./Sidebar";
import { Pulse } from "./Pulse";
import { ApprovalWatcher } from "./ApprovalWatcher";
import { FeedbackWatcher } from "./FeedbackWatcher";
import { seesClientFeedback } from "@/lib/scope";
import { getUnreadBySender } from "./presence/actions";
import { MainScroll } from "./MainScroll";
import { ClientDock } from "./clients/ClientDock";
import { PeopleProvider } from "./photos";
import { ACTIVE_WINDOW_MS } from "./presence/constants";
import { clientLogoSrc } from "@/lib/photos";

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
  const [sessionUserId, users, unreadBySender, opsTeam, clientRows, draftContracts] = await Promise.all([
    getSessionUserId(),
    getAllUsers().catch(() => []),
    getUnreadBySender().catch(() => ({})),
    prisma.team.findUnique({ where: { slug: "operations" }, select: { id: true } }),
    // the current clients: the sidebar's tree and the client bar — everyone sees them
    prisma.client.findMany({
      where: { status: "current" },
      select: { id: true, slug: true, name: true, avatarUrl: true },
      // the same order as the Clients dashboard
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    // clients who've sent their contract form, waiting on us for the terms
    prisma.contract.count({ where: { status: "draft" } }).catch(() => 0),
  ]);
  if (!sessionUserId) redirect("/login");
  const sessionUser = users.find((u) => u.id === sessionUserId);
  if (!sessionUser) redirect("/login"); // stale/deleted-user cookie

  const isAdmin = sessionUser.role === "admin";
  const isOps = isAdmin || sessionUser.role === "core"; // Calendar access — unchanged, still every core member
  // "Viewing as" itself is narrower: just Abhishek (dev) and the admin
  const canViewAs = isAdmin || sessionUser.email === "abhishek@easeus.media";
  const contractsWaiting = isOps ? draftContracts : 0;
  const hearsFromClients = seesClientFeedback(sessionUser, opsTeam?.id ?? null);
  const currentClients = clientRows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, logo: clientLogoSrc(c) }));

  const photos = Object.fromEntries(users.flatMap((u) => (u.avatarUrl ? [[u.name, u.avatarUrl]] : [])));
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the moment of this request
  const now = Date.now();
  const online = users
    .filter((u) => onStaff(u) && u.lastSeenAt && now - u.lastSeenAt.getTime() < ACTIVE_WINDOW_MS)
    .map((u) => u.name);

  return (
    <PeopleProvider photos={photos} online={online} self={sessionUser.name}>
    <div className="flex h-screen bg-background text-foreground">
      <Pulse />
      <Sidebar
        isOps={isOps}
        name={sessionUser.name}
        canViewAs={canViewAs && users.length > 0}
        people={users.filter(onStaff)}
        sessionUserId={sessionUser.id}
        unreadBySender={unreadBySender}
        contractsWaiting={contractsWaiting}
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
    </div>
    </PeopleProvider>
  );
}
