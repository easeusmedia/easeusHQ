"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { createProject } from "./clients/actions";

export type PickerProject = { id: string; name: string; client: { id: string; name: string } };

// Pick the client first, then one of *that client's* projects — a single
// flat list of every project across every client was the thing that made
// this unusable once there were a couple of hundred of them.
//
// And because plenty of tasks are the first task of a project that doesn't
// exist yet, the project cell can create one inline against the chosen
// client, rather than making you leave a half-filled task form, go to the
// client page, add the project, and come back.
//
// Renders as a fragment of two labelled cells, not a block of its own, so a
// caller can put Client and Project side by side in a grid or stack them in
// a column without this needing to know which. The "new project" control is
// a text button inside the Project label's own row and the name input
// replaces the dropdown while it's open — both so that creating a project
// costs no extra height in a form that's already tall.
export function ProjectField({
  projects,
  defaultProjectId,
  clients,
}: {
  projects: PickerProject[];
  defaultProjectId?: string;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const initial = projects.find((p) => p.id === defaultProjectId);
  const [clientId, setClientId] = useState(initial?.client.id ?? "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PickerProject | null>(null);

  const forClient = projects.filter((p) => p.client.id === clientId);
  const options = [...forClient, ...(created && created.client.id === clientId ? [created] : [])];

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || !clientId) return;
    setBusy(true);
    const res = await createProject(clientId, trimmed);
    setBusy(false);
    if (res.error || !res.id) {
      setError(res.error ?? "Couldn't create that project.");
      return;
    }
    // the new project isn't in `projects` yet — hold it locally so it can be
    // selected straight away, and refresh so the real list catches up
    setCreated({ id: res.id, name: trimmed, client: { id: clientId, name: "" } });
    setProjectId(res.id);
    setName("");
    setCreating(false);
    setError(null);
    router.refresh();
  }

  return (
    <>
      <input type="hidden" name="projectId" value={projectId} />

      <label className="flex flex-col gap-1 text-xs text-muted">
        Client
        <Dropdown
          defaultValue={clientId}
          placeholder="Client…"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(id) => {
            setClientId(id);
            setProjectId(""); // last client's project must not stay selected
            setCreating(false);
          }}
        />
      </label>

      <div className="flex min-w-0 flex-col gap-1 text-xs text-muted">
        <span className="flex items-center justify-between gap-2">
          Project
          {clientId && !creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-0.5 text-xs text-muted hover:text-foreground"
            >
              <Plus size={11} /> New
            </button>
          )}
        </span>

        {creating ? (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="New project name"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={add}
              disabled={busy}
              aria-label="Create project"
              className="btn-glow shrink-0 rounded-lg p-2 disabled:opacity-60"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Cancel"
              className="btn-ghost shrink-0 rounded-lg p-2"
            >
              <X size={14} />
            </button>
          </span>
        ) : (
          // key: a fresh instance per client (and per newly added project),
          // so switching clients can't leave the previous client's project
          // showing under a now-different options list
          <Dropdown
            key={`${clientId}-${options.length}`}
            defaultValue={projectId}
            placeholder={clientId ? "Project…" : "Pick a client first…"}
            options={options.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setProjectId}
          />
        )}
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </>
  );
}
