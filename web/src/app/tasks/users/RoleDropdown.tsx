"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "../Dropdown";
import { updateUserRole } from "./actions";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "core", label: "Core" },
  { value: "employee", label: "Employee" },
];

export function RoleDropdown({ userId, role }: { userId: string; role: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={pending ? "opacity-60" : undefined}>
      <Dropdown
        defaultValue={role}
        options={ROLE_OPTIONS}
        onChange={(next) =>
          startTransition(async () => {
            await updateUserRole(userId, next);
            router.refresh();
          })
        }
      />
    </div>
  );
}
