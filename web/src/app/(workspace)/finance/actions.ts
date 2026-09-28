"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { PAYROLL_SHEET } from "@/lib/finance";

// The team's payroll lives in a spreadsheet; until it's wired in, Finance
// keeps a link to it. Admin only, like everything else about pay.
export async function savePayrollSheet(url: string): Promise<{ error?: string }> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  if (!me || !canEditPeople(me)) return { error: "Only the admin can change the payroll sheet." };

  const value = url.trim();
  if (!value) {
    await prisma.appSetting.deleteMany({ where: { key: PAYROLL_SHEET } });
  } else {
    if (!/^https:\/\/\S+$/.test(value)) return { error: "Paste the sheet's full link, starting with https://" };
    await prisma.appSetting.upsert({ where: { key: PAYROLL_SHEET }, create: { key: PAYROLL_SHEET, value }, update: { value } });
  }
  revalidatePath("/finance");
  return {};
}
