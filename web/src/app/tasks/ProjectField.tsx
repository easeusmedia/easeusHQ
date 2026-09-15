"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { createProject } from "./clients/actions";

export type PickerProject = { id: string; name: string; client: { id: string; name: string } };

// Pick the client first, then one of *that client's* projects — a single
// flat list of every project across every client was the thing that made
// this unusable once there were a couple of hundred of them.
//
// And because plenty of tasks are the first task of a project that doesn't
// exist yet, the project row can create one inline against the chosen
// client, rather than making you leave a half-filled task form, go to the
// client page, add the project, and come back.
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

  const forClient = projects.filter((p) => p.client.id === clientId);

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
    // the new project isn't in `projects` yet — carry it in local state so
    // it's selected immediately, and refresh so the list catches up
    setProjectId(res.id);
    setCreated({ id: res.id, name: trimmed, client: { id: clientId, name: "" } });
    setName("");
    setCreating(false);
    setError(null);
    router.refresh();
  }

  const [created, setCreated] = useState<PickerProject | null>(null);
  const options = [...forClient, ...(created && created.client.id === clientId ? [created] : [])];

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />

      <label className="flex flex-col gap-1.5 text-xs text-muted">
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

      <label className="flex flex-col gap-1.5 text-xs text-muted">
        Project
        {/* key: a fresh instance per client, so switching clients can't
            leave the previous client's project showing under a now-
            different options list */}
        <Dropdown
          key={`${clientId}-${options.length}`}
          defaultValue={projectId}
          placeholder={clientId ? "Project…" : "Pick a client first…"}
          options={options.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setProjectId}
        />
      </label>

      {creating ? (
        <div className="flex items-center gap-2">
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
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <button type="button" onClick={add} disabled={busy} className="btn-glow rounded-lg px-3 py-2 text-xs disabled:opacity-60">
            {busy ? "Adding…" : "Add"}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="btn-ghost rounded-lg p-2">
            <X size={14} />
          </button>
        </div>
      ) : (
        clientId && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-add flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
          >
            <Plus size={12} /> New project for this client
          </button>
        )
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
