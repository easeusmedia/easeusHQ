// Sorting a Frame.io comment into core's categories by its words: free,
// instant, and the same answer every time. Each category lists keywords
// (comma-separated, set on the Performance page); the one whose keywords
// the comment uses most wins, the earlier category on a tie. A comment
// that's only praise is praise; a word or two that matches nothing is not
// feedback at all; anything else unmatched goes to Others for core to
// place. Claude can re-sort on request (Sort with AI), never on its own.
//
// Pure, so it's testable on its own.

export type Keyworded = { name: string; keywords: string | null };

const PRAISE = ["nice", "great", "good job", "well done", "awesome", "amazing", "love it", "loved it", "perfect", "excellent", "brilliant", "beautiful", "superb", "mast", "badhiya", "👍", "🔥", "👏"];

const words = (s: string | null) =>
  (s ?? "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

// a keyword found as a whole word or phrase (plurals too), not inside
// another word: "subs" isn't in "subscribe"
function uses(text: string, keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = /^[\p{L}\p{N}]/u.test(keyword) ? "(^|[^\\p{L}\\p{N}])" : "";
  const end = /[\p{L}\p{N}]$/u.test(keyword) ? "(?:s|es)?(?=$|[^\\p{L}\\p{N}])" : "";
  return new RegExp(`${start}${escaped}${end}`, "iu").test(text);
}

export function categorise(text: string, categories: Keyworded[]): { kind: "mistake" | "praise" | "note"; category: string | null } {
  const t = text.toLowerCase();
  let best: { name: string; hits: number } | null = null;
  for (const c of categories) {
    const hits = words(c.keywords).filter((k) => uses(t, k)).length;
    if (hits && (!best || hits > best.hits)) best = { name: c.name, hits };
  }
  if (best) return { kind: "mistake", category: best.name };
  if (PRAISE.some((p) => uses(t, p))) return { kind: "praise", category: null };
  if (t.trim().split(/\s+/).length <= 2) return { kind: "note", category: null };
  return { kind: "mistake", category: categories.some((c) => c.name === "Others") ? "Others" : (categories.at(-1)?.name ?? "Others") };
}

// the keywords each starting category comes with; core edits them freely
export const STARTING_KEYWORDS: Record<string, string> = {
  Typos: "typo, typos, spelling, spelt, spelled, misspelled, misspelt, wrong spelling, spell check",
  "Incorrect words": "wrong word, not what he, not what she, not what they, actually says, is saying, he says, she says, they say, is not what, mismatch, doesn't match, does not match",
  "UK/US spelling": "uk spelling, us spelling, uk english, us english, british, american spelling, organisation, organization, favourite, favorite, realise, realize",
  Subtitles: "subtitle, subtitles, subs, caption, captions, out of sync, line break",
  Sound: "audio, sound, noise, volume, too loud, too low, clipped, echo, mic, voice level",
  Typography: "font, text size, alignment, align, spacing, kerning, bold, italic",
  Animation: "animation, animate, keyframe, transition, easing",
  "Visual glitches": "glitch, black frame, flicker, flickering, shaking, jitter, render, pixelated, blurry, frame drop",
  "Cuts and accuracy": "cut off, cut short, missing, trimmed, wrong clip, wrong asset, wrong logo, wrong name, overlay, fact",
  "Following feedback": "again, already told, how many times, previous feedback, same mistake, as discussed, as mentioned, told you",
  Creative: "music, bgm, song, pace, pacing, vibe, style, feel, b-roll, broll, hook, intro, outro, colour grade, color grade, try, instead, prefer, pronunciation",
  Others: "",
};
