"use server";

import { getViewer } from "@/lib/viewer";
import { isFounder, isLead, seesTeamWork } from "@/lib/scope";
import { completedPage, fileTaskCard, overview, type DoneFilter } from "./data";

// Team work is Level 1's and Admin & Technical's: every call checks again
async function levelOne() {
  const viewer = await getViewer();
  return viewer && seesTeamWork(viewer) ? viewer : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The next window's worth of someone's finished work
export async function moreCompleted(personId: string, range: { from?: string; to?: string }, offset: number, limit: number, filter: DoneFilter = {}) {
  if (!(await levelOne())) return null;
  const clean = { from: DAY.test(range.from ?? "") ? range.from : undefined, to: DAY.test(range.to ?? "") ? range.to : undefined };
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const narrowed: DoneFilter = {
    q: text(filter?.q, 100),
    client: text(filter?.client, 200),
    kind: filter?.kind === "video" || filter?.kind === "design" || filter?.kind === "todo" ? filter.kind : undefined,
    timing: filter?.timing === "late" || filter?.timing === "on_time" ? filter.timing : undefined,
  };
  return completedPage(personId, clean, Math.max(0, Math.floor(offset) || 0), Math.min(120, Math.max(1, Math.floor(limit) || 1)), narrowed);
}

// One task's overview, read when it's opened
export async function openTask(ref: { kind: "task" | "work"; id: string }) {
  if (!(await levelOne()) || (ref.kind !== "task" && ref.kind !== "work")) return null;
  return overview(ref);
}

// A file's task, opened from its project page: for whoever the project page
// lets in (not Members, and never a Founder's task for a Lead, as there)
export async function openFileTask(taskId: string) {
  const viewer = await getViewer();
  if (!viewer || viewer.role === "employee" || typeof taskId !== "string") return null;
  const found = await fileTaskCard(taskId);
  if (!found || (isLead(viewer) && found.assignee && isFounder(found.assignee))) return null;
  const data = await overview({ kind: "task", id: taskId });
  return data && { card: found.card, data };
}
