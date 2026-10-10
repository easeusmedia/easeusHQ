// Who hears when a task goes past its completion date, by the strike it's
// on (how many times it has gone past a date) and the level of whoever it's
// on. Agreed with Abhishek, 1 Oct 2026:
//
//   Level 3's task   strikes 1 and 2: them and their department's Level 2;
//                    strike 3 on: Level 1 as well
//   Level 2's task   strike 1: them; strike 2 on: Level 1 as well
//   Level 1's task   them
export function overdueAudience(strike: number, level: string): { leads: boolean; levelOne: boolean } {
  if (level === "employee") return { leads: true, levelOne: strike >= 3 };
  if (level === "core") return { leads: false, levelOne: strike >= 2 };
  return { leads: false, levelOne: false };
}

// "1st", "2nd", "3rd", "4th"
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

// The overdue notice, in the app's voice: short, clear about what's late
// and what to do next, firmer as it repeats, and always courteous. To
// whoever's responsible, an ask; to everyone else, what happened and how to
// help. (Shortened 11 Oct 2026: Home read as a wall of text.)
export function overdueText({ title, due, strike, owner, toOwner }: { title: string; due: string | null; strike: number; owner: string | null; toOwner: boolean }) {
  const late = `is overdue${due ? ` (due ${due})` : ""}.`;
  if (toOwner) {
    const push = strike === 1 ? "" : strike === 2 ? " Second slip, please make it a priority." : ` Slipped ${strike} times, please treat it as urgent.`;
    return `"${title}" ${late} Please set a new date and a short reason.${push}`;
  }
  const name = owner?.split(" ")[0];
  const slipped = strike === 1 ? "" : ` Slipped ${strike === 2 ? "twice" : `${strike} times`}.`;
  return `${name ? `${name}'s ` : ""}"${title}" ${late}${slipped} Please check in${name ? ` with ${name}` : ""}.`;
}

// A Level 2 or 3 has a day to answer an overdue notice (a new date and a
// reason). Past that, while the task is still past the date the notice was
// about, the app is locked for them until they do.
export const ANSWER_WITHIN_MS = 24 * 60 * 60 * 1000;
export function needsAnswer(t: { dueDate: Date | null; overdueFor: Date | null; noticeAt: Date | null }, now: Date): boolean {
  if (!t.dueDate || !t.overdueFor || !t.noticeAt) return false;
  // a date moved since the notice is a new date, not the one it was about
  if (t.overdueFor.getTime() !== t.dueDate.getTime()) return false;
  return now.getTime() - t.noticeAt.getTime() > ANSWER_WITHIN_MS;
}
