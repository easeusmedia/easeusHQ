"use client";

import { useEffect, useState } from "react";

// A copy kept in state (a form, a list being edited) goes stale when the bar
// at the top undoes or redoes a change (UndoRedo): once the page's refreshed
// props arrive, `reset` puts the copy back to them. `from` is what the page
// gave: its props as they came (or plain values), never objects made here.
export function useUndoReset(reset: () => void, ...from: unknown[]) {
  const [seen, setSeen] = useState(from);
  const [undone, setUndone] = useState(false);
  useEffect(() => {
    const on = () => setUndone(true);
    window.addEventListener("easeus:undo", on);
    return () => window.removeEventListener("easeus:undo", on);
  }, []);
  if (from.some((v, i) => v !== seen[i])) {
    setSeen(from);
    if (undone) {
      setUndone(false);
      reset();
    }
  }
}
