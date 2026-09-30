import type { Period, PeriodKind } from "@/lib/editorKpi";
import type { Letter, Summary, VideoScore, VideoScoring } from "@/lib/videoScore";
import type { ScoredVideo } from "@/lib/videoScores";
import type { VideoCardView } from "./ui";

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

// A scored video as a card. Numbers only when the viewer may see them:
// an editor sees letters, and nothing else reaches their browser.
export function videoCard(v: ScoredVideo, numbers: boolean): VideoCardView {
  const s = v.score;
  return {
    id: v.id,
    title: v.title,
    where: v.client,
    day: v.day,
    tier: s.letter.quality === "S" || s.letter.quality === "A+" ? s.letter.quality : null,
    overall: s.letter.overall,
    score: numbers ? s.overall : null,
    parts: { quality: s.letter.quality, efficiency: s.letter.efficiency, client: s.letter.client },
    grade: s.quality.grade,
    mistakes: s.quality.mistakes + s.client.mistakes,
  };
}

// the one thing behind each of an editor's three averages
export function summaryFacts(sum: Summary): Record<"quality" | "efficiency" | "client", string> {
  return {
    quality: sum.graded ? `${plural(sum.graded, "video")} graded` : "None graded yet",
    efficiency: `${plural(sum.videos, "video")} handed over`,
    client: sum.client === null ? "None with a client yet" : "",
  };
}

// the one thing behind each of a video's three scores
export function videoFacts(s: VideoScore): Record<"quality" | "efficiency" | "client", string> {
  const q = s.quality;
  const e = s.efficiency;
  const c = s.client;
  return {
    quality: !q.grade ? "Awaiting grade" : [q.mistakes ? plural(q.mistakes, "mistake") : "No mistakes", q.praise ? plural(q.praise, "praise", "praise") : ""].filter(Boolean).join(" · "),
    efficiency: !e.sentAt ? "Not handed over yet" : [e.late ? `${plural(e.late, "day")} late` : "On time", e.ours ? plural(e.ours, "revision") : ""].filter(Boolean).join(" · "),
    client: !c.reached ? "Not with the client yet" : c.creative + c.mistakes ? [c.creative ? plural(c.creative, "change") : "", c.mistakes ? plural(c.mistakes, "mistake") : ""].filter(Boolean).join(" · ") : "Accepted as it was",
  };
}

// the middle of a letter's band: where an editor's chart plots a week, so
// the exact score never reaches their browser
export function bandMiddle(letter: Letter | null, bands: VideoScoring["bands"]): number | null {
  if (!letter) return null;
  const top: Record<Letter, number> = { S: 100, "A+": bands.S, A: bands["A+"], B: bands.A, C: bands.B, D: bands.C };
  const bottom: Record<Letter, number> = { S: bands.S, "A+": bands["A+"], A: bands.A, B: bands.B, C: bands.C, D: Math.max(0, bands.C - 10) };
  return (top[letter] + bottom[letter]) / 2;
}
