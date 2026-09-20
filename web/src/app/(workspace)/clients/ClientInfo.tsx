"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ClipboardCheck, ClipboardList, FileText, FolderOpen, MessagesSquare, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { Markdown } from "./Markdown";
import {
  addClientDocument,
  clientFootprint,
  deleteClient,
  deleteClientDocument,
  updateClientDoc,
  updateClientDocument,
  updateClientInfo,
  type ClientDocType,
  type ClientInfoInput,
} from "./actions";
import { ConfirmButton } from "../ConfirmButton";
import { Reveal } from "../Reveal";

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
function DocSection({ clientId, doc, content, readOnly = false }: { clientId: string; doc: Doc; content: string | null; readOnly?: boolean }) {
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
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      <Reveal open={open}>
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
              {!readOnly && (
                <div className="mb-2 flex justify-end">
                  <button onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                    <Pencil size={12} /> Edit
                  </button>
                </div>
              )}
              {content ? <Markdown text={content} /> : <p className="pb-2 text-sm text-muted">Nothing here yet.</p>}
            </>
          )}
        </div>
      </Reveal>
    </section>
  );
}

// The same document sections, read-only — what a client sees of their own
// documents on their shared page. Only the ones actually written.
export function ClientDocuments({ docs }: { docs: Record<ClientDocType, string | null> }) {
  const written = DOCS.filter((d) => docs[d.key]?.trim());
  if (written.length === 0) return <p className="text-sm text-muted">Nothing here yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {written.map((doc) => (
        <DocSection key={doc.key} clientId="" doc={doc} content={docs[doc.key]} readOnly />
      ))}
    </div>
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
  custom = [],
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
  custom?: CustomDoc[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [armed, setArmed] = useState(false);
  // what would go with them, fetched when the dialog opens
  const [footprint, setFootprint] = useState<Awaited<ReturnType<typeof clientFootprint>> | null>(null);

  function openDelete() {
    setArmed(false);
    setFootprint(null);
    setError(null);
    deleteRef.current?.showModal();
    clientFootprint(clientId).then(setFootprint);
  }

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
    router.push("/clients");
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
              <span />
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
                  <dd className="min-w-0 truncate text-right">{value || "Not set"}</dd>
                </div>
              ))}
            </dl>
            {notes && <p className="mt-3 whitespace-pre-wrap border-t border-border/50 pt-3 text-sm text-muted">{notes}</p>}
          </>
        )}

        <dialog
          ref={deleteRef}
          onClick={(e) => {
            if (e.target === deleteRef.current) deleteRef.current?.close();
          }}
          onClose={() => setArmed(false)}
          className="glass fixed top-1/2 left-1/2 m-0 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 text-foreground"
        >
          <p className="text-sm">
            Delete <strong>{name}</strong>? Everything of theirs goes with them, and it can&apos;t be undone.
          </p>

          {/* what "everything" actually means, counted from their record */}
          {footprint && (
            <ul className="fade-in mt-3 flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
              {[
                ["projects", footprint.projects],
                ["tasks, delivered work included", footprint.tasks],
                ["documents", footprint.documents],
                ["deliverables", footprint.deliverables],
                ["invoices", footprint.invoices],
                ["messages from them", footprint.feedback],
              ]
                .filter(([, n]) => (n as number) > 0)
                .map(([label, n]) => (
                  <li key={label as string}>
                    <strong className="text-foreground">{n as number}</strong> {label as string}
                  </li>
                ))}
              {Object.values(footprint).every((n) => n === 0) && <li>Nothing else is attached to them.</li>}
            </ul>
          )}

          {armed && (
            <div className="fade-in mt-3 flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-300" />
              <p className="text-xs text-red-200">
                Last check: this removes {name} and everything listed above from Easeus HQ for good. Their files in
                Google Drive are left alone.
              </p>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => deleteRef.current?.close()} className="btn-ghost rounded-md px-3 py-1 text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => (armed ? confirmDelete() : setArmed(true))}
              disabled={deleting}
              className="rounded-md border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : armed ? `Yes, delete ${name}` : "Delete"}
            </button>
          </div>
        </dialog>
      </section>

      {DOCS.map((doc) => (
        <DocSection key={doc.key} clientId={clientId} doc={doc} content={docs[doc.key]} />
      ))}

      {/* whatever else this client needs written down — the five above are
          what every client starts with, not the limit */}
      {custom.map((doc) => (
        <CustomDocSection key={doc.id} doc={doc} />
      ))}
      <NewDocument clientId={clientId} />

      {/* the end of the page, well past anything anyone opens by accident */}
      <div className="mt-6 flex justify-end border-t border-border/50 pt-4">
        <button
          type="button"
          onClick={openDelete}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 size={13} /> Delete client
        </button>
      </div>
    </div>
  );
}


export type CustomDoc = { id: string; title: string; content: string | null };

// A document this client needed that the template doesn't have. Same box,
// same markdown; its name can be changed and it can be removed, which the
// five built-in ones can't.
function CustomDocSection({ doc }: { doc: CustomDoc }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(doc.content ?? "");
  const [title, setTitle] = useState(doc.title);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await updateClientDocument(doc.id, { title, content: value });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    await deleteClientDocument(doc.id);
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
        <FileText size={16} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{doc.title}</span>
          <span className="block truncate text-xs text-muted">{doc.content?.trim() ? "Written" : "Not written yet"}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      <Reveal open={open}>
        <div className="border-t border-border px-4 py-3">
          {editing ? (
            <div className="flex flex-col gap-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document name"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              />
              <textarea
                autoFocus
                rows={18}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Write it here…  (## heading, - bullet, | table |)"
                className="rounded-lg border border-border bg-surface-2 p-3 text-sm leading-relaxed"
              />
              <div className="flex justify-between gap-2">
                <ConfirmButton
                  message={`Delete "${doc.title}"? This can't be undone.`}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                  onConfirm={remove}
                >
                  <Trash2 size={13} /> Delete
                </ConfirmButton>
                <div className="flex gap-2">
                  <button onClick={() => { setValue(doc.content ?? ""); setTitle(doc.title); setEditing(false); }} className="btn-ghost rounded-md px-3 py-1.5 text-xs">
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
              <div className="mb-2 flex justify-end">
                <button onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                  <Pencil size={12} /> Edit
                </button>
              </div>
              {doc.content ? <Markdown text={doc.content} /> : <p className="pb-2 text-sm text-muted">Nothing here yet.</p>}
            </>
          )}
        </div>
      </Reveal>
    </section>
  );
}

function NewDocument({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    await addClientDocument(clientId, title);
    setSaving(false);
    setTitle("");
    setAdding(false);
    router.refresh();
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} className="btn-add flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm">
        <Plus size={15} /> New document
      </button>
    );
  }

  return (
    <div className="fade-in flex items-center gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
          if (e.key === "Escape") setAdding(false);
        }}
        placeholder="What is it? e.g. Channel strategy, Tone of voice"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
      />
      <button onClick={add} disabled={saving} className="btn-glow shrink-0 rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-60">
        {saving ? "Adding…" : "Add"}
      </button>
      <button onClick={() => setAdding(false)} className="btn-ghost shrink-0 rounded-lg px-3 py-2 text-xs">
        Cancel
      </button>
    </div>
  );
}
