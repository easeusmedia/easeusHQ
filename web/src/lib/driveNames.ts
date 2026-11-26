// Matching a name we hold against a folder that already exists in Drive.
//
// Creative Exports has been organised by hand for years, so its folders are
// spelled the way a person types them, not the way this app stores them:
// "Broker Brunch" for The Broker Brunch, "Dr. Tego" for Dr Tego. Creating a
// folder per client without checking would put a second "Dr Tego" next to
// "Dr. Tego" and split a client's deliveries across both.
//
// Deliberately forgiving about punctuation, case, spacing and a leading
// "The", and deliberately not forgiving about anything else: matching on a
// shared word would file Elle Sera's work under Elle Sera Ad.

export function normalizeFolderName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/ /g, " ") // a non-breaking space is still a space
      .trim()
      // A hand-ordered folder often carries its position: "1. Reels",
      // "02 - Trailer", "3) Ads". The number is ordering, not name. It only
      // counts as a prefix when a separator follows it, so "2025" stays
      // 2025 (otherwise every year folder would normalize to nothing and
      // they'd all match each other) and "1 August - 13 Sept" keeps its day.
      .replace(/^\d{1,3}\s*[.)\-:]\s*/, "")
      .replace(/[.,'’"`]/g, "") // Dr. Tego -> dr tego
      .replace(/[_\-–—]+/g, " ") // hyphens and dashes read as spaces
      .replace(/&/g, "and")
      // "25th June" and "25 June" are the same date written by two people
      .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^the /, "") // The Broker Brunch -> broker brunch
  );
}

// The folder to put this in, out of what's already there. Null means there
// isn't one yet and the caller should create it under the real name.
export function matchFolder<T extends { name: string }>(wanted: string, existing: T[]): T | null {
  const target = normalizeFolderName(wanted);
  if (!target) return null;
  return existing.find((f) => normalizeFolderName(f.name) === target) ?? null;
}

// ---- a project's folder, wherever the client keeps it (Abhishek, 26 Nov 2026) ----
//
// Each client's folder is laid out its own way: Courageous Leaders keeps its
// projects straight inside ("Room 101"), Elle Sera by year ("2026 / 28.
// Liberty Mills"), Dr Ifeoma by month. A project is found by its words: the
// same name ("Room 101"), one inside the other ("Sergio Lopez Solo" for Sergio
// Lopez, "Paige Chohan" for "Podcast 28 Elle Sera X Paige Chohan"), with
// bracketed notes ("[Home]", "(Podcast 3)") and position numbers set aside.
// A number has to agree: Podcast 1 is never Podcast 10.

const FILLER = new Set(["x", "and", "with", "solo", "jo", "podcast", "episode", "ep"]);
const words = (name: string) =>
  normalizeFolderName(name.replace(/\[[^\]]*\]|\([^)]*\)/g, " "))
    .split(" ")
    .filter((w) => w && !FILLER.has(w));

// How well a folder's name fits the project's: 3 the same, 2 one's words all
// in the other's (two words or more), 1 a single word that starts the other
// ("Katie" for Katie Jackson), 0 not this project
export function projectFolderScore(project: string, folder: string): number {
  const p = words(project);
  const f = words(folder);
  if (!p.length || !f.length) return 0;
  if (p.join(" ") === f.join(" ")) return 3;
  const [small, big] = f.length <= p.length ? [f, p] : [p, f];
  if (!small.every((w) => big.includes(w))) return 0;
  if (small.length >= 2) return 2;
  return big[0] === small[0] && !/^\d+$/.test(small[0]) ? 1 : 0;
}

// The folders a kind of work goes in, by the names people use for them; the
// first is the one made when a project has none. The order matters: a reel's
// trailer is a trailer, a bonus reel isn't one of the reels.
const TYPE_FOLDERS: [RegExp, string[]][] = [
  [/trailer/i, ["Trailer", "Trailers"]],
  [/bonus/i, ["Bonus Reel", "Bonus Reels"]],
  [/long[- ]?form|full|episode|podcast edit/i, ["Full Length", "Full Length Episode", "Youtube Video", "Youtube Long Forms", "Long Form", "Episode", "Episodes"]],
  [/thumbnail/i, ["Thumbnails", "Thumbnail", "Thumbnails & Covers"]],
  [/audio/i, ["Audio", "Audio File"]],
  [/carousel/i, ["Carousels", "Carousel"]],
  [/copy|caption|description/i, ["Copy", "YT Copy", "YouTube Copy"]],
  [/reel/i, ["Reels", "Instagram Reels", "Reel"]],
];
const typeNames = (type: string) => TYPE_FOLDERS.find(([re]) => re.test(type))?.[1] ?? null;

// Where in a project a kind of work goes: the folder it has for it (by any of
// its names, then one that starts with one: "Full Length Epidose"), else the
// name to make. Null for work of no kind we know: the project folder itself.
export function typeFolder<T extends { name: string }>(type: string | null, existing: T[]): { found: T } | { make: string } | null {
  const names = type ? typeNames(type) : null;
  if (!names) return null;
  const wanted = names.map(normalizeFolderName);
  const found =
    existing.find((f) => wanted.includes(normalizeFolderName(f.name))) ??
    existing.find((f) => wanted.some((w) => normalizeFolderName(f.name).startsWith(`${w} `)));
  return found ? { found } : { make: names[0] };
}

// A folder that holds a kind of work ("Reels", "Full Length"), never a project
export const isTypeFolder = (name: string) => TYPE_FOLDERS.some(([, names]) => names.some((n) => normalizeFolderName(n) === normalizeFolderName(name)));

