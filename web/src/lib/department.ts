// Which department a task belongs to, from the words in its title: each
// department keeps a list (Team.keywords, editable under Manage
// departments), and the one whose words appear most wins. Nothing matched:
// null, and the caller falls back to the person's own department.

export type DepartmentWords = { id: string; keywords: string };

// a list as typed ("edit, reel,  Thumbnail") into clean lowercase words
export const wordsOf = (keywords: string) =>
  keywords
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

export function departmentFromTitle(title: string, departments: DepartmentWords[]): string | null {
  const text = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  let best: { id: string; hits: number } | null = null;
  for (const d of departments) {
    // whole words (and phrases) only: "post" mustn't match "poster"
    const hits = wordsOf(d.keywords).filter((w) => text.includes(` ${w.replace(/[^a-z0-9]+/g, " ").trim()} `)).length;
    if (hits && (!best || hits > best.hits)) best = { id: d.id, hits };
  }
  return best?.id ?? null;
}

// What each department starts with, by its address
export const STARTING_WORDS: Record<string, string> = {
  sales: "sales, lead, leads, prospect, prospects, outreach, cold email, discovery, proposal, pitch, follow up, followup, deal, quote, pricing",
  "client-services": "client call, call, meeting, update, brief, briefing, onboarding, feedback, plan, planning, schedule, deadline, approval, check in, catch up",
  content: "content, script, scripts, scripting, hook, hooks, idea, ideas, ideation, strategy, research, caption, captions, calendar, topic, topics",
  production: "edit, edits, editing, editor, reel, reels, curate, curation, podcast, trailer, thumbnail, thumbnails, graphic, graphics, design, video, shoot, audio, sound, colour, color, export, render, inspection, cut, broll, b roll, motion, subtitles",
  distribution: "post, posting, upload, uploads, publish, youtube, instagram, linkedin, social, socials, seo, analytics, report, ads, ad campaign, story, stories",
  finance: "invoice, invoices, payment, payments, payroll, salary, gst, tax, accounts, bill, billing, hiring, hire, interview, recruit, hr, leave, contract, expense, expenses",
};
