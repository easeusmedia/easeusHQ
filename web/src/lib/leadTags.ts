import type { Prisma } from "@prisma/client";
import { TAB_TAG_COLOR, TAGS, tabTag } from "./leadSheet.ts";

// A lead put on a Leads tab that has a tag of its own (lib/leadSheet tabTag:
// POD-CORE's leads are Core, POD-AMP's Amplifier) takes it, on its Tags
// property; the tag is made the first time it's needed. However it got
// there: added in the app, by Claude (add_leads) or moved from another tab.
export async function withTabTag(tx: Prisma.TransactionClient, board: { id: string; name: string }, values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const name = tabTag(board.name);
  if (!name) return values;
  const field = await tx.boardField.findFirst({
    where: { boardId: board.id, kind: "multi", name: { equals: TAGS, mode: "insensitive" } },
    select: { id: true, options: { select: { id: true, name: true, sortOrder: true } } },
  });
  if (!field) return values;
  const option =
    field.options.find((o) => o.name.trim().toLowerCase() === name.toLowerCase()) ??
    (await tx.fieldOption.create({ data: { fieldId: field.id, name, color: TAB_TAG_COLOR[name] ?? "blue", sortOrder: Math.max(0, ...field.options.map((o) => o.sortOrder)) + 1 }, select: { id: true } }));
  const had = Array.isArray(values[field.id]) ? (values[field.id] as string[]) : [];
  return had.includes(option.id) ? values : { ...values, [field.id]: [...had, option.id] };
}
