import { hoursLabel, type Kpis, type Period, type PeriodKind } from "@/lib/editorKpi";

// the query that puts a page on this period; empty for this week, the default
export function periodQuery(p: Pick<Period, "kind" | "from" | "to" | "current">): string {
  if (p.kind === "week") return p.current ? "" : `view=week&week=${p.from}`;
  if (p.kind === "month") return `view=month&month=${p.from.slice(0, 7)}`;
  return `view=range&from=${p.from}&to=${p.to}`;
}

// what a period is compared with
export const AGAINST: Record<PeriodKind, string> = { week: "last week", month: "last month", range: "the days before" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// what's behind each of the three scores, in a line or two
export function quantityLines(k: Kpis): string[] {
  return [
    `${k.units} of ${k.target} reels${k.byType.length > 1 || (k.byType[0] && k.byType[0].type !== "Reel") ? ` · ${k.byType.map((t) => `${t.count} ${t.type.toLowerCase()}`).join(", ")}` : ""}`,
    k.timed ? `${k.within} of ${plural(k.timed, "video")} within time${k.editHours !== null ? ` · typical ${hoursLabel(k.editHours)}` : ""}` : "No video timed yet",
  ];
}

export function qualityLines(k: Kpis): string[] {
  if (!k.completed) return [k.mistakes ? `${plural(k.mistakes, "mistake")}, no video finished yet` : "No video finished yet"];
  return [`${plural(k.mistakes, "mistake")}${k.repeated ? `, ${k.repeated} repeated` : ""} · ${plural(k.revisions, "revision")}`, `${k.perVideo} a video, over ${plural(k.completed, "video")}`];
}

export function ratingLines(k: Kpis): string[] {
  if (!k.positive && !k.negative) return ["No praise or concerns, so it holds at the start"];
  return [`${plural(k.positive, "praise", "praise")} · ${plural(k.negative, "concern")}`, `${k.net >= 0 ? "+" : ""}${k.net} on the start`];
}
