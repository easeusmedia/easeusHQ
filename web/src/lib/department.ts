// Which department a task belongs to, from the words in its title: each
// department keeps a list (Team.keywords, editable under Manage
// departments). Each word found scores 1, a phrase one per word ("discovery
// call" 2), and the highest score wins. A draw goes to the person's own
// department when it's one of those drawn, else to the word that comes
// first in the title. Nothing matched: null, and the caller falls back to
// the person's own department. Every case it's meant to get right is in
// department.test.ts.

export type DepartmentWords = { id: string; keywords: string };

// a list as typed ("edit, reel,  Thumbnail") into clean lowercase words
export const wordsOf = (keywords: string) =>
  keywords
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

// lowercase words and single spaces, punctuation gone ("Re-edit!" -> "re edit")
const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function departmentFromTitle(title: string, departments: DepartmentWords[], prefer: string[] = []): string | null {
  const text = ` ${plain(title)} `;
  const scored = departments
    .map((d) => {
      let score = 0;
      let first = Infinity;
      // whole words (and phrases) only: "post" mustn't match "poster"
      for (const w of wordsOf(d.keywords)) {
        const k = plain(w);
        const at = k ? text.indexOf(` ${k} `) : -1;
        if (at < 0) continue;
        score += k.split(" ").length;
        first = Math.min(first, at);
      }
      return { id: d.id, score, first };
    })
    .filter((d) => d.score > 0);
  if (!scored.length) return null;
  const top = Math.max(...scored.map((d) => d.score));
  const drawn = scored.filter((d) => d.score === top);
  const theirs = prefer.find((id) => drawn.some((d) => d.id === id));
  return theirs ?? drawn.sort((a, b) => a.first - b.first)[0].id;
}

// What each department starts with, by its address
export const STARTING_WORDS: Record<string, string> = {
  sales: "sales, lead, leads, prospect, prospects, outreach, cold email, discovery, discovery call, proposal, pitch, deck, follow up, followup, deal, quote, pricing, package, packages",
  "client-services": "client call, call, meeting, update, brief, briefing, onboarding, feedback, deadline, approval, check in, catch up",
  content: "content, script, scripts, scripting, write, writing, hook, hooks, idea, ideas, ideation, strategy, research, caption, captions, calendar, topic, topics, plan, planning, storyboard",
  production:
    "edit, edits, edited, editing, re edit, editor, editors, reel, reels, curate, curation, podcast, trailer, teaser, thumbnail, thumbnails, graphic, graphics, design, designs, banner, poster, carousel, video, videos, shorts, shoot, audio, sound, mix, voiceover, sync, colour, color, grade, export, render, inspection, cut, broll, b roll, motion, subtitles, revision, revisions",
  distribution: "post, posts, posting, upload, uploads, publish, schedule, scheduling, youtube, instagram, linkedin, social, socials, seo, analytics, report, ads, ad campaign, boost, story, stories, comments, reply, hashtags",
  finance:
    "invoice, invoices, payment, payments, payroll, salary, gst, tax, filing, accounts, bill, billing, hiring, hire, interview, interviews, recruit, recruitment, candidate, candidates, job post, video editor, video editors, graphic designer, hr, leave, contract, expense, expenses",
};
