"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { canEditPeople } from "@/lib/scope";
import { PAYROLL_SHEET } from "@/lib/finance";
import { withUndo } from "@/lib/undo";

type Result = { error?: string };

// Money is the admin's alone, like everything else about pay: every action
// here re-checks the session rather than trusting the page.
async function payAdmin(): Promise<boolean> {
  const id = await getSessionUserId();
  const me = id ? await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } }) : null;
  return !!me && canEditPeople(me);
}

const money = (v: string | number) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null;
};

// The team's payroll lives in a spreadsheet; until it's wired in, Finance
// keeps a link to it.
export async function savePayrollSheet(url: string): Promise<Result> {
  if (!(await payAdmin())) return { error: "Only the admin can change the payroll sheet." };
  const value = url.trim();
  if (value && !/^https:\/\/\S+$/.test(value)) return { error: "Paste the sheet's full link, starting with https://" };
  await withUndo(
    [{ table: "AppSetting", id: PAYROLL_SHEET }],
    async () => {
      if (value) await prisma.appSetting.upsert({ where: { key: PAYROLL_SHEET }, create: { key: PAYROLL_SHEET, value }, update: { value } });
      else await prisma.appSetting.deleteMany({ where: { key: PAYROLL_SHEET } });
    },
    { label: value ? "Changed the payroll sheet" : "Removed the payroll sheet" }
  );
  revalidatePath("/finance", "layout");
  return {};
}

const STRUCTURES = ["fixed", "per_video", "hourly"];
const CYCLES = ["monthly", "fortnightly", "weekly"];

// How someone is paid: their salary (the same one on their profile), its
// structure and how often it goes out.
export async function savePayDetails(input: { userId: string; salary: string; payStructure: string; payCycle: string }): Promise<Result> {
  if (!(await payAdmin())) return { error: "Only the admin can change someone's pay." };
  const salary = input.salary.trim() ? money(input.salary) : null;
  if (input.salary.trim() && salary === null) return { error: "That salary isn't a number." };
  if (input.payStructure && !STRUCTURES.includes(input.payStructure)) return { error: "That isn't a pay structure." };
  if (input.payCycle && !CYCLES.includes(input.payCycle)) return { error: "That isn't a pay cycle." };
  await withUndo(
    [{ table: "User", id: input.userId }],
    () =>
      prisma.user.update({
        where: { id: input.userId },
        data: { salary, payStructure: input.payStructure || null, payCycle: input.payCycle || null },
      }),
    { depth: 0 }
  );
  revalidatePath("/finance", "layout");
  revalidatePath("/team");
  return {};
}

// A month's pay, recorded by hand until the payroll sheet is connected.
// Recording the same month again corrects it rather than adding a second.
export async function recordSalaryPayment(input: { userId: string; period: string; amount: string; paid: string; paidOn: string; note: string }): Promise<Result> {
  if (!(await payAdmin())) return { error: "Only the admin can record pay." };
  if (!/^\d{4}-\d{2}$/.test(input.period)) return { error: "Pick the month it's for." };
  const amount = money(input.amount);
  const paid = money(input.paid || "0");
  if (amount === null || paid === null) return { error: "Those amounts aren't numbers." };
  if (paid > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return { error: "Pick the day it was paid." };
  const data = {
    amount,
    paid,
    paidAt: paid > 0 ? new Date(`${input.paidOn}T12:00:00+05:30`) : null,
    note: input.note.trim() || null,
  };
  const had = await prisma.salaryPayment.findUnique({ where: { userId_period: { userId: input.userId, period: input.period } }, select: { id: true } });
  await withUndo(
    had ? [{ table: "SalaryPayment", id: had.id }] : (r: { id: string }) => [{ table: "SalaryPayment", id: r.id }],
    () =>
      prisma.salaryPayment.upsert({
        where: { userId_period: { userId: input.userId, period: input.period } },
        create: { userId: input.userId, period: input.period, ...data },
        update: data,
      }),
    { depth: 0, label: had ? "Edited a salary payment" : "Recorded a salary payment" }
  );
  revalidatePath("/finance", "layout");
  return {};
}

export async function deleteSalaryPayment(id: string): Promise<Result> {
  if (!(await payAdmin())) return { error: "Only the admin can remove a payment." };
  await withUndo([{ table: "SalaryPayment", id }], () => prisma.salaryPayment.delete({ where: { id } }), { depth: 0, label: "Deleted a salary payment" });
  revalidatePath("/finance", "layout");
  return {};
}

// An invoice's own details: its number and currency (as Skydo will fill
// them in), and a note.
export async function updateInvoiceDetails(input: { id: string; number: string; currency: string; notes: string }): Promise<Result> {
  if (!(await payAdmin())) return { error: "Only the admin can change an invoice." };
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "A currency is three letters, like INR or USD." };
  await withUndo(
    [{ table: "Invoice", id: input.id }],
    () =>
      prisma.invoice.update({
        where: { id: input.id },
        data: { number: input.number.trim() || null, currency, notes: input.notes.trim() || null },
      }),
    { depth: 0, label: "Edited an invoice" }
  );
  revalidatePath("/finance", "layout");
  revalidatePath("/clients/[slug]", "page");
  return {};
}
