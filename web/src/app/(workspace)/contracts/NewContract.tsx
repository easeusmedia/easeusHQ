"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Plus } from "lucide-react";
import { createContract } from "./actions";

// A new contract starts as a link for the client: they fill in who they are,
// then it's ours to finish. The name is only for recognising it here.
export function NewContract() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [made, setMade] = useState<{ id: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function open() {
    setName("");
    setMade(null);
    setError(null);
    setCopied(false);
    dialogRef.current?.showModal();
  }

  async function make() {
    setBusy(true);
    setError(null);
    const res = await createContract(name);
    setBusy(false);
    if (res.error || !res.token || !res.id) return setError(res.error ?? "Couldn't start that contract.");
    setMade({ id: res.id, link: `${window.location.origin}/start/${res.token}` });
    router.refresh();
  }

  async function copy() {
    if (!made) return;
    await navigator.clipboard.writeText(made.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button onClick={open} className="btn btn-glow flex items-center gap-1.5">
        <Plus size={14} /> New contract
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        {made ? (
          <div className="fade-in flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold">Send this to the client</h2>
              <p className="mt-1 text-xs text-muted">
                They fill in who they are and who signs. You&apos;ll see it under Contracts, ready for the terms.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 py-1.5 pl-3 pr-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{made.link}</span>
              <button onClick={copy} className="btn btn-xs btn-ghost flex items-center gap-1">
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => router.push(`/contracts/${made.id}`)} className="btn btn-ghost">
                Fill it in yourself
              </button>
              <button onClick={() => dialogRef.current?.close()} className="btn btn-glow">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-semibold">New contract</h2>
              <p className="mt-1 text-xs text-muted">You&apos;ll get a link to the client&apos;s form — their details fill in the contract.</p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs text-muted">
              Who it&apos;s for <span className="-mt-1 font-normal">(just for you — optional)</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && make()}
                placeholder="e.g. Dr Yusra"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
              />
            </label>
            {error && <p className="text-xs text-red-300">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => dialogRef.current?.close()} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={make} disabled={busy} className="btn btn-glow disabled:opacity-60">
                {busy ? "Making…" : "Make link"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
