"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Info, User, Folder, ListChecks, Palette, ClipboardList, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { updateClientInfo, deleteClient, type ClientInfoInput } from "./actions";

// One row per property, icon + label on the left, value on the right —
// the same scannable "properties panel" shape as the reference (Status /
// Due date / Assignee / Tags, one line each) instead of a dense grid.
function Row({ icon: Icon, label, children }: { icon: typeof Info; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 text-sm last:border-0">
      <span className="flex shrink-0 items-center gap-2 text-muted">
        <Icon size={15} /> {label}
      </span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

function DocRow({ icon, label, href, hasContent }: { icon: typeof Info; label: string; href: string; hasContent: boolean }) {
  return (
    <Row icon={icon} label={label}>
      <Link href={href} className={hasContent ? "text-foreground hover:underline" : "text-muted hover:text-foreground"}>
        {hasContent ? "View" : "Add"}
      </Link>
    </Row>
  );
}

export function ClientOverview({
  clientId,
  name,
  niche,
  contact,
  notes,
  brandGuidelines,
  sop,
  resources,
  projects,
  activeTaskCount,
}: {
  clientId: string;
  name: string;
  niche: string | null;
  contact: string | null;
  notes: string | null;
  brandGuidelines: string | null;
  sop: string | null;
  resources: string | null;
  projects: { id: string; type: string; engagement: string }[];
  activeTaskCount: number;
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
    <section className="card-surface flex flex-col rounded-xl px-4 py-1 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 py-2.5">
        <h2 className="font-medium">Overview</h2>
        <button onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
          <Pencil size={12} /> Edit
        </button>
      </div>

      <Row icon={Info} label="Niche">
        {niche ?? "—"}
      </Row>
      <Row icon={User} label="Contact">
        {contact ?? "—"}
      </Row>
      <Row icon={Folder} label="Projects">
        {projects.length > 0 ? projects.map((p) => p.type).join(", ") : "—"}
      </Row>
      <Row icon={ListChecks} label="Active tasks">
        {activeTaskCount}
      </Row>
      <DocRow icon={Palette} label="Brand guidelines" href={`/tasks/clients/${clientId}/docs/brandGuidelines`} hasContent={!!brandGuidelines} />
      <DocRow icon={ClipboardList} label="SOP" href={`/tasks/clients/${clientId}/docs/sop`} hasContent={!!sop} />
      <DocRow icon={FolderOpen} label="Resources" href={`/tasks/clients/${clientId}/docs/resources`} hasContent={!!resources} />

      {notes && (
        <div className="border-t border-border/50 py-2.5">
          <p className="mb-1 text-xs font-medium text-muted">Notes</p>
          <p className="whitespace-pre-wrap text-sm text-muted">{notes}</p>
        </div>
      )}
    </section>
  );
}
