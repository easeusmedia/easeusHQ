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
  label: string;
  ids: string[];
  // the invoice for this batch is due (monthly: its day has passed;
  // milestone: all N projects are in)
  complete: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
const pad = (n: number) => String(n).padStart(2, "0");

// Newest batch first. `date` is yyyy-mm-dd; `today` too.
export function invoiceBatches(items: { id: string; date: string }[], rule: BillingRule, today: string): Batch[] {
  const oldestFirst = [...items].sort((a, b) => a.date.localeCompare(b.date));

  if (rule.cadence === "milestone" && rule.every && rule.every > 0) {
    const n = rule.every;
    const batches: Batch[] = [];
    for (let i = 0; i < oldestFirst.length; i += n) {
      const ids = oldestFirst.slice(i, i + n).map((p) => p.id);
      const number = i / n + 1;
      const complete = ids.length === n;
      batches.push({
        key: `batch-${number}`,
        label: complete ? `Batch ${number}` : `Batch ${number} (${ids.length}/${n})`,
        ids,
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
        return { key, label, ids, complete: `${key}-${pad(invoiceDay)}` < today };
      });
  }

  return [];
}

// How the rule reads in words, for the filter's heading.
export function describeRule(rule: BillingRule): string | null {
  if (rule.cadence === "milestone" && rule.every) return `Invoiced every ${rule.every} project${rule.every === 1 ? "" : "s"}`;
  if (rule.cadence === "monthly_date") {
    const day = rule.dayOfMonth ?? 31;
    return day >= 28 ? "Invoiced at each month end" : `Invoiced on day ${day} of each month`;
  }
  return null;
}
