import { DELIVERABLE_LABEL, TYPE_TAG } from "./contentPlan.ts";

// Which project placeholder a task fills (Abhishek, 21 Oct 2026): pure, so
// the rules are tested on their own; lib/deliverableLink.ts does the writes.

// A placeholder's kind in the blueprint's words, whatever the Notion import
// spelled it ("Reels", "TRAILER", "Long form"); null for anything else
export function kindOf(contentType: string): string | null {
  const t = contentType.toLowerCase();
  if (t.includes("long")) return "YouTube Long-Form";
  if (t.includes("trailer")) return "Reel Trailer";
  if (t.includes("bonus")) return "Bonus Reel";
  if (t.includes("reel")) return "Reel";
  if (t.includes("thumb")) return "Thumbnails";
  if (t.includes("audio")) return "Audio";
  return null;
}

// The deliverable kinds a task can fill, from its kind of work (its tags):
// the blueprint's own pairs (contentPlan TYPE_TAG), turned round, and a
// podcast edit is the long-form. A Reel tag is a bonus reel only when its
// title says so.
const TAG_TYPES: Record<string, string[]> = { "podcast editing": ["YouTube Long-Form"] };
for (const [type, tag] of Object.entries(TYPE_TAG)) (TAG_TYPES[tag.toLowerCase()] ??= []).push(type);

// with no tags at all, what its title says it is ("YouTube Long-Form · Jan
// Birley" from the blueprint has none); the first that fits
const TITLE_TYPES: [RegExp, string][] = [
  [/trailer/i, "Reel Trailer"],
  [/long[- ]?form|podcast edit/i, "YouTube Long-Form"],
  [/thumbnail/i, "Thumbnails"],
  [/bonus reel/i, "Bonus Reel"],
  [/\breels?\b/i, "Reel"],
  [/\baudio\b/i, "Audio"],
];

// Work around a deliverable rather than the deliverable itself (Abhishek, 27
// Oct 2026): posting it, its caption or cover, a round of amends or a fix,
// a review. Untagged, a title like these fills no placeholder even when it
// says "reel" ("Reel Cover For Pip Episode", "Amends to be done (Reels)").
const AROUND = /\b(post(s|ing|ed)?|schedul\w*|captions?|copy|covers?|upload(s|ing)?|social|story|stories|amends?|amendments?|corrections?|rectif\w*|fix(es|ing)?|review(s|ing)?|analysis|feedback|meeting|research|scripts?|brief|ideas?|planning|plan|report)\b/i;

export function typesOf(tags: string[], title: string): string[] {
  // tagged with other kinds of work only (Reel curation, a post): none
  if (tags.length) {
    const bonus = /bonus/i.test(title);
    return [...new Set(tags.flatMap((t) => TAG_TYPES[t.toLowerCase()] ?? []))].filter((t) => (t === "Reel" ? !bonus : t === "Bonus Reel" ? bonus : true));
  }
  if (AROUND.test(title)) return [];
  const hit = TITLE_TYPES.find(([re]) => re.test(title));
  return hit ? [hit[1]] : [];
}

// "Elle Sera Reel 3", "Reel 3 · Jan Birley", "Jan Birley Reel 3": 3
export function numberOf(text: string): number | null {
  const m = text.match(/(?:reel|trailer|thumbnail|long[- ]?form|audio)\s*#?\s*(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

export type Slot = { id: string; name: string; contentType: string; due: string | null; sortOrder: number; taskId: string | null; link: string | null };

// The placeholder it fills: the one it already holds while it's still that
// kind; else a free one of its kind (no task, and no link but its own Drive
// link) with the same number as its title, else the one due first.
export function pickSlot(task: { id: string; title: string; types: string[]; driveLink?: string | null }, slots: Slot[]): Slot | null {
  const fits = (s: Slot) => task.types.includes(kindOf(s.contentType) ?? "");
  const held = slots.find((s) => s.taskId === task.id && fits(s));
  if (held) return held;
  const free = slots
    .filter((s) => fits(s) && !s.taskId && (!s.link || s.link === task.driveLink))
    .sort((a, b) => task.types.indexOf(kindOf(a.contentType)!) - task.types.indexOf(kindOf(b.contentType)!) || (a.due ?? "9").localeCompare(b.due ?? "9") || a.sortOrder - b.sortOrder);
  const n = numberOf(task.title);
  // one already holding its file comes first (filled by hand, or from Notion)
  return (task.driveLink && free.find((s) => s.link === task.driveLink)) || (n !== null && free.find((s) => numberOf(s.name) === n)) || free[0] || null;
}

// One more placeholder, for a delivered task its project had none left
// for: "Jan Birley Reel 7" after six reels, "Jan Birley Thumbnail" if none
export function extraName(projectName: string, type: string, slots: Slot[]): string {
  const label = DELIVERABLE_LABEL[type] ?? type;
  const had = slots.filter((s) => kindOf(s.contentType) === type).length;
  return had ? `${projectName} ${label} ${had + 1}` : `${projectName} ${label}`;
}
