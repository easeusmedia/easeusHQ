# Agency Ops Dashboard — Phase 1 Plan

Replacing Notion's "rebuild the template every time" problem with one internal
tool for task assignment, feedback, KPI tracking, and invoicing. Client-facing
work (portals, delivery) is phase 2 — out of scope here on purpose.

## Team & roles
- **Admin** — Ashmit Sahi (founder): full control, incl. billing and user management.
- **Core** (3 members + you): full rights to tweak tasks/clients/projects/feedback.
- **You (developer)**: same rights as core, plus you hold the deploy/infra keys.
- Room left for a future restricted **Employee** role once the team grows past the core 5 — not built yet, just not blocked by today's schema.

## Recommended stack
Boring and proven, because a 5-person internal tool run by one dev doesn't need
novelty — it needs to still be easy to touch in three years.

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (TypeScript, App Router) | One codebase for UI + API, huge ecosystem, you're not fighting the framework |
| DB + Auth + Storage | Supabase (Postgres) | Real Postgres, built-in auth (per-person login), row-level security for role permissions, file storage for invoice PDFs — skips building your own auth server |
| ORM | Prisma | Typed queries and migrations, no hand-written SQL for CRUD |
| UI | Tailwind + shadcn/ui | Gets you a genuinely high-end look fast without a custom design system |
| Email | Resend (or Supabase's built-in) | Task-assigned / feedback-posted notifications |
| Hosting | Vercel (app) + Supabase (data) | Near-zero ops for this scale; both have free tiers that cover 5 users comfortably |

**Skipped on purpose:** microservices, Kubernetes, a custom auth system, a
custom file-storage layer, an in-app payment gateway. None of that earns its
keep for a 5-person internal tool — adding it now is work with no payoff.

## Data model (first cut)
```
users        (id, name, email, role: admin|core|employee, avatar)
clients      (id, name, niche: doctor-personal-brand | podcast-leadership, contact)
projects     (id, client_id, type, status, frameio_link, drive_link)
tasks        (id, project_id, assigned_to, title, status, due_date, priority)
feedback     (id, task_id, author_id, body, created_at)      -- threaded comments on a task
kpi_snapshots(id, user_id, period, metrics jsonb)             -- computed from tasks
invoices     (id, client_id, project_id, amount, status: draft|ready|sent|paid|overdue, pdf_url, due_date)
activity_log (id, actor_id, action, entity, entity_id, created_at)  -- audit trail / activity feed
```
Permissions enforced via Supabase Row-Level Security policies keyed on
`users.role` — not hand-rolled middleware.

Media workflow: a project carries both a `frameio_link` (used during review)
and a `drive_link` (filled in once approved and uploaded there) — no file
storage of our own.

## Decisions locked in
- **Invoicing**: track-only (draft/ready/sent/paid/overdue) for now. Marking
  an invoice `ready` fires a notification to the admin — this is a single
  email/in-app trigger on a status change, not a billing system. Real payment
  collection (Stripe/Razorpay) stays a phase-2 option if you ever want it.
- **Notion migration**: bringing in existing history rather than starting
  clean. I'll need to see your current Notion schema (a page/database export,
  or read access) to scope what actually maps over — flagging that as the
  first real task once we start building, not something to guess at now.
- **KPIs**: I'll draft a default set per role (turnaround time, revision
  count, tasks completed, on-time %) computed from task data — you edit from
  there once you see it against real tasks.
- **Media files**: Frame.io during review, Google Drive after approval —
  reflected in the data model above.

## Explicitly not in phase 1
Client-facing portal, multi-org support, in-app payment collection, a mobile
app (responsive web covers 5 people). Deferred, not forgotten.
