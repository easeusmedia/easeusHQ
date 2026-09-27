"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, FileDown, RotateCcw, Send, Trash2 } from "lucide-react";
import { compose, type Clause, type ContractDetails } from "@/lib/contract";
import { ConfirmButton } from "../ConfirmButton";
import { ContractPaper } from "./ContractPaper";
import { ContractChat } from "./ContractChat";
import { Stepper, stepOf } from "./status";
import type { ChatMessage } from "./assistant";
import { approveContract, deleteContract, resetContractClauses, saveContractClauses, sendContract } from "./actions";

// One contract, start to finish: Claude on the left to change anything by
// asking, the contract on the right exactly as it will read, and the one
// next step at the top — approve, then send.
export function ContractEditor({
  id,
  token,
  name,
  status: initialStatus,
  details: initialDetails,
  clauses: initialClauses,
  chat,
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
  chat: ChatMessage[];
  today: string;
  adobeConnected: boolean;
  agreementStatus: string | null;
  sentAt: string | null;
}) {
  const router = useRouter();
  const [d, setD] = useState(initialDetails);
  const [clauses, setClauses] = useState(initialClauses);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const locked = status === "sent" || status === "signed";

  const composed = useMemo(() => compose(clauses, d, today), [clauses, d, today]);
  const title = d.entity || name || d.contactName || "New contract";
  const signers = d.signatories.filter((s) => s.name.trim()).map((s) => s.email.trim());

  // a clause edited by hand on the paper
  async function changeClauses(next: Clause[]) {
    setClauses(next);
    const res = await saveContractClauses(id, next);
    if (res.error) setError(res.error);
    if (res.status) setStatus(res.status);
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/contracts" aria-label="All contracts" className="mt-0.5 flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-xs text-muted">
            Service agreement{d.contactEmail && <> · from {d.contactName || d.contactEmail}</>}
          </p>
        </div>

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
              onClick={() => run("approve", () => approveContract(id), () => setStatus("approved"))}
              disabled={composed.missing.length > 0 || busy !== null}
              title={composed.missing.length ? "Fill in what's missing first — just tell the assistant" : undefined}
              className="btn btn-glow flex items-center gap-1.5 disabled:opacity-40"
            >
              <Check size={14} /> {busy === "approve" ? "Approving…" : "Approve"}
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

      <Stepper at={stepOf(status)} />

      {error && <p className="fade-in rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm text-red-200">{error}</p>}
      {status === "approved" && (
        <p className="fade-in rounded-xl border border-violet-400/20 bg-violet-400/[0.07] px-4 py-2.5 text-sm text-violet-200">
          Approved — send it when you&apos;re ready. Any change takes it back for another look.
        </p>
      )}
      {status === "sent" && (
        <p className="fade-in rounded-xl border border-blue-400/20 bg-blue-400/[0.07] px-4 py-2.5 text-sm text-blue-200">
          Sent {sentAt} through Adobe Acrobat Sign to {signers.join(" and ")} — you sign after them.
          {agreementStatus && <span className="text-blue-200/70"> Adobe says: {agreementStatus.toLowerCase().replace(/_/g, " ")}.</span>}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-2 lg:h-[calc(100dvh-13rem)]">
          <ContractChat
            id={id}
            initial={chat}
            missing={composed.missing}
            locked={locked}
            who={d.contactName.split(/\s+/)[0] || d.entity || "the client"}
            onUpdate={(next) => {
              setD(next.details);
              setClauses(next.clauses);
              setStatus(next.status);
            }}
          />
        </div>

        <div className="relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border border-white/[0.05] bg-[radial-gradient(120%_60%_at_50%_0%,rgba(139,147,255,0.07),transparent_60%)] p-3 sm:p-8">
          {!locked && (
            <div className="flex items-center justify-between px-1 text-xs text-muted">
              <span>Live preview · hover a clause to tweak it by hand</span>
              <ConfirmButton
                message="Put the clauses back to the master template's? Changes made to this contract's clauses are lost."
                onConfirm={() =>
                  run("reset", async () => {
                    const res = await resetContractClauses(id);
                    if (res.clauses) setClauses(res.clauses);
                    return res;
                  })
                }
                className="flex items-center gap-1 transition-colors hover:text-foreground"
              >
                <RotateCcw size={12} /> Template clauses
              </ConfirmButton>
            </div>
          )}
          <ContractPaper clauses={clauses} onChange={changeClauses} contract={{ ...composed, details: d }} readOnly={locked} />
        </div>
      </div>
    </div>
  );
}
