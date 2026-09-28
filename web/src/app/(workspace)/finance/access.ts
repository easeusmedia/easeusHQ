import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";

// Finance is the admin's: anyone else goes back to the board
export async function requireFinance() {
  const id = await getSessionUserId();
  if (!id) redirect("/login");
  const me = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } });
  if (!me || !canEditPeople(me)) redirect("/board");
}
