import { hoursLabel, type Kpis, type Part, type Period, type PeriodKind, type Targets } from "@/lib/editorKpi";

// the query that puts a page on this period; empty for this week, the default
export function periodQuery(p: Pick<Period, "kind" | "from" | "to" | "current">): string {
  if (p.kind === "week") return p.current ? "" : `view=week&week=${p.from}`;
  if (p.kind === "month") return `view=month&month=${p.from.slice(0, 7)}`;
  return `view=range&from=${p.from}&to=${p.to}`;
}

// what a period is compared with
export const AGAINST: Record<PeriodKind, string> = { week: "last week", month: "last month", range: "the days before" };

// the number each part is read as, in its own terms
export function partText(part: Part, k: Kpis): string {
  const v = k.parts[part].value;
  if (v === null) return "–";
  if (part === "speed") return `${v}%`;
  if (part === "output") return `${v}/${k.parts.output.target}`;
  return String(v);
}

export function partNote(part: Part, k: Kpis): string {
  const target = k.parts[part].target;
  switch (part) {
    case "quality":
      return `mistakes a video · aim ${target}`;
    case "output":
      return "reel-equivalents · aim 100%";
    case "speed":
      return k.rated < 2 ? `timed on ${k.rated} video${k.rated === 1 ? "" : "s"} · too few to judge` : `within standard · aim ${target}%`;
    case "revisions":
      return `sent back a video · aim ${target}`;
    case "issues":
      return k.stale ? `open · ${k.stale} passed over` : "open issues · aim 0";
  }
}

// "4h", "1.5d"
export const hours = (h: number | null, t: Targets) => (h === null ? "–" : hoursLabel(h, t));
