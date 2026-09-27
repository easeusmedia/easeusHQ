import { Plus } from "lucide-react";

// The one look for "add something" across the app — New task, Add client,
// New project: a quiet panel with a small plus in a soft wash of the accent.
export function PlusBadge({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors group-hover/add:bg-accent/25 ${
        large ? "size-10" : "size-5"
      }`}
    >
      <Plus size={large ? 18 : 12} />
    </span>
  );
}

// a button: in a board column, above a list, beside a heading
export const ADD_BUTTON =
  "group/add panel-soft panel-hover flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm text-muted transition-colors hover:text-foreground";
// the first row of a list, inside its panel
export const ADD_ROW =
  "group/add flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-muted transition-colors duration-150 hover:bg-white/[0.03] hover:text-foreground";
// a card in a grid of cards
export const ADD_CARD =
  "group/add panel-soft panel-hover flex h-full flex-col items-center justify-center gap-2.5 text-sm text-muted transition-colors hover:text-foreground";
