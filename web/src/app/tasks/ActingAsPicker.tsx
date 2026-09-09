"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Person = { id: string; name: string; role: string };

// Stand-in for real auth (see PLAN.md). Once login exists, the acting user
// comes from the session and this picker goes away entirely.
export function ActingAsPicker({ people }: { people: Person[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("as") ?? people[0]?.id ?? "";

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Viewing as
      <select
        className="rounded-md border border-border bg-surface px-2 py-1 text-foreground"
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams);
          params.set("as", e.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.role})
          </option>
        ))}
      </select>
    </label>
  );
}
