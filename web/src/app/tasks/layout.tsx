import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getAllUsers } from "@/lib/users";
import { logout } from "./actions";
import { Sidebar } from "./Sidebar";
import { LiveRefresh } from "./LiveRefresh";
import { ApprovalWatcher } from "./ApprovalWatcher";

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  // read server-side so the very first paint already matches the user's
  // saved preference — a client-only localStorage read meant every reload
  // rendered open by default, then snapped collapsed a moment later once
  // the effect ran, which is the "flickers open then collapses" bug
  const sidebarOpen = (await cookies()).get("tasks-sidebar-open")?.value !== "0";

  const users = await getAllUsers().catch(() => []);
  const sessionUser = users.find((u) => u.id === sessionUserId);
  if (!sessionUser) redirect("/login"); // stale/deleted-user cookie

  const isAdmin = sessionUser.role === "admin";
  const isOps = isAdmin || sessionUser.role === "core"; // Calendar access — unchanged, still every core member
  // "Viewing as" itself is narrower: just Abhishek (dev) and the admin
  const canViewAs = isAdmin || sessionUser.email === "abhishek@easeus.media";

  return (
    <div className="flex h-screen bg-background text-foreground">
      <LiveRefresh />
      <Sidebar
        isAdmin={isAdmin}
        isOps={isOps}
        name={sessionUser.name}
        canViewAs={canViewAs && users.length > 0}
        people={users}
        sessionUserId={sessionUser.id}
        logout={logout}
        initialOpen={sidebarOpen}
      />
      <div className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">{children}</div>
      {sessionUser.role === "employee" && <ApprovalWatcher userId={sessionUser.id} />}
    </div>
  );
}
