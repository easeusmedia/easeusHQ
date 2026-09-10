import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { logout } from "./actions";
import { Sidebar } from "./Sidebar";
import { LiveRefresh } from "./LiveRefresh";
import { ActingAsPicker } from "./ActingAsPicker";
import { Avatar } from "./TaskCard";
import { ApprovalWatcher } from "./ApprovalWatcher";

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const [users, sessionUser] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }).catch(() => []),
    prisma.user.findUnique({ where: { id: sessionUserId } }),
  ]);
  if (!sessionUser) redirect("/login"); // stale/deleted-user cookie

  const isAdmin = sessionUser.role === "admin";
  const isOps = isAdmin || sessionUser.role === "core"; // Calendar access — unchanged, still every core member
  // "Viewing as" itself is narrower: just Abhishek (dev) and the admin
  const canViewAs = isAdmin || sessionUser.email === "abhishek@easeus.media";

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <LiveRefresh />
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Easeus" width={20} height={20} className="h-5 w-5 object-contain" priority />
          <span className="text-sm font-semibold">Easeus HQ</span>
        </div>
        <div className="flex items-center gap-4">
          <Avatar name={sessionUser.name} size={22} />
          {canViewAs && users.length > 0 ? (
            <ActingAsPicker people={users} sessionUserId={sessionUser.id} />
          ) : (
            <span className="text-sm text-muted">{sessionUser.name}</span>
          )}
          <form action={logout}>
            <button type="submit" className="text-sm text-muted hover:text-foreground">
              Log out
            </button>
          </form>
        </div>
      </header>
      {/* sidebar stays pinned to the viewport; only the content column scrolls */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isAdmin={isAdmin} isOps={isOps} />
        <div className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">{children}</div>
      </div>
      {sessionUser.role === "employee" && <ApprovalWatcher userId={sessionUser.id} />}
    </div>
  );
}
