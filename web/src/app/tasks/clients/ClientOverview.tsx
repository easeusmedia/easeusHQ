"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Palette, ClipboardList, FolderOpen, Pencil, ExternalLink, Trash2 } from "lucide-react";
import { updateClientInfo, deleteClient, type ClientInfoInput } from "./actions";

// Every client that has no SOP of their own yet still gets pointed at the
// team's shared SOP hub in Notion (Editor's SOPs, Quality Check SOP,
// Client Onboarding SOP, Podcast Episode Editing SOPs) rather than a dead
// end — verified as the real fallback the team already uses.
const SHARED_SOP_URL = "https://app.notion.com/p/31fb6a2080448024b010ff68e25e9140";

function ResourceLink({ icon: Icon, label, url, fallback }: { icon: typeof Palette; label: string; url: string | null; fallback?: string }) {
  const href = url ?? fallback ?? null;
  if (!href) {
    return (
      <span className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted">
        <Icon size={13} /> {label} not set
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs hover:bg-hover"
    >
      <Icon size={13} /> {label}
      {!url && <span className="text-muted">(shared)</span>}
      <ExternalLink size={11} className="text-muted" />
    </a>
  );
}

export function ClientOverview({
  clientId,
  name,
  niche,
  contact,
  notes,
  brandGuidelinesUrl,
  sopUrl,
  resourcesUrl,
  projects,
}: {
  clientId: string;
  name: string;
  niche: string | null;
  contact: string | null;
  notes: string | null;
  brandGuidelinesUrl: string | null;
  sopUrl: string | null;
  projects: { id: string; type: string; engagement: string }[];
  resourcesUrl: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ClientInfoInput>({
    name,
    niche: niche ?? "",
    contact: contact ?? "",
    brandGuidelinesUrl: brandGuidelinesUrl ?? "",
    sopUrl: sopUrl ?? "",
    resourcesUrl: resourcesUrl ?? "",
    notes: notes ?? "",
  });

  function field<K extends keyof ClientInfoInput>(key: K, value: ClientInfoInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateClientInfo(clientId, form);
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function confirmDelete() {
    setDeleting(true);
    await deleteClient(clientId);
    router.push("/tasks/clients");
  }

  if (editing) {
    return (
      <section className="card-surface flex flex-col gap-3 rounded-xl p-4 shadow-sm">
        <h2 className="font-medium">Edit client</h2>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <input
            value={form.name}
            onChange={(e) => field("name", e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Niche
          <input
            value={form.niche}
            onChange={(e) => field("niche", e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Contact
          <input
            value={form.contact}
            onChange={(e) => field("contact", e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Brand guidelines link
            <input
              value={form.brandGuidelinesUrl}
              onChange={(e) => field("brandGuidelinesUrl", e.target.value)}
              placeholder="https://…"
              className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            SOP link
            <input
              value={form.sopUrl}
              onChange={(e) => field("sopUrl", e.target.value)}
              placeholder="https://… (blank = shared SOPs)"
              className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Resources / Drive link
            <input
              value={form.resourcesUrl}
              onChange={(e) => field("resourcesUrl", e.target.value)}
              placeholder="https://…"
              className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Relationship notes
          <textarea
            rows={2}
            placeholder="How's this account going, anything ops should remember…"
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
            className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => deleteRef.current?.showModal()}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
          >
            <Trash2 size={13} /> Delete client
          </button>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost rounded-md px-3 py-1.5 text-xs">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <dialog
          ref={deleteRef}
          className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
        >
          <p className="text-sm">
            Delete <strong>{name}</strong>? This permanently removes their projects, tasks, invoices, and
            deliverables too — it can&apos;t be undone.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => deleteRef.current?.close()}
              className="rounded-md px-3 py-1 text-xs btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-md border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </dialog>
      </section>
    );
  }

  return (
    <section className="card-surface flex flex-col gap-3 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Overview</h2>
        <button onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
          <Pencil size={12} /> Edit
        </button>
      </div>

      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Niche</dt>
        <dd>{niche ?? "—"}</dd>
        <dt className="text-muted">Contact</dt>
        <dd>{contact ?? "—"}</dd>
        <dt className="text-muted">Projects</dt>
        <dd>{projects.length > 0 ? projects.map((p) => p.type).join(", ") : "—"}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <ResourceLink icon={Palette} label="Brand guidelines" url={brandGuidelinesUrl} />
        <ResourceLink icon={ClipboardList} label="SOP" url={sopUrl} fallback={SHARED_SOP_URL} />
        <ResourceLink icon={FolderOpen} label="Resources" url={resourcesUrl} />
      </div>

      {notes && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Notes</p>
          <p className="whitespace-pre-wrap text-sm text-muted">{notes}</p>
        </div>
      )}
    </section>
  );
}
