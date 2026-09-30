import type { Kpis, Part, Period, PeriodKind } from "@/lib/editorKpi";

// the query that puts a page on this period; empty for this week, the default
export function periodQuery(p: Pick<Period, "kind" | "from" | "to" | "current">): string {
  if (p.kind === "week") return p.current ? "" : `view=week&week=${p.from}`;
  if (p.kind === "month") return `view=month&month=${p.from.slice(0, 7)}`;
  if (p.kind === "all") return "view=all";
  return `view=range&from=${p.from}&to=${p.to}`;
}

// what a period is compared with
export const AGAINST: Record<PeriodKind, string> = { week: "last week", month: "last month", range: "the days before", all: "" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// the one thing to know under each part's score
export function facts(k: Kpis): Record<Part, string> {
  return {
    quantity: `${Math.round(k.units * 10) / 10} of ${Math.round(k.target)} reels${k.timed ? ` · ${k.within} of ${k.timed} on time` : ""}`,
    quality: !k.completed ? "No video finished" : k.mistakes ? `${plural(k.mistakes, "mistake")}${k.repeated ? `, ${k.repeated} repeated` : ""}` : "No mistakes",
    feedback: !k.positive && !k.negative ? "Nothing given yet" : [k.positive && plural(k.positive, "praise", "praise"), k.negative && plural(k.negative, "concern")].filter(Boolean).join(" · "),
  };
}
