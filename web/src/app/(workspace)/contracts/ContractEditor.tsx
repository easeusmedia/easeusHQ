"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, FileDown, RotateCcw, Send, Trash2 } from "lucide-react";
import { compose, conditions, values as valuesOf, type Clause, type ContractDetails } from "@/lib/contract";
import { ConfirmButton } from "../ConfirmButton";
import { DetailsPanel } from "./DetailsPanel";
import { ContractPaper } from "./ContractPaper";
import { contractStage } from "./status";
import {
  approveContract,
  deleteContract,
  resetContractClauses,
  saveContractClauses,
  saveContractDetails,
  sendContract,
} from "./actions";

// One contract, start to finish: the details on the left (the missing ones
// called out first), the contract on the right exactly as it will read, and
// the one next step at the top — approve, then send.
export function ContractEditor({
  id,
  token,
  name,
  status: initialStatus,
  details: initialDetails,
  clauses: initialClauses,
  today,
  adobeConnected,
  agreementStatus,
  sentAt,
}: {
  id: string;
  token: string;
  name: string | null;
  status: string;
  details: ContractDetails;
  clauses: Clause[];
  today: string;
  adobeConnected: boolean;
  agreementStatus: string | null;
  sentAt: string | null;
}) {
  const router = useRouter();
  const [d, setD] = useState(initialDetails);
  const [clauses, setClauses] = useState(initialClauses);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const locked = status === "sent" || status === "signed";

  const composed = useMemo(() => compose(clauses, d, today), [clauses, d, today]);
  const c = conditions(d);
  const byCountry = valuesOf({ ...d, governingLaw: "", jurisdiction: "" }, today);
  const stage = contractStage(status, composed.missing.length);
  const title = d.entity || name || d.contactName || "New contract";

  // details save themselves a moment after the last change
  const first = useRef(true);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function saveDetails(next: ContractDetails) {
    pending.current = null;
    const res = await saveContractDetails(id, next);
    if (res.error) setError(res.error);
    if (res.status) setStatus(res.status);
    setSaving("saved");
  }
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaving("saving");
    pending.current = setTimeout(() => saveDetails(d), 600);
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saves on a change of details only
  }, [d]);
  // a save still waiting, done now — so approving never races it
  async function flush() {
    if (!pending.current) return;
    clearTimeout(pending.current);
    await saveDetails(d);
  }

  const set = (patch: Partial<ContractDetails>) => setD((cur) => ({ ...cur, ...patch }));

  async function changeClauses(next: Clause[]) {
    setClauses(next);
    setSaving("saving");
    const res = await saveContractClauses(id, next);
    if (res.error) setError(res.error);
    if (res.status) setStatus(res.status);
    setSaving("saved");
  }

  async function run(what: string, fn: () => Promise<{ error?: string }>, after?: () => void) {
    setBusy(what);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error) return setError(res.error);
    after?.();
    router.refresh();
  }

  function jump(key: string) {
    const el = document.getElementById(`f-${key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input:not([readonly]),textarea,button")?.focus({ preventScroll: true });
  }

  const signers = d.signatories.filter((s) => s.name.trim()).map((s) => s.email.trim());

  return (
    <div className="flex flex-col gap-6">
      {/* the bar: where it stands, and the one next step */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/contracts" aria-label="All contracts" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted">
            Service agreement
            {saving !== "idle" && !locked && <span className="fade-in"> · {saving === "saving" ? "Saving…" : "Saved"}</span>}
          </p>
        </div>
        <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${stage.tone}`}>{stage.label}</span>

        <div className="flex flex-wrap items-center gap-2">
          {status === "invited" && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/start/${token}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="btn btn-ghost flex items-center gap-1.5"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Client's form link"}
            </button>
          )}
          <a href={`/api/contracts/${id}/pdf${status === "signed" ? "?signed=1" : ""}`} className="btn btn-ghost flex items-center gap-1.5">
            {status === "signed" ? <Download size={14} /> : <FileDown size={14} />} {status === "signed" ? "Signed copy" : "PDF"}
          </a>
          {!locked && (
            <ConfirmButton message="Delete this contract? The client's link stops working." onConfirm={() => run("delete", () => deleteContract(id), () => router.push("/contracts"))} className="btn btn-ghost px-2.5">
              <Trash2 size={14} />
            </ConfirmButton>
          )}
          {(status === "invited" || status === "draft") && (
            <button
              onClick={() =>
                run(
                  "approve",
                  async () => {
                    await flush();
                    return approveContract(id);
                  },
                  () => setStatus("approved")
                )
              }
              disabled={composed.missing.length > 0 || busy !== null}
              title={composed.missing.length ? "Fill in what's missing first" : undefined}
              className="btn btn-glow flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check size={14} /> {busy === "approve" ? "Approving…" : "Approve contract"}
            </button>
          )}
          {status === "approved" &&
            (adobeConnected ? (
              <ConfirmButton
                message={`Send it for signing to ${signers.join(" and ")}? You'll sign after them, as easeus.media@gmail.com.`}
                onConfirm={() => run("send", () => sendContract(id), () => setStatus("sent"))}
                className="btn btn-glow flex items-center gap-1.5"
              >
                <Send size={14} /> {busy === "send" ? "Sending…" : "Send contract"}
              </ConfirmButton>
            ) : (
              <Link href="/integrations" className="btn btn-glow flex items-center gap-1.5">
                <Send size={14} /> Connect Adobe Sign to send
              </Link>
            ))}
        </div>
      </div>

      {error && <p className="fade-in -mt-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      {status === "sent" && (
        <p className="-mt-2 rounded-lg bg-blue-400/10 px-3 py-2 text-sm text-blue-200">
          Sent {sentAt} through Adobe Acrobat Sign to {signers.join(" and ")} — you sign after them.
          {agreementStatus && <span className="text-blue-200/70"> Adobe says: {agreementStatus.toLowerCase().replace(/_/g, " ")}.</span>}
        </p>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5 lg:sticky lg:top-2 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-3">
          {!locked && composed.missing.length > 0 && (
            <div className="fade-in rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
              <p className="text-sm text-amber-200">
                {composed.missing.length} detail{composed.missing.length === 1 ? "" : "s"} needed before it can be approved
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {composed.missing.map((m) => (
                  <button key={m.key} onClick={() => jump(m.key)} className="rounded-full border border-amber-400/30 px-2.5 py-0.5 text-xs text-amber-200 transition-colors hover:bg-amber-400/15">
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {status === "approved" && (
            <p className="rounded-xl border border-violet-400/25 bg-violet-400/[0.07] px-4 py-3 text-sm text-violet-200">
              Approved. Any change takes it back to draft for another look.
            </p>
          )}
          <DetailsPanel
            d={d}
            set={set}
            missing={composed.missing}
            rules={{ termination: c.termination, disputes: c.disputes, law: byCountry.GOVERNING_LAW, courts: byCountry.JURISDICTION_CLAUSE }}
            readOnly={locked}
          />
        </aside>

        <div className="flex min-w-0 flex-col gap-3 rounded-2xl bg-black/25 p-3 sm:p-8">
          {!locked && (
            <div className="flex items-center justify-between px-1 text-xs text-muted">
              <span>Hover a clause to edit, move or remove it.</span>
              <ConfirmButton
                message="Put the clauses back to the master template's? Edits made to this contract's clauses are lost."
                onConfirm={() => run("reset", async () => {
                  const res = await resetContractClauses(id);
                  if (res.clauses) setClauses(res.clauses);
                  return res;
                })}
                className="flex items-center gap-1 hover:text-foreground"
              >
                <RotateCcw size={12} /> Master template&apos;s clauses
              </ConfirmButton>
            </div>
          )}
          <ContractPaper clauses={clauses} onChange={changeClauses} contract={{ ...composed, details: d }} readOnly={locked} />
        </div>
      </div>
    </div>
  );
}
