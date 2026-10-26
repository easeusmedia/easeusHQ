"use server";

import { getViewer } from "@/lib/viewer";
import { isFounder } from "@/lib/scope";
import { completedPage, overview } from "./data";

// Team work is Level 1's, as History was: every call checks again
async function levelOne() {
  const viewer = await getViewer();
  return viewer && isFounder(viewer) ? viewer : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The next window's worth of someone's finished work
export async function moreCompleted(personId: string, range: { from?: string; to?: string }, offset: number, limit: number) {
  if (!(await levelOne())) return null;
  const clean = { from: DAY.test(range.from ?? "") ? range.from : undefined, to: DAY.test(range.to ?? "") ? range.to : undefined };
  return completedPage(personId, clean, Math.max(0, Math.floor(offset) || 0), Math.min(120, Math.max(1, Math.floor(limit) || 1)));
}

// One task's overview, read when it's opened
export async function openTask(ref: { kind: "task" | "work"; id: string }) {
  if (!(await levelOne()) || (ref.kind !== "task" && ref.kind !== "work")) return null;
  return overview(ref);
}
