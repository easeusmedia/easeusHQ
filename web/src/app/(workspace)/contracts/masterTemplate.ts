import { prisma } from "@/lib/prisma";
import { DEFAULT_CLAUSES, type Clause } from "@/lib/contract";

export const TEMPLATE = "contract.template";

// The master template's clauses — the SOP's own until someone edits them.
// Every new contract starts from a copy of these.
export async function masterClauses(): Promise<Clause[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: TEMPLATE } });
  return row ? (JSON.parse(row.value) as Clause[]) : DEFAULT_CLAUSES;
}

