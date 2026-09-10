import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { formatDate } from "../TaskCard";
import { RoleDropdown } from "./RoleDropdown";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) redirect("/login");

  const [me, users] = await Promise.all([
    prisma.user.findUnique({ where: { id: sessionUserId } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (me?.role !== "admin") redirect("/tasks"); // admin-only dashboard

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Users</h1>
      <p className="mb-6 text-sm text-muted">
        Everyone at Easeus HQ, and what they can do. Admin runs the whole thing; core (ops) assigns tasks, reviews
        work, and has full control over the queue; employees (editors) only work their own assigned tasks through
        the guided flow.
      </p>

      <div className="card-surface overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3 text-muted">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="w-36">
                    <RoleDropdown userId={u.id} role={u.role} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
