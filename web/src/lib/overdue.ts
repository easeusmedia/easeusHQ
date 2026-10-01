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

// The overdue notice, in the app's voice: clear about what's late and what
// to do next, firm as it repeats, and always courteous. To whoever's
// responsible, an ask; to everyone else, what happened and how to help.
export function overdueText({ title, due, strike, owner, toOwner }: { title: string; due: string | null; strike: number; owner: string | null; toOwner: boolean }) {
  const was = `was due${due ? ` on ${due}` : ""} and isn't finished yet.`;
  if (toOwner) {
    const push = strike === 1 ? "" : strike === 2 ? " This is the second time it has slipped, so please make it a priority." : ` It has now slipped ${strike} times, so please treat it as urgent.`;
    return `"${title}" ${was} Please set a new due date and add a short reason.${push}`;
  }
  const name = owner?.split(" ")[0];
  const slipped = strike === 1 ? "" : ` It has slipped ${strike === 2 ? "twice" : `${strike} times`}.`;
  return `${name ? `${name}'s task` : "A task"} "${title}" ${was}${slipped} Please check in${name ? ` with ${name}` : ""} and help get it back on track.`;
}
