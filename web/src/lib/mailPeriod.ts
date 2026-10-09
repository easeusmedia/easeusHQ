// The Email report's periods (lib/mailReport.ts): plain dates, tested

export const RANGES = { day: "Yesterday", week: "Last week", month: "Last month", year: "Last year" } as const;
export type Range = keyof typeof RANGES;

// Whole days, weeks (Monday to Sunday), months and years in India, as
// Mailsuite's report has them: yesterday, last week, last month, last year,
// each against the one before it
const IST = 5.5 * 3_600_000;
const istMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - IST);
export function period(range: Range, now = new Date()) {
  const t = new Date(now.getTime() + IST);
  const [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()];
  const monday = d - ((t.getUTCDay() + 6) % 7);
  const bounds: Record<Range, [Date, Date, Date]> = {
    day: [istMidnight(y, m, d - 2), istMidnight(y, m, d - 1), istMidnight(y, m, d)],
    week: [istMidnight(y, m, monday - 14), istMidnight(y, m, monday - 7), istMidnight(y, m, monday)],
    month: [istMidnight(y, m - 2, 1), istMidnight(y, m - 1, 1), istMidnight(y, m, 1)],
    year: [istMidnight(y - 2, 0, 1), istMidnight(y - 1, 0, 1), istMidnight(y, 0, 1)],
  };
  const [prevStart, start, end] = bounds[range];
  return { prevStart, start, end, label: periodLabel(range, start, end), prevLabel: periodLabel(range, prevStart, start) };
}
function periodLabel(range: Range, start: Date, end: Date) {
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", ...o });
  const last = new Date(end.getTime() - 1);
  if (range === "day") return f(start, { day: "numeric", month: "short", year: "numeric" });
  if (range === "week") return `${f(start, { day: "numeric", month: "short" })} to ${f(last, { day: "numeric", month: "short", year: "numeric" })}`;
  if (range === "month") return f(start, { month: "long", year: "numeric" });
  return f(start, { year: "numeric" });
}
