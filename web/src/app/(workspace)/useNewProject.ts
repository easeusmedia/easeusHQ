"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "./clients/actions";

// Starting a project from inside a task form — plenty of tasks are the
// first task of a project that doesn't exist yet. Shared by both new-task
// forms (the board's composer and My tasks' dialog) so they can't drift:
// the option always sits at the TOP of the project list, where it can't be
// buried under a client's twenty-odd projects, and a project made here is
// selectable at once, before the page's own list has caught up.
export const NEW_PROJECT = "__new_project__";
export const NEW_PROJECT_OPTION = { value: NEW_PROJECT, label: "＋ New project" };

type Made = { id: string; name: string; client: { id: string; name: string } };

export function useNewProject(clientId: string, onCreated: (id: string) => void) {
  const router = useRouter();
  // null = not making one; a string = the name typed so far
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made[]>([]);

  async function create() {
    const trimmed = name?.trim();
    if (!trimmed || !clientId || busy) return;
    setBusy(true);
    const res = await createProject(clientId, trimmed);
    setBusy(false);
    if (res.error || !res.id) return setError(res.error ?? "Couldn't create that project.");
    const id = res.id;
    setMade((m) => [...m, { id, name: trimmed, client: { id: clientId, name: "" } }]);
    onCreated(id);
    setName(null);
    setError(null);
    router.refresh();
  }

  return {
    naming: name !== null,
    name: name ?? "",
    setName,
    start: () => {
      setName("");
      setError(null);
    },
    cancel: () => {
      setName(null);
      setError(null);
    },
    create,
    busy,
    error,
    // the page's projects plus any made here that it doesn't know about yet
    withMade: <P extends { id: string; client: { id: string } }>(projects: P[]) =>
      [...projects, ...made.filter((m) => !projects.some((p) => p.id === m.id))] as (P | Made)[],
  };
}
