// A client's projects split into the batches they're invoiced in, from the
// billing rule on the client's Billing tab:
//
//   milestone      every N projects is one invoice — Courageous Leaders
//                  bills every 4 podcasts. Counted oldest first, so batch 1
//                  is always the same four; the newest batch may be partial.
//   monthly_date   one invoice per month, on day D. Projects dated after
//                  day D belong to next month's invoice. A day of 28 or
//                  later means "month end" and simply uses calendar months,
//                  so the 29th–31st don't spill into the following month.
//
// Pure (no database, no locale) so the arithmetic is testable on its own.

export type BillingRule = {
  cadence: "monthly_date" | "milestone" | null;
  dayOfMonth: number | null;
  every: number | null;
};

export type Batch = {
  key: string;
  // what the invoice is called: "Invoice 3", "Current invoice", "Aug 2026"
  label: string;
  // one line of context: its date span, or how far along the open one is
  detail: string;
  ids: string[];
  // the invoice for this batch is due (monthly: its day has passed;
  // milestone: all N projects are in)
  complete: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "6 Jul", with the year only when it isn't this one
function shortDate(iso: string, thisYear: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${y === thisYear ? "" : ` ${y}`}`;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
const pad = (n: number) => String(n).padStart(2, "0");

// Newest batch first. `date` is yyyy-mm-dd; `today` too.
export function invoiceBatches(items: { id: string; date: string }[], rule: BillingRule, today: string): Batch[] {
  const oldestFirst = [...items].sort((a, b) => a.date.localeCompare(b.date));

  if (rule.cadence === "milestone" && rule.every && rule.every > 0) {
    const n = rule.every;
    const thisYear = today.slice(0, 4);
    const batches: Batch[] = [];
    for (let i = 0; i < oldestFirst.length; i += n) {
      const group = oldestFirst.slice(i, i + n);
      const complete = group.length === n;
      const span = `${shortDate(group[0].date, thisYear)} – ${shortDate(group.at(-1)!.date, thisYear)}`;
      batches.push({
        key: `batch-${i / n + 1}`,
        // the unfinished one is the invoice being worked towards right now
        label: complete ? `Invoice ${i / n + 1}` : "Current invoice",
        detail: complete ? span : `${group.length} of ${n} done`,
        ids: group.map((p) => p.id),
        complete,
      });
    }
    return batches.reverse();
  }

  if (rule.cadence === "monthly_date") {
    const day = rule.dayOfMonth ?? 31;
    const monthEnd = day >= 28;
    const byMonth = new Map<string, string[]>();
    for (const p of oldestFirst) {
      let [y, m] = p.date.split("-").map(Number);
      const d = Number(p.date.slice(8, 10));
      // after this month's invoice day → next month's invoice
      if (!monthEnd && d > Math.min(day, daysIn(y, m))) {
        m += 1;
        if (m > 12) [y, m] = [y + 1, 1];
      }
      const key = `${y}-${pad(m)}`;
      byMonth.set(key, [...(byMonth.get(key) ?? []), p.id]);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, ids]) => {
        const [y, m] = key.split("-").map(Number);
        const invoiceDay = monthEnd ? daysIn(y, m) : Math.min(day, daysIn(y, m));
        const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
        const startDay = Math.min(day, daysIn(py, pm)) + 1;
        const label = monthEnd
          ? `${MONTHS[m - 1]} ${y}`
          : `${startDay > daysIn(py, pm) ? `1 ${MONTHS[m - 1]}` : `${startDay} ${MONTHS[pm - 1]}`} – ${invoiceDay} ${MONTHS[m - 1]} ${y}`;
        const complete = `${key}-${pad(invoiceDay)}` < today;
        const count = `${ids.length} project${ids.length === 1 ? "" : "s"}`;
        return { key, label, detail: complete ? count : `${count}, not invoiced yet`, ids, complete };
      });
  }

  return [];
}
