// What an undo (or a redo) has to do, worked out from rows alone, so it can
// be tested without a database (lib/undo runs it).
//
// A step keeps the rows a change touched, before and after: the row itself
// and what hangs off it. To undo is to go from "after" back to "before"; to
// redo, the other way. Only the columns the change itself changed are put
// back, so whatever else happened to a row since stays as it is. If one of
// those columns has been changed again since, by anyone, it isn't undone.

export type Row = Record<string, unknown>;
// t: the table; d: how far from the changed row (0 is the row itself); c: for
// a row that only points at it and stays when it goes (Prisma's SetNull), the
// column that points; r: the row; x: a row of that kind the change deleted
// (r is how it was), so a redo deletes it again
export type Kept = { t: string; d: number; c?: string; r: Row; x?: true };

// columns that change on their own (readAt: marked on being seen, as a new
// notice is the moment Home shows it), or only order things: never a step,
// never a conflict
const IGNORE = new Set(["updatedAt", "lastSeenAt", "readAt", "sortOrder"]);

// the same value, whatever order a JSON object's keys come back in
export function stable(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v as Row)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable((v as Row)[k])}`)
    .join(",")}}`;
}

export const keyOf = (k: { t: string; r: Row }) => `${k.t}:${typeof k.r.id === "string" || typeof k.r.id === "number" ? k.r.id : stable(k.r)}`;

export function changedCols(a: Row, b: Row): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((c) => !IGNORE.has(c) && stable(a[c]) !== stable(b[c]));
}

const byKey = (rows: Kept[]) => new Map(rows.map((k) => [keyOf(k), k]));

// whether a change changed anything worth undoing
export function changedAny(before: Kept[], after: Kept[]): boolean {
  const a = byKey(before);
  const b = byKey(after);
  if ([...a.keys()].some((k) => !b.has(k)) || [...b.keys()].some((k) => !a.has(k))) return true;
  return [...a].some(([k, x]) => !!x.x !== !!b.get(k)!.x || changedCols(x.r, b.get(k)!.r).length > 0);
}

export type Plan = {
  conflict?: Kept; // a row changed again since: nothing is done
  deletes: Kept[]; // the furthest first
  inserts: Kept[]; // the row itself first
  updates: { k: Kept; cols: string[] }[];
  links: { k: Kept; value: unknown }[]; // a pointing column set (to null, to unlink)
};

// From `from` (how the rows were left) to `to` (how they should be), given
// how they are `now` (by keyOf; a row that's gone isn't there).
export function plan(from: Kept[], to: Kept[], now: Map<string, Row>): Plan {
  const f = byKey(from);
  const t = byKey(to);
  const out: Plan = { deletes: [], inserts: [], updates: [], links: [] };
  for (const key of new Set([...f.keys(), ...t.keys()])) {
    const a = f.get(key);
    const b = t.get(key);
    const n = now.get(key);
    const kept = (a ?? b)!.c;
    if (a && b && !!a.x !== !!b.x) {
      if (b.x) {
        // the change deleted it: it goes again
        if (!n) continue;
        if (changedCols(n, a.r).length) return { ...out, conflict: a };
        out.deletes.push(a);
      } else if (!n) out.inserts.push(b); // it was deleted: back it comes
      continue;
    }
    if (a?.x || b?.x) continue;
    if (a && b) {
      const cols = changedCols(a.r, b.r);
      if (!cols.length) continue;
      if (!n) {
        if (kept) continue;
        return { ...out, conflict: a };
      }
      if (cols.some((c) => stable(n[c]) !== stable(a.r[c]))) return { ...out, conflict: a };
      out.updates.push({ k: b, cols });
    } else if (b) {
      // there before, gone after: back it comes (or, if it only pointed here, it points here again)
      if (!n) out.inserts.push(b);
      else if (kept && n[kept] == null) out.links.push({ k: b, value: b.r[kept] });
    } else if (a) {
      // made by the change: it goes (or, if it only pointed here, it stops pointing)
      if (!n) continue;
      if (kept) {
        if (stable(n[kept]) === stable(a.r[kept])) out.links.push({ k: a, value: null });
        continue;
      }
      if (changedCols(n, a.r).length) return { ...out, conflict: a };
      out.deletes.push(a);
    }
  }
  out.deletes.sort((x, y) => y.d - x.d);
  out.inserts.sort((x, y) => x.d - y.d);
  return out;
}
