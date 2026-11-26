"use client";

import { useRouter } from "next/navigation";
import { EditableName } from "../EditableName";
import { renameClient } from "./actions";

// The client's name on its page, renamed in place; the page follows it to
// its new address
export function ClientName({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <EditableName
      name={name}
      pencil="hover"
      wrap
      onSave={async (next) => {
        const r = await renameClient(id, next).catch(() => ({ error: "That name couldn't be saved. Check your connection and try again.", slug: undefined }));
        if (r.error) return r.error;
        if (r.slug) router.replace(`/clients/${r.slug}`);
      }}
    />
  );
}
