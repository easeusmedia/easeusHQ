import { boardVars, type Row } from "../../../../lib/leadImport.ts";
import type { FieldData, MessageData } from "../../../../lib/space.ts";

// What an import tells Claude about the board, and what Claude's leads
// become (importActions), apart from the server so they can be tested.

// a property's tags: all of them on any board so far (Country has dozens),
// as a tag left off the list came back as the nearest one listed (Seoul as USA)
const TAGS = 60;

// the board in words, for Claude: its properties (with their tags), the
// variables its messages fill in (with a line each is used in) and its messages
export function describe(board: { fields: FieldData[]; messages: MessageData[] }) {
  const fields = board.fields
    .filter((f) => f.kind !== "contacts" && f.kind !== "links")
    .map((f) => `- ${f.name} (${f.options.length ? `tags: ${f.options.slice(0, TAGS).map((o) => o.name).join(", ")}` : f.kind})`);
  const vars = boardVars(board).map((v) => {
    const line = board.messages.flatMap((m) => `${m.subject}\n${m.body}`.split("\n")).find((l) => l.includes(`{{${v}`));
    return `- ${v}${line ? `, as in: ${line.trim().slice(0, 120)}` : ""}`;
  });
  return [
    `Properties:\n${fields.join("\n") || "- none"}`,
    `Variables:\n${vars.join("\n") || "- none"}`,
    `Messages: ${board.messages.map((m) => `${m.name} (${m.channel})`).join(", ") || "none"}`,
  ].join("\n\n");
}

export type Extracted = {
  title: string;
  contacts: Record<string, string>[];
  links: string[];
  values?: { field: string; value: string }[];
  vars?: { name: string; value: string }[];
};

// Claude's leads as rows by the board's own names, so every column places
// itself ({{Name}} for a variable). Two values for one property (two notes
// for To check) are both kept, as a list, never only the last.
export function rowsOf(leads: Extracted[]): Row[] {
  return leads.map((l) => {
    const values: Record<string, string> = {};
    for (const { field, value } of l.values ?? []) {
      const had = values[field]?.split(", ") ?? [];
      if (!had.includes(value)) values[field] = [...had, value].join(", ");
    }
    return { title: l.title, contacts: l.contacts, links: l.links, ...values, ...Object.fromEntries((l.vars ?? []).map((v) => [`{{${v.name}}}`, v.value])) };
  });
}
