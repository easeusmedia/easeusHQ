"use client";

// The Board's one switch: Editors, then whose work — built from what the
// viewer is allowed to see. An Operations lead gets Editors / Operations,
// admin and Abhishek get Editors, every team, and Everyone. Switching is
// instant: the Board has already loaded all of it (see BoardViews).
export function ScopeToggle({
  options,
  active,
  onSelect,
}: {
  options: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface/60 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onSelect(o.key)}
          aria-pressed={active === o.key}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            active === o.key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
