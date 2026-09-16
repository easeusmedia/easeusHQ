import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { logout } from "./actions";
import { Sidebar } from "./Sidebar";
import { LiveRefresh } from "./LiveRefresh";
import { ApprovalWatcher } from "./ApprovalWatcher";
import { PresenceHeartbeat } from "./presence/PresenceHeartbeat";
import { getUnreadBySender } from "./presence/actions";
import { ClientSwitcherSlot } from "./clients/ClientSwitcherSlot";
import { CLIENTS_PANEL_COOKIE } from "./clients/clientsPanel";
import { MainScroll } from "./MainScroll";
import { PeopleProvider } from "./photos";
import { ACTIVE_WINDOW_MS } from "./presence/constants";
import { clientLogoSrc } from "@/lib/photos";

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  // read server-side so the very first paint already matches the user's
  // saved preference — a client-only localStorage read meant every reload
  // rendered open by default, then snapped collapsed a moment later once
  // the effect ran, which is the "flickers open then collapses" bug
  const jar = await cookies();
  const sidebarOpen = jar.get("tasks-sidebar-open")?.value !== "0";
  const clientsPanelOpen = jar.get(CLIENTS_PANEL_COOKIE)?.value !== "0";

  const users = await getAllUsers().catch(() => []);
  const sessionUser = users.find((u) => u.id === sessionUserId);
  if (!sessionUser) redirect("/login"); // stale/deleted-user cookie

  const isAdmin = sessionUser.role === "admin";
  const isOps = isAdmin || sessionUser.role === "core"; // Calendar access — unchanged, still every core member
  // "Viewing as" itself is narrower: just Abhishek (dev) and the admin
  const canViewAs = isAdmin || sessionUser.email === "abhishek@easeus.media";
  const unreadBySender = await getUnreadBySender().catch(() => ({}));
  // the roster beside the Clients section, which everyone can open
  const currentClients = (
    await prisma.client.findMany({
      where: { status: "current" },
      select: { id: true, slug: true, name: true, avatarUrl: true },
      // the same order as the Clients dashboard
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
  ).map((c) => ({ id: c.id, slug: c.slug, name: c.name, logo: clientLogoSrc(c) }));

  const photos = Object.fromEntries(users.flatMap((u) => (u.avatarUrl ? [[u.name, u.avatarUrl]] : [])));
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the moment of this request
  const now = Date.now();
  const online = users.filter((u) => u.lastSeenAt && now - u.lastSeenAt.getTime() < ACTIVE_WINDOW_MS).map((u) => u.name);

  return (
    <PeopleProvider photos={photos} online={online} self={sessionUser.name}>
    <div className="flex h-screen bg-background text-foreground">
      <LiveRefresh />
      <PresenceHeartbeat />
      <Sidebar
        isOps={isOps}
        name={sessionUser.name}
        canViewAs={canViewAs && users.length > 0}
        people={users}
        sessionUserId={sessionUser.id}
        unreadBySender={unreadBySender}
        logout={logout}
        initialOpen={sidebarOpen}
      />
      {/* a true sibling of Sidebar — outside the scrolling wrapper below,
          same as Sidebar itself — so it can be `sticky top-0 h-screen`
          with no offset math to fake that position from inside a padded,
          scrolling child. It only renders on a client's own page (checks
          the URL itself), so every other page is unaffected. */}
      <ClientSwitcherSlot clients={currentClients} initialOpen={clientsPanelOpen} />
      <MainScroll className="min-w-0 flex-1 overflow-y-auto p-(--page-pad) [--page-pad:--spacing(6)] sm:[--page-pad:--spacing(8)]">{children}</MainScroll>
      {sessionUser.role === "employee" && <ApprovalWatcher userId={sessionUser.id} />}
    </div>
    </PeopleProvider>
  );
}
