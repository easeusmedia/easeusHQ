"use server";

import { revalidatePath } from "next/cache";
import { getRealUserId } from "@/lib/auth";
import { undoOrRedo } from "@/lib/undo";

// The person's last change, undone, or an undo redone (lib/undo)
export async function undoStep(redo: boolean): Promise<{ error?: string; label?: string }> {
  const me = await getRealUserId();
  if (!me) return { error: "Your session has ended. Please sign in again." };
  const res = await undoOrRedo(me, redo === true).catch(() => ({ error: "That couldn't be done. Check your connection and try again." }));
  if (!res.error) revalidatePath("/", "layout");
  return res;
}
