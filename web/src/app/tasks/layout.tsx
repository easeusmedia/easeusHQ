import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { logout } from "./actions";
import { Sidebar } from "./Sidebar";
import { LiveRefresh } from "./LiveRefresh";
import { ApprovalWatcher } from "./ApprovalWatcher";
import { PresenceHeartbeat } from "./team/PresenceHeartbeat";
import { getUnreadBySender } from "./team/actions";
import { ClientSwitcherSlot } from "./clients/ClientSwitcherSlot";
import { CLIENTS_PANEL_COOKIE } from "./clients/clientsPanel";
import { MainScroll } from "./MainScroll";

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
  // only ops ever lands on a client's own page — no reason to query this
  // for an editor session that can never render it
  const currentClients = isOps
    ? await prisma.client.findMany({
        where: { status: "current" },
        select: { id: true, name: true, avatarUrl: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="flex h-screen bg-background text-foreground">
      <LiveRefresh />
      <PresenceHeartbeat />
      <Sidebar
        isAdmin={isAdmin}
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
          the URL itself), so every other /tasks page is unaffected. */}
      <ClientSwitcherSlot clients={currentClients} initialOpen={clientsPanelOpen} />
      <MainScroll className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">{children}</MainScroll>
      {sessionUser.role === "employee" && <ApprovalWatcher userId={sessionUser.id} />}
    </div>
  );
}
