import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "./Sidebar";
import { LiveRefresh } from "./LiveRefresh";
import { ActingAsPicker } from "./ActingAsPicker";

// No page-specific data fetching here — just the header's own lightweight
// user list — so this layout works the same whether or not a real database
// is connected yet (each page under /tasks fetches what *it* needs itself).
export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } }).catch(() => []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <LiveRefresh />
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Easeus" width={20} height={20} className="h-5 w-5 object-contain" priority />
          <span className="text-sm font-semibold">Easeus HQ</span>
        </div>
        {users.length > 0 && <ActingAsPicker people={users} />}
      </header>
      {/* sidebar stays pinned to the viewport; only the content column scrolls */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
