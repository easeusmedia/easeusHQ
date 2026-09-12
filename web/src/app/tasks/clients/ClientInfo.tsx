"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardCheck, ClipboardList, FolderOpen, MessagesSquare, Palette, Pencil, Trash2 } from "lucide-react";
import { Markdown } from "./Markdown";
import { updateClientInfo, updateClientDoc, deleteClient, type ClientDocType, type ClientInfoInput } from "./actions";

type Doc = { key: ClientDocType; label: string; icon: typeof Palette; hint: string };

// The four documents every client has. Same four everywhere — this is the
// one template, whatever shape the client's Notion page happened to grow in.
const DOCS: Doc[] = [
  { key: "brandGuidelines", label: "Client information", icon: Palette, hint: "Who they are, language, fonts, brand colours" },
  { key: "sop", label: "Editing SOP", icon: ClipboardList, hint: "How their work gets edited, start to export" },
  { key: "qualityChecklist", label: "Quality checklist", icon: ClipboardCheck, hint: "Final pass before anything is uploaded" },
  { key: "meetingNotes", label: "Meeting notes", icon: MessagesSquare, hint: "What was agreed on calls with this client" },
  { key: "resources", label: "Resources", icon: FolderOpen, hint: "Asset folders, templates, anything else" },
];

// Collapsed by default — the complaint about the old version was being
// bombarded with everything at once. Open the one you need; the rest stay
// one line tall.
function DocSection({ clientId, doc, content }: { clientId: string; doc: Doc; content: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content ?? "");
  const [saving, setSaving] = useState(false);
  const Icon = doc.icon;

  async function save() {
    setSaving(true);
    await updateClientDoc(clientId, doc.key, value);
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
      >
        <Icon size={16} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{doc.label}</span>
          <span className="block truncate text-xs text-muted">{content ? doc.hint : "Not written yet"}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          {editing ? (
            <div className="flex flex-col gap-3">
              <textarea
                autoFocus
                rows={20}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`Write ${doc.label.toLowerCase()}…  (## heading, - bullet, | table |)`}
                className="rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setValue(content ?? ""); setEditing(false); }} className="btn-ghost rounded-md px-3 py-1.5 text-xs">
                  Cancel
                </button>
                <button onClick={save} disabled={saving} className="btn-glow rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <button onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                  <Pencil size={12} /> Edit
                </button>
              </div>
              {content ? <Markdown text={content} /> : <p className="pb-2 text-sm text-muted">Nothing here yet.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export function ClientInfo({
  clientId,
  name,
  niche,
  contact,
  email,
  whatsapp,
  address,
  notes,
  docs,
}: {
  clientId: string;
  name: string;
  niche: string | null;
  contact: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  notes: string | null;
  docs: Record<ClientDocType, string | null>;
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
    email: email ?? "",
    whatsapp: whatsapp ?? "",
    address: address ?? "",
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
    if (res.error) return setError(res.error);
    setEditing(false);
    router.refresh();
  }

  async function confirmDelete() {
    setDeleting(true);
    await deleteClient(clientId);
    router.push("/tasks/clients");
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="card-surface rounded-xl p-4 shadow-sm">
        {editing ? (
          <div className="flex flex-col gap-3">
            {([
              ["name", "Name"],
              ["niche", "Niche"],
              ["contact", "Contact name"],
              ["email", "Email"],
              ["whatsapp", "WhatsApp"],
              ["address", "Address"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted">
                {label}
                <input
                  value={form[key]}
                  onChange={(e) => field(key, e.target.value)}
                  className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-xs text-muted">
              Relationship notes
              <textarea
                rows={3}
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
          </div>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-medium">Details</h2>
              <button onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                <Pencil size={12} /> Edit
              </button>
            </div>
            <dl className="text-sm">
              {[
                ["Niche", niche],
                ["Contact", contact],
                ["Email", email],
                ["WhatsApp", whatsapp],
                ["Address", address],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0">
                  <dt className="shrink-0 text-muted">{label}</dt>
                  <dd className="min-w-0 truncate text-right">{value || "—"}</dd>
                </div>
              ))}
            </dl>
            {notes && <p className="mt-3 whitespace-pre-wrap border-t border-border/50 pt-3 text-sm text-muted">{notes}</p>}
          </>
        )}

        <dialog
          ref={deleteRef}
          className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
        >
          <p className="text-sm">
            Delete <strong>{name}</strong>? This permanently removes their projects, tasks, invoices, deliverables
            and delivered work too — it can&apos;t be undone.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => deleteRef.current?.close()} className="btn-ghost rounded-md px-3 py-1 text-xs">
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

      {DOCS.map((doc) => (
        <DocSection key={doc.key} clientId={clientId} doc={doc} content={docs[doc.key]} />
      ))}
    </div>
  );
}
