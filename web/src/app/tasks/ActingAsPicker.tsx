"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "./Dropdown";

type Person = { id: string; name: string; role: string };

// "View as" for admin/core (see resolveActingUser) — lets them preview
// another person's board without actually switching accounts.
export function ActingAsPicker({ people, sessionUserId }: { people: Person[]; sessionUserId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("as") ?? sessionUserId;

  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      Viewing as
      <div className="w-44">
        <Dropdown
          key={current}
          defaultValue={current}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => {
            const params = new URLSearchParams(searchParams);
            params.set("as", id);
            router.push(`${pathname}?${params.toString()}`);
          }}
        />
      </div>
    </div>
  );
}
