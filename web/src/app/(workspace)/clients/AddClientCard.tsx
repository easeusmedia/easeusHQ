"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Plus, X } from "lucide-react";
import { createClient } from "./actions";
import { createClientInvite, deleteClientInvite } from "../../onboarding/actions";
import { pendingInvites } from "./actions";

// One way in, for every client. The dialog only asks for what's actually
// known at the moment someone is added — the rest of the structure comes
// from the template, and the onboarding checklist chases the rest.
export function AddClientCard({ variant }: { variant: "card" | "row" }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ name: "", niche: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the onboarding link, once it's been made
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, setPending] = useState<Awaited<ReturnType<typeof pendingInvites>>>([]);

  function open() {
    setForm({ name: "", niche: "" });
    setError(null);
    setInvite(null);
    setCopied(null);
    setPending([]);
    dialogRef.current?.showModal();
    loadPending();
  }

  // links already sent that nobody has filled in yet — so pressing this
  // again doesn't quietly make a second link for the same client
  async function loadPending() {
    setPending(await pendingInvites());
  }

  // The other way in: the client fills their own details, and their record
  // is made from what they send (see /onboarding).
  async function makeInvite() {
    setSaving(true);
    setError(null);
    const res = await createClientInvite(form.name);
    setSaving(false);
    if (res.error || !res.token) return setError(res.error ?? "Couldn't make that link.");
    setInvite(`${window.location.origin}/onboarding/${res.token}`);
    loadPending();
    router.refresh();
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/onboarding/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  }

  async function revoke(id: string) {
    await deleteClientInvite(id);
    loadPending();
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const res = await createClient(form.name, form.niche);
    setSaving(false);
    if (res.error) return setError(res.error);
    dialogRef.current?.close();
    router.push(`/clients/${res.slug}`);
  }

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";

  return (
    <>
      {variant === "row" ? (
        <button
          onClick={open}
          className="btn-add flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
        >
          <Plus size={15} /> Add client
        </button>
      ) : (
        <button
          onClick={open}
          className="btn-add flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl"
        >
          <Plus size={22} />
          <span className="text-xs">Add client</span>
        </button>
      )}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="text-base font-semibold">New client</h2>
        <p className="mt-1 mb-5 text-xs text-muted">
          They&apos;ll be set up from the client template: deliverables, documents and the onboarding checklist.
        </p>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Name
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="Client or show name"
              className={field}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-muted">
            Niche <span className="font-normal normal-case">(optional)</span>
            <input
              value={form.niche}
              onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. Podcast / leadership"
              className={field}
            />
          </label>

          {error && <p className="text-xs text-red-300">{error}</p>}

          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <button onClick={() => dialogRef.current?.close()} className="btn-ghost rounded-lg px-4 py-2 text-xs">
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn-glow rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-60">
              {saving ? "Creating…" : "Create client"}
            </button>
          </div>

          {/* or let them fill it in: their logo, contacts, channels and brand
              files land here as a finished client record */}
          <div className="mt-2 border-t border-border pt-4">
            {invite && (
              <div className="fade-in mb-3 flex flex-col gap-2">
                <p className="text-xs text-muted">Send this to your client. It works once, then stops.</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={invite} className={`${field} text-xs`} onFocus={(e) => e.currentTarget.select()} />
                  <button
                    onClick={() => copyLink(invite.split("/").pop()!)}
                    className="btn-glow flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {/* Every link already waiting to be filled in. Copy one of these
                again rather than making a second link for the same client —
                each link only works once, so two links means whichever they
                open second tells them it's already done. */}
            {pending.length > 0 && (
              <div className="mb-3 flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted">Links waiting to be filled in</p>
                {pending.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {p.name || "Unnamed client"}
                      <span className="text-muted"> · sent {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    </span>
                    <button onClick={() => copyLink(p.token)} className="shrink-0 text-xs text-blue-400 hover:underline">
                      {copied === p.token ? "Copied" : "Copy link"}
                    </button>
                    <button onClick={() => revoke(p.id)} title="Cancel this link" className="btn-ghost shrink-0 rounded-md p-1">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={makeInvite}
              disabled={saving}
              className="btn-ghost flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs disabled:opacity-60"
            >
              <Link2 size={13} /> {pending.length > 0 ? "New onboarding link" : "Send them an onboarding form instead"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
