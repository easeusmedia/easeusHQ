// Telling our work apart from what a client posts themselves.
//
// Nothing on a public post says who edited it, so a post counts as ours when
// someone here says so, or — until they do — when it matches one of our
// tasks for that client: the same subject (the task title's words, found in
// the post's title or caption) around the same time (from a week before the
// task was made to 45 days after it went out). Channels we run outright can
// be set to count everything instead (SocialAccount.allOurs).

// words that say what a task *is*, not what it's about
const FORMAT = new Set(["trailer", "reel", "reels", "short", "shorts", "clip", "clips", "episode", "podcast", "thumbnail", "video", "videos", "part", "final", "edit", "long", "form", "longform", "bonus"]);
const STOP = new Set([
  "what", "your", "with", "this", "that", "about", "from", "have", "they", "their", "there", "when", "will", "into",
  "more", "most", "just", "like", "does", "mean", "really", "need", "needs", "know", "make", "made", "every", "over",
  "than", "then", "them", "been", "being", "here", "only", "also", "some", "were", "which", "while", "would", "could",
  "should", "these", "those", "after", "before", "because", "doing", "things", "thing", "people", "actually",
]);

// the words of a title or caption that could say what it's about
export function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length >= 4 && !STOP.has(w) && !FORMAT.has(w))
    ),
  ];
}

// "lasers" is "laser", "expansion" is "expanding": the same word if one
// starts with the other, or they share their first five letters
const same = (a: string, b: string) => a.startsWith(b) || b.startsWith(a) || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

// A task's subject: its title without the client's name in front
// ("Tego - Skin Boosters" → skin, boosters)
export function taskSubject(title: string): string[] {
  const parts = title.split(" - ");
  return keywords(parts.length > 1 ? parts.slice(1).join(" ") : title);
}

// Whether a post is about what a task was about. A short subject needs all
// of its words — "Skin Boosters" finds "Skin-boosters vs Biostimulators",
// but "The Best Treatment" can't claim every post that says "treatments".
// A longer one needs at least half, including a distinctive word (six
// letters or more).
export function sameSubject(subject: string[], postWords: string[]): boolean {
  if (!subject.length) return false;
  const hits = subject.filter((w) => postWords.some((p) => same(w, p)));
  if (hits.length === subject.length) return true;
  return subject.length > 2 && hits.length * 2 >= subject.length && hits.some((w) => w.length >= 6);
}

export type TaskWindow = { title: string; from: string; to: string }; // yyyy-mm-dd

// The task a post is most likely the result of, if any
export function matchTask(post: { title: string; published: string }, tasks: TaskWindow[]): string | null {
  const words = keywords(post.title);
  const hit = tasks.find((t) => post.published >= t.from && post.published <= t.to && sameSubject(taskSubject(t.title), words));
  return hit?.title ?? null;
}

// Whether a post counts towards our numbers
export const counts = (ours: boolean | null, allOurs: boolean) => ours === true || (ours === null && allOurs);
