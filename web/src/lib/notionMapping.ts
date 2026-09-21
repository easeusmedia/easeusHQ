import type { TaskStatus } from "./workflow";

// How a task here maps onto the Editing Queue's columns in Notion. Pure —
// no database, no network — so the rules can be tested directly, which
// matters because they're the sort of branching that quietly drifts.
//
//   Video / Subject   the task title
//   Status            our stage, in Notion's own wording
//   Editor            the assignee's Notion account, when they have one
//   Editor Queu Date  the day the task was created here — this is the queue
//                     date, i.e. when it entered the editing queue, not when
//                     it's due out
//   Raw Links         raw footage
//   Reference         reference link
//   Assets            assets link
//   Exported Link     one column, two links at two stages: the Frame.io link
//                     while the cut is under review, replaced by the Drive
//                     link once the work is exported or delivered. Only then
//                     — a Drive link added early shouldn't take the review
//                     link off the row while the client is still looking at
//                     it. Nothing here changes what the app itself stores;
//                     both links stay on the task either way.
//   Sync check        who it's assigned to, in text. A fallback, not a
//                     duplicate: most of the team has no Notion account, so
//                     without this the Editor column would simply be blank
//                     and the row wouldn't say whose work it is.

// Our stage -> the exact option names on the Notion Status property,
// verified against the live database rather than assumed.
export const NOTION_STATUS: Record<TaskStatus, string> = {
  queued: "Queued",
  editing: "Editing",
  sent_for_approval: "Sent for approval",
  revision_requested: "Revision requested",
  sent_for_client_approval: "Sent for Client Approval",
  final_export_ready: "Final export ready",
  delivered_and_uploaded: "Delivered and uploaded",
};

// Whose work gets mirrored: Operations, minus the admin. Core members and
// editors alike — Jyotsna, Arpit, Abhishek and the editors — but not Ashmit
// (he runs the place rather than working the queue) and not Sales, whose
// work has no business in a database called Editing Queue.
//
// Derived from team and role rather than a list of names, so someone joining
// Operations is covered without anyone remembering to add them here.
export function pushesToNotion(user: { role: string; teamSlug: string | null }): boolean {
  return user.teamSlug === "operations" && user.role !== "admin";
}

// A work task's own four stages, onto the same Notion column. The Editing
// Queue's wording is about a video going out the door, so the fit is
// approximate by nature — "In review" is the team looking at it, which is
// what "Sent for approval" means there.
export const WORK_TASK_NOTION_STATUS: Record<string, string> = {
  todo: "Queued",
  in_progress: "Editing",
  in_review: "Sent for approval",
  done: "Delivered and uploaded",
};

// Which client a Notion row belongs to. Notion has no client column — it's
// in the title, usually as the prefix before " - " ("CL - Energy - Katie",
// "Tego - Skin Business") and sometimes not at all ("Yusra Reel"). So:
//
//   1. the prefix as a name          "Robyn - Levels"  -> Robyn
//   2. the prefix as initials        "BB - Cold Calling" -> The Broker Brunch
//      ("The" doesn't count towards them)
//   3. the prefix inside a name      "Tego - ..." -> Dr Tego
//   4. the name's own distinctive words, anywhere in the title, all of them
//      "Yusra Reel" -> Dr Yusra
//
// Step 4 needs every word so "SRT - Self Centred Leaders" doesn't land on
// Courageous Leaders, and only words of 4+ letters so the "Dr" that starts
// half this database doesn't match every doctor on the roster. Same reason
// step 3 wants 3+ letters: "Dr - 5 Treatments" was quietly filing itself
// under Dr Tego.
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
const distinctive = (name: string) => words(name).filter((w) => w.length >= 4);

export function matchClient<T extends { name: string }>(title: string, clients: T[]): T | undefined {
  const prefix = title.split(" - ")[0].trim();
  const p = prefix.toLowerCase();
  if (!p) return undefined;

  const exact = clients.find((c) => c.name.toLowerCase() === p);
  if (exact) return exact;

  if (/^[a-z]{2,4}$/.test(p)) {
    const initials = clients.find(
      (c) => words(c.name).filter((w) => w !== "the").map((w) => w[0]).join("") === p
    );
    if (initials) return initials;
  }

  if (p.length >= 3) {
    const inside = clients.find((c) => c.name.toLowerCase().includes(p) || p.includes(c.name.toLowerCase()));
    if (inside) return inside;
  }

  const inTitle = new Set(words(title));
  return clients.find((c) => {
    const own = distinctive(c.name);
    return own.length > 0 && own.every((w) => inTitle.has(w));
  });
}

// The stages at which the work has left review and the Drive link is the
// one that matters.
const DELIVERED_STAGES: TaskStatus[] = ["final_export_ready", "delivered_and_uploaded"];

// Which link belongs in Notion's single "Exported Link" column right now.
export function exportedLinkFor(task: {
  status: TaskStatus;
  frameioLink: string | null;
  driveLink: string | null;
}): string | null {
  if (DELIVERED_STAGES.includes(task.status) && task.driveLink) return task.driveLink;
  // still under review: the Frame.io thread is what the column should point
  // at. Falls back to whatever exists if only one of them is set.
  return task.frameioLink ?? task.driveLink;
}
