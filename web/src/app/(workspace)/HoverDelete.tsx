"use client";

import { Trash2 } from "lucide-react";
import { ConfirmButton } from "./ConfirmButton";

// A delete button that appears in a task card's top-right corner, inside
// the card, while the pointer is on it (always there on a touchscreen), for
// deleting
// without opening the task. Still asks first: it's one stray click from
// losing the task otherwise. Nothing inside reaches the card's own click,
// which opens the task.
export function HoverDelete({ title, onDelete }: { title: string; onDelete: (reason: string) => void | Promise<void> }) {
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
    >
      <ConfirmButton
        message={`Delete "${title}"? It stays in History, with your reason.`}
        reason="Why is this being deleted?"
        onConfirm={onDelete}
        className="flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-red-300"
      >
        <Trash2 size={13} aria-label="Delete task" />
      </ConfirmButton>
    </span>
  );
}
