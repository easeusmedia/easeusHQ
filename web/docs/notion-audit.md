# Easeus Notion portal — audit & plan

What's actually in the workspace (119 databases, read via the API — not guessed),
what the app already covers, and what's worth moving across.

## What's there

**Spine of the agency — 4 databases do almost all the real work:**

| Notion | Size | In the app? |
|---|---|---|
| Clients Dashboard | 53 clients (5 Current, 11 On Hold, 37 Previous) | Partly — 7 synced |
| Editing Queue | 100+ tasks, 7 stages | Yes — the board |
| Per-client content DBs (Courageous Leader, Robyn, Dr Tego 2026, Elle Sera…) | one row per episode | Yes — Projects (Courageous Leaders only) |
| Per-episode "Content" DBs (~30) | Content Type + Link | Yes — Project files (Courageous Leaders only) |

**Everything the app has no home for yet:**

| Notion | Size | What it is |
|---|---|---|
| Performance Review + Team Progress Graph | 3 editors, weekly scores | Weekly 1–5 scores per editor, month totals, letter grade, mistake flags (Typos, UK/US spelling, Sound, Subtitle, Typography, Animation) |
| Standard Operating Protocols | 4 docs | Company-wide: Editor's SOPs, Quality Check SOP, Client Onboarding SOP, Podcast Episode Editing SOP |
| Client Onboarding (form) | 6 submissions | Name, email, WhatsApp, address — what a new client fills in |
| Video Editors | 18 candidates | Hiring pipeline: portfolio, sample, 8 stages |
| Idea Bank / Content Ideas / Ads Status | ~25 | Content pipeline (Ideation → Scripting → Filming → Ready to run) |
| Editor workbooks (4) | per editor | "My assigned videos" + SOP copies — already covered by the board's editor view |

## The thing worth noticing

**A client template already exists — it's just enforced by hand.** Every properly
set-up client in Notion has exactly the same five things:

1. A Clients Dashboard row — Type (Subscription/Project) + Status
2. A deliverables list on their page ("2 long-form/month, 6 clips per episode…")
3. A per-client content database — one row per episode, with Status / Link / Batch / Invoice
4. A "Content" database inside each episode — the reels, thumbnails, long-form cut
5. An editor workbook — Client Information, Editing SOP, Quality Checklist

And the Client Onboarding SOP spells out a 6-step human process: WhatsApp group →
welcome + form → brand assets → credentials heads-up → credentials email → confirm.

Nothing enforces any of it. A client set up on a busy week gets three of the five.
That's the gap worth closing first — not copying Notion, but making the structure
automatic instead of remembered.

## Plan

**Phase 1 — the template (what "New client" should do)**
- An editable Client Template: default deliverables, default tags, starter text for
  all four documents, and the onboarding checklist from the SOP.
- "New client" applies it in one go. Every client starts identical.
- The template itself is editable in the app — change it once, every future client
  follows.
- Onboarding checklist on the client, so a half-set-up client is visible.
- Per-client Notion database id as a field + an Import button, so pulling a client's
  episodes and files stops being a script I run and becomes a button you press.

**Phase 2 — people**
Editor performance: weekly score, mistake flags, month grade, team comparison.
Wire up the `Feedback` and `KpiSnapshot` tables that already exist but are unused.

**Phase 3 — company SOPs**
The 4 company-wide documents, same editor as client docs. Read by everyone, edited
by ops.

**Phase 4 — pipelines**
Editor hiring (18 candidates, 8 stages) and the content idea bank. Both are small
kanbans reusing the board that already exists.

## Deliberately not moving

The ~37 Previous clients and the dozens of archived monthly content DBs (January,
June Content (Unedited), Yusra JANUARY…). They're history, not working data — and
the last import of old rows cost a 302-row cleanup. Notion can stay the archive.
