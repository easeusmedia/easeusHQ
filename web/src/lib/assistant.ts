// The admin assistant's bookkeeping, kept to as few tokens as a useful
// answer allows. Pure, so what goes to Claude on each question is testable.
//
//   question → what it needs (names, topics) → only that data, looked up
//   here → the conversation, compressed → Haiku (or Sonnet, when it's real
//   analysis) → a short answer
//
// Claude's tool calls and their results are never sent back on later
// questions: once answered, only the question and the answer's text remain.

export type Turn = { role: "user" | "assistant"; text: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

// The last few exchanges as they were (long answers clipped); anything older
// becomes one short line each, the oldest dropped once there are too many.
// No extra call to Claude to summarise: cutting costs nothing.
export function compressHistory(turns: Turn[], { keep = 6, older = 8 } = {}): { earlier: string | null; recent: Turn[] } {
  let recent = turns.slice(-keep);
  // the conversation sent must open with the admin
  while (recent[0]?.role === "assistant") recent = recent.slice(1);
  const before = turns.slice(0, turns.length - recent.length);

  const lines: string[] = [];
  for (let i = 0; i < before.length; i++) {
    const t = before[i];
    if (t.role !== "user") continue;
    const answer = before[i + 1]?.role === "assistant" ? before[i + 1].text : "";
    lines.push(`- Q: ${clip(oneLine(t.text), 100)}${answer ? ` → A: ${clip(oneLine(answer), 140)}` : ""}`);
  }
  return {
    earlier: lines.length ? lines.slice(-older).join("\n") : null,
    recent: recent.map((t) => ({ role: t.role, text: t.role === "assistant" ? clip(t.text, 900) : clip(t.text, 1500) })),
  };
}

// Sonnet for questions that ask for judgement across a lot of data; Haiku
// for everything else (finding, listing, looking up, simple summaries).
const DEEP = /\b(analy[sz]e|analysis|compare|comparison|why|trends?|insights?|recommend\w*|suggest\w*|strateg\w*|improve\w*|evaluate|assess\w*|forecast|predict\w*|review (the|all|every)|deep ?dive|report on)\b/i;
export function needsDeepModel(question: string): boolean {
  return DEEP.test(question) || question.length > 280;
}

// Which of these people or clients the question names: the full name, or
// the name's first real word (not "The", "Dr"…), as a whole word.
const SMALL = new Set(["the", "and", "for", "mr", "mrs", "ms", "dr", "team", "media", "company"]);
export function mentioned<T extends { name: string }>(question: string, items: T[]): T[] {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  const has = (w: string | undefined) => !!w && w.length >= 3 && q.includes(` ${w} `);
  return items.filter((it) => {
    const words = it.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/);
    return has(words.join(" ")) || has(words.find((w) => w.length >= 3 && !SMALL.has(w)));
  });
}

// what a topic word in the question pulls in before Claude is asked
export const TOPICS: { key: "workload" | "finance" | "contracts" | "performance"; test: RegExp }[] = [
  { key: "workload", test: /\b(pending|workload|busy|busiest|overdue|open (tasks|work)|most work|on their plate|working on|attention|priorit\w*|at risk|today)\b/i },
  { key: "finance", test: /\b(financ\w*|invoice\w*|payment\w*|revenue|salar\w*|payroll|owe\w*|outstanding|paid|money|cash)\b/i },
  { key: "contracts", test: /\bcontracts?\b/i },
  { key: "performance", test: /\b(perform\w*|kpis?|grade|mistakes?|feedback|revisions?|turnaround|on time|quality)\b/i },
];

export const clipText = clip;
