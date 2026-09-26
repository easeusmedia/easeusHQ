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
// Either can be overridden per project (Project.invoiceBatch, set by
// dragging it to another invoice or picking one on the project's page): a
// pinned project sits in the invoice it was put in, whatever its date says.
//
// Pure (no database, no locale) so the arithmetic is testable on its own.

export type BillingRule = {
  cadence: "monthly_date" | "milestone" | null;
  dayOfMonth: number | null;
  every: number | null;
};

export type Batch = {
  key: string;
  // what the invoice is called: "Invoice 3", "Aug 2026"
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

// open: not finished yet — in an invoice only because someone put it there
type Item = { id: string; date: string; pin?: string | null; open?: boolean };

const MILESTONE_KEY = /^batch-(\d+)$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;

// Newest batch first. `date` is yyyy-mm-dd; `today` too. A pin that doesn't
// fit the rule in force (a "batch-3" after switching to monthly) is ignored.
export function invoiceBatches(items: Item[], rule: BillingRule, today: string): Batch[] {
  const oldestFirst = [...items].sort((a, b) => a.date.localeCompare(b.date));

  if (rule.cadence === "milestone" && rule.every && rule.every > 0) {
    const n = rule.every;
    const thisYear = today.slice(0, 4);
    // pinned ones first, where they were put; the rest fill up from the
    // newest pinned invoice on, so new work never lands in one already sent
    const at = new Map<string, number>();
    const size = new Map<number, number>();
    const add = (id: string, k: number) => {
      at.set(id, k);
      size.set(k, (size.get(k) ?? 0) + 1);
    };
    for (const p of oldestFirst) {
      const m = p.pin?.match(MILESTONE_KEY);
      if (m) add(p.id, Number(m[1]));
    }
    // from the newest invoice with finished work in it — an unfinished
    // project put in a later one ahead of time mustn't drag everything after it
    let k = Math.max(1, ...oldestFirst.filter((p) => !p.open && at.has(p.id)).map((p) => at.get(p.id)!));
    for (const p of oldestFirst) {
      if (at.has(p.id)) continue;
      while ((size.get(k) ?? 0) >= n) k++;
      add(p.id, k);
    }
    const last = Math.max(0, ...size.keys());
    const batches: Batch[] = [];
    for (let i = 1; i <= last; i++) {
      const group = oldestFirst.filter((p) => at.get(p.id) === i);
      if (!group.length) continue; // everything moved out of it
      // an earlier invoice that's short only because work was moved out of
      // it is still a closed invoice
      const complete = group.length >= n || i < last;
      batches.push({
        key: `batch-${i}`,
        label: `Invoice ${i}`,
        detail: complete
          ? `${shortDate(group[0].date, thisYear)} – ${shortDate(group.at(-1)!.date, thisYear)}`
          : `${group.length} of ${n} done`,
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
      const key = p.pin && MONTH_KEY.test(p.pin) ? p.pin : `${y}-${pad(m)}`;
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

  // No rule to group by: the invoices are just the numbers someone gave
  // projects by hand.
  const byNumber = new Map<number, Item[]>();
  for (const p of oldestFirst) {
    const m = p.pin?.match(MILESTONE_KEY);
    if (m) byNumber.set(Number(m[1]), [...(byNumber.get(Number(m[1])) ?? []), p]);
  }
  const thisYear = today.slice(0, 4);
  return [...byNumber.entries()]
    .sort(([a], [b]) => b - a)
    .map(([k, list]) => ({
      key: `batch-${k}`,
      label: `Invoice ${k}`,
      detail: `${shortDate(list[0].date, thisYear)} – ${shortDate(list.at(-1)!.date, thisYear)}`,
      ids: list.map((p) => p.id),
      complete: true,
    }));
}

// Whether an invoice's been paid, from what's recorded on its projects
// (paid / unpaid, or nothing — rows from Notion often carry nothing).
export type Payment = "paid" | "unpaid" | "part_paid" | "not_sent" | "not_marked";

export function batchPayment(statuses: (string | null)[], complete: boolean): Payment {
  const known = statuses.filter((s) => s === "paid" || s === "unpaid");
  if (known.length > 0 && known.every((s) => s === "paid")) return "paid";
  // still filling up (or this month isn't over): nothing to pay yet
  if (!complete) return "not_sent";
  if (known.some((s) => s === "paid")) return "part_paid";
  if (known.length > 0) return "unpaid";
  return "not_marked";
}

// A client's invoices straight from its project rows (server side): its
// finished work, and anything someone has already put in an invoice by hand,
// finished or not.
export function clientBatches(
  projects: { id: string; completedAt: Date | null; createdAt: Date; invoiceBatch: string | null }[],
  rule: BillingRule,
  today: string
): Batch[] {
  return invoiceBatches(
    projects.flatMap((p) =>
      p.completedAt || p.invoiceBatch
        ? [{ id: p.id, date: (p.completedAt ?? p.createdAt).toISOString().slice(0, 10), pin: p.invoiceBatch, open: !p.completedAt }]
        : []
    ),
    rule,
    today
  );
}

// Where a project can be moved: the invoices there are, plus one more after
// the newest (the next month, or the next number).
export function newBatchKey(batches: Batch[], rule: BillingRule): string | null {
  if (rule.cadence !== "monthly_date") {
    return `batch-${Math.max(0, ...batches.map((b) => Number(b.key.match(MILESTONE_KEY)?.[1] ?? 0))) + 1}`;
  }
  if (!batches.length) return null;
  const newest = batches[0].key;
  const [y, m] = newest.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

// The pins to save when one project moves. Milestone invoices are counted,
// so moving one would shuffle every later invoice by one — instead the
// invoices as they stand are pinned first, and only the one project moves.
// Monthly ones go by date, so only the moved project needs a pin.
export function pinsAfterMove(
  batches: Batch[],
  rule: BillingRule,
  projectId: string,
  key: string
): Record<string, string> {
  const valid = rule.cadence === "monthly_date" ? MONTH_KEY.test(key) : MILESTONE_KEY.test(key);
  if (!valid) return {};
  const frozen =
    rule.cadence === "milestone" ? Object.fromEntries(batches.flatMap((b) => b.ids.map((id) => [id, b.key]))) : {};
  return { ...frozen, [projectId]: key };
}
