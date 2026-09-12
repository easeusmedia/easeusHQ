// Matches the team's "Editing Queue Status Guide" as the *guided* path for
// editors:
//
//   queued -> editing -> sent_for_approval -> sent_for_client_approval
//               |               |               -> revision_requested -> editing (loop)
//               |               |                                     -> sent_for_approval (resubmit directly)
//               |               -> editing (editor pulls their own submission back)
//               -> queued (editor puts it back)
//                                               -> final_export_ready -> delivered_and_uploaded
//
// Who moves what:
//  - queued:                 whoever assigns the task (admin/core)
//  - editing:                the assigned editor (from queued or after a revision)
//  - sent_for_approval:      the assigned editor (first cut is done, or a revision resubmitted)
//  - revision_requested:     ops (admin/core) ONLY — it's ops' QC verdict,
//                             not something an editor can put on their own
//                             work even to "send it back to themselves"
//  - sent_for_client_approval: ops (admin/core) only — our own review passed
//                             and it's now sitting with the client
//  - final_export_ready:     ops (admin/core) only, once the client has approved
//  - delivered_and_uploaded: internal ops (admin/core), not the editor
//
// Editors only ever drive 6 transitions: queued->editing, editing->sent_for_
// approval, editing->queued (send it back themselves), sent_for_approval->
// editing (spotted a mistake right after submitting, before ops even
// looked — but this is just "let me keep working on it", not the formal
// revision_requested verdict), and revision_requested->editing/sent_for_
// approval (skip re-editing if the fix was quick). Everything else past
// "sent for approval" is an ops call.
//
// Ops (admin + core — Ashmit, plus the core team: Abhishek, Jyotsna, Arpit)
// run the queue day to day and need to fix mistakes or skip a step without
// filing a paper trail for it, so they aren't bound by the graph below at
// all — only editors are guided through it step by step.

export type TaskStatus =
  | "queued"
  | "editing"
  | "sent_for_approval"
  | "sent_for_client_approval"
  | "revision_requested"
  | "final_export_ready"
  | "delivered_and_uploaded";

// Board column order, and the order stages are listed everywhere else.
// Revision requested sits between our own review and the client's: work
// comes back from "Sent for approval" into revision, and only once it's
// through goes out to the client.
export const ALL_STATUSES: TaskStatus[] = [
  "queued",
  "editing",
  "sent_for_approval",
  "revision_requested",
  "sent_for_client_approval",
  "final_export_ready",
  "delivered_and_uploaded",
];

// everything that hasn't shipped yet — the cutoff every live board uses, so
// "active tasks" means the same number wherever it's shown
export const ACTIVE_STATUSES: TaskStatus[] = ALL_STATUSES.filter((s) => s !== "delivered_and_uploaded");

export type Role = "admin" | "core" | "employee";

export type Actor = { role: Role; isAssignee: boolean };

type Rule = { to: TaskStatus; roles: Role[]; requireAssigneeIfEmployee?: boolean };

const TRANSITIONS: Record<TaskStatus, Rule[]> = {
  queued: [{ to: "editing", roles: ["admin", "core", "employee"], requireAssigneeIfEmployee: true }],
  editing: [
    { to: "sent_for_approval", roles: ["admin", "core", "employee"], requireAssigneeIfEmployee: true },
    // lets an editor put something back in the queue themselves — wrong
    // assignment, not ready to start, whatever the reason — instead of
    // having to ask ops to do it
    { to: "queued", roles: ["admin", "core", "employee"], requireAssigneeIfEmployee: true },
  ],
  sent_for_approval: [
    // revision_requested is ops' own QC verdict specifically — not the
    // editor's to set on themselves, even for their own submission
    { to: "revision_requested", roles: ["admin", "core"] },
    // but pulling their own submission back to keep working on it (not a
    // formal "sent back", just "I spotted a mistake") is still theirs to do
    { to: "editing", roles: ["admin", "core", "employee"], requireAssigneeIfEmployee: true },
    // our review passed — it goes out to the client for sign-off
    { to: "sent_for_client_approval", roles: ["admin", "core"] },
  ],
  // waiting on the client. They either come back with changes or approve,
  // and only ops can record either verdict.
  sent_for_client_approval: [
    { to: "revision_requested", roles: ["admin", "core"] },
    { to: "final_export_ready", roles: ["admin", "core"] },
  ],
  revision_requested: [
    { to: "editing", roles: ["admin", "core", "employee"], requireAssigneeIfEmployee: true },
    // lets the editor resubmit directly once the fix is done, without a
    // detour through "Editing" just to immediately move back out of it
    { to: "sent_for_approval", roles: ["admin", "core", "employee"], requireAssigneeIfEmployee: true },
  ],
  final_export_ready: [{ to: "delivered_and_uploaded", roles: ["admin", "core"] }],
  delivered_and_uploaded: [],
};

export function nextStatuses(from: TaskStatus): TaskStatus[] {
  return TRANSITIONS[from].map((r) => r.to);
}

export function canTransition(from: TaskStatus, to: TaskStatus, actor: Actor): boolean {
  if (actor.role !== "employee") return true; // ops has full manual control over the queue

  const rule = TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) return false;
  if (!rule.roles.includes(actor.role)) return false;
  if (rule.requireAssigneeIfEmployee && !actor.isAssignee) return false;
  return true;
}
