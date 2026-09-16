"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// The Board's one switch: Editors, then whose work — built from what the
// viewer is allowed to see. An Operations lead gets Editors / Operations,
// admin and Abhishek get Editors, every team, and Everyone.
//
// router.push, not replaceState: which team you're looking at is a real
// place, worth having in history and worth being able to link someone to.
export function ScopeToggle({
  options,
  active,
}: {
  options: { key: string; label: string }[];
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(key: string) {
    const params = new URLSearchParams(searchParams);
    params.set("scope", key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex w-fit gap-1 rounded-xl border border-border bg-surface/60 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => select(o.key)}
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
