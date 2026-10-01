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
