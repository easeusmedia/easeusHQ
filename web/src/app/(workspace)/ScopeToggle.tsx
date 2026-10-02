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
    <div className="flex w-fit gap-1 rounded-full bg-white/[0.04] p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onSelect(o.key)}
          aria-pressed={active === o.key}
          className="seg rounded-full px-3.5 py-1.5 text-sm font-medium"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
