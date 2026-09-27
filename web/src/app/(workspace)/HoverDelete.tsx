"use client";

import { Trash2 } from "lucide-react";
import { ConfirmButton } from "./ConfirmButton";

// A delete button that appears on a task card's top-left corner while the
// pointer is on the card (always there on a touchscreen), for deleting
// without opening the task. Still asks first: it's one stray click from
// losing the task otherwise. Nothing inside reaches the card's own click,
// which opens the task.
export function HoverDelete({ title, onDelete }: { title: string; onDelete: () => void | Promise<void> }) {
  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="absolute -left-2 -top-2 z-10 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
    >
      <ConfirmButton
        message={`Delete "${title}"? This can't be undone.`}
        onConfirm={onDelete}
        className="popover flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:text-red-300"
      >
        <Trash2 size={13} aria-label="Delete task" />
      </ConfirmButton>
    </span>
  );
}
