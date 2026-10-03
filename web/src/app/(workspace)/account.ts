"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getRealViewer, hashPassword, verifyPassword } from "@/lib/auth";
import { DEVELOPER } from "@/lib/scope";
import { checkAccount, type AccountInput } from "@/lib/account";

// Someone changing their own name, sign-in email or password, from the
// profile menu. Always the person really signed in, never whoever a Level 1
// is looking as. A new email or password needs the current password; a new
// name doesn't. Everything else about a person is Level 1's to change
// (team/actions.ts updatePerson).
export async function updateAccount(input: AccountInput): Promise<{ error?: string }> {
  const me = await getRealViewer();
  if (!me) return { error: "Your session has ended. Please sign in again." };
  const row = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true, email: true, passwordHash: true } });
  if (!row) return { error: "Your session has ended. Please sign in again." };

  const checked = checkAccount(input, row);
  if ("error" in checked) return checked;
  const { name, email, newPassword, needsPassword } = checked;

  // this one account's full access goes by its email (lib/scope DEVELOPER)
  if (email !== row.email && row.email === DEVELOPER) return { error: "This account's access is tied to its email, so it can't be changed here." };
  if (needsPassword && !(row.passwordHash && verifyPassword(input.currentPassword, row.passwordHash))) return { error: "Your current password isn't right." };

  // a name finds a person's photo and marks them online, so no two alike
  const clash = await prisma.user.findFirst({
    where: { id: { not: me.id }, OR: [{ email }, { name: { equals: name, mode: "insensitive" } }] },
    select: { email: true },
  });
  if (clash) return { error: clash.email === email ? "Someone else already uses that email." : "Someone else already has that name." };

  await prisma.user.update({ where: { id: me.id }, data: { name, email, ...(newPassword ? { passwordHash: hashPassword(newPassword) } : {}) } });
  // a name shows on every page
  revalidatePath("/", "layout");
  return {};
}