// ---- a delivered file's name in Drive (Abhishek, 26 Nov 2026) ----
//
// The folders already say whose it is and which project, so the file says
// which piece: "Reel 6 - Libido.mp4", "Trailer.mp4", "Full Length.mp4". A
// reel always has its number (the next free one if its name has none) and
// its topic wherever one can be found: what follows the number in the
// file's name ("Reel 115 - Skin Barrier"), else a [bracket] at its end
// ("Liberty Mills Reel 6 [Libido]"), else what the task was first called,
// else the file's own name, each without the client, the project and words
// like Edit ("CL - Mentors" is Mentors). Thumbnails are numbered in the
// folder, 1, 2, 3, as each test one goes in (Abhishek, 26 Nov 2026).
const KIND_LABEL: [RegExp, string][] = [
  [/trailer/i, "Trailer"],
  [/bonus/i, "Bonus Reel"],
  [/long[- ]?form|full|episode|podcast edit/i, "Full Length"],
  [/thumbnail/i, "Thumbnail"],
  [/audio/i, "Audio"],
  [/carousel/i, "Carousel"],
  [/reel/i, "Reel"],
];
// words that say what a file is or how it was made, never its topic (an editor's export is often "Sequence 01" or "export final v2")
const GENERIC = /\b(reels?|trailers?|thumbnails?|long[- ]?form|full[- ]?length|podcast|episodes?|edits?|edited|final|design|rectification|correction|conversion|vertical|horizontal|format|flow|exports?|exported|sequence|render(ed)?|untitled|comp|master|draft|cut|copy|new|updated?|revised?|fixed|h\.?26[45]|hd|uhd|4k|\d{3,4}p|mp4|mov|v\d+|\d+)\b/gi;

function topicOf(title: string, original: string | null, names: string[], fileName = ""): string | null {
  const tidy = (t: string) => t.replace(/\s+/g, " ").replace(/^[\s\-–—:·|,.]+|[\s\-–—:·|,.]+$/g, "").trim();
  const afterNumber = title.match(/\b(?:reel|trailer|thumbnail|long[- ]?form|audio)\s*#?\s*\d+\s*[-–—:·|]\s*(.+)$/i)?.[1];
  if (afterNumber && tidy(afterNumber.replace(/\[[^\]]*\]|\([^)]*\)/g, " "))) return tidy(afterNumber.replace(/\[[^\]]*\]|\([^)]*\)/g, " "));
  const bracket = title.match(/\[([^\]]+)\]\s*$/)?.[1];
  if (bracket && tidy(bracket)) return tidy(bracket);
  // what it was first called, then the file's own name ("Reel-2[Libido].mp4")
  for (const from of [original, fileName.replace(/\.[A-Za-z0-9]{2,5}$/, "")]) {
    const found = from ? cleaned(from, names, tidy) : null;
    if (found) return found;
  }
  return null;
}

function cleaned(original: string, names: string[], tidy: (t: string) => string): string | null {
  const marked = original.match(/\[([^\]]+)\]\s*$/)?.[1] ?? original.match(/\(([^)]+)\)\s*$/)?.[1];
  const inner = marked ? cleaned(original.replace(/\[[^\]]*\]\s*$|\([^)]*\)\s*$/, " "), names, tidy) : null;
  // a [bracket] or (note) at its end is the topic as written, unless it only names the client or project
  if (marked) return cleaned(marked, names, tidy) ? tidy(marked) : inner;
  // the client, the project and their initials ("CL"), and the generic words, taken out
  let rest = ` ${original} `;
  for (const n of names.filter(Boolean)) {
    const initials = n.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).join("");
    for (const w of [n, ...n.split(/\s+/), initials.length >= 2 ? initials : ""].filter((w) => w.length >= 2)) {
      rest = rest.replace(new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`, "giu"), "$1 ");
    }
  }
  const topic = tidy(rest.replace(GENERIC, " ").replace(/[[\]()]/g, " "));
  return topic.length >= 3 ? topic : null;
}

// The name it's saved under: "Reel 6 - Libido.mp4". Null for a kind of work
// we don't name (it keeps the name it came with). taken: names already in
// the folder, so a second copy is "Reel 6 - Libido v2.mp4", never over one.
export function deliveryFileName(
  a: { type: string | null; title: string; originalTitle: string | null; client: string; project: string; fileName: string },
  taken: string[] = [],
): string | null {
  const label = a.type ? KIND_LABEL.find(([re]) => re.test(a.type!))?.[1] : null;
  if (!label) return null;
  const ext = a.fileName.match(/\.[A-Za-z0-9]{2,5}$/)?.[0]?.toLowerCase() ?? ".mp4";
  // the next number free in the folder for this kind ("Thumbnail 3" after 1 and 2)
  const next = () => 1 + Math.max(0, ...taken.map((t) => Number(t.match(new RegExp(`^${label}\\s+(\\d+)\\b`, "i"))?.[1] ?? 0)));
  const own = a.title.match(/\b(?:reel|trailer|thumbnail|long[- ]?form|audio)\s*#?\s*(\d+)\b/i)?.[1];
  const n = label === "Thumbnail" ? next() : own ? Number(own) : /reel/i.test(label) ? next() : null;
  const topic = label === "Thumbnail" ? null : topicOf(a.title, a.originalTitle, [a.client, a.project], a.fileName);
  const base = `${label}${n ? ` ${n}` : ""}${topic ? ` - ${topic}` : ""}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const have = new Set(taken.map((t) => t.toLowerCase()));
  let name = `${base}${ext}`;
  for (let v = 2; have.has(name.toLowerCase()); v++) name = `${base} v${v}${ext}`;
  return name;
}
