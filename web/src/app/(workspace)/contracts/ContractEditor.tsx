"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, Download, FileDown, PenLine, RotateCcw, Send, Trash2 } from "lucide-react";
import { PROVIDER, compose, withDefaults, type Clause, type ContractDetails } from "@/lib/contract";
import { ConfirmButton } from "../ConfirmButton";
import { ContractPaper } from "./ContractPaper";
import { ContractChat } from "./ContractChat";
import { ContractForm } from "./ContractForm";
import { Stepper, stepOf } from "./status";
import type { ChatMessage } from "./assistant";
import {
  approveContract,
  chatContract,
  clearContractChat,
  contractSigningLink,
  deleteContract,
  resetContractClauses,
  saveContractClauses,
  saveContractDetails,
  sendContract,
} from "./actions";

// One contract, start to finish. On the left: what to do next, the form
// (click an answer, or type one for Claude), and Claude for anything else.
// On the right: the contract exactly as it will read.
export function ContractEditor({
  id,
  token,
  name,
  status: initialStatus,
  details: initialDetails,
  clauses: initialClauses,
  chat: initialChat,
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
  const [chat, setChat] = useState(initialChat);
  const [thinking, setThinking] = useState(false);
  const [busyField, setBusyField] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const locked = status === "sent" || status === "signed";

  const composed = useMemo(() => compose(clauses, d, today), [clauses, d, today]);
  const missing = useMemo(() => new Set(composed.missing.map((m) => m.key)), [composed]);
  const title = d.entity || name || d.contactName || "New contract";
  const clients = d.signatories.filter((s) => s.name.trim());

  // a click in the form: shown at once, saved behind it
  function set(patch: Partial<ContractDetails>) {
    setD((cur) => withDefaults({ ...cur, ...patch }));
    saveContractDetails(id, patch).then((res) => {
      if (res.error) setError(res.error);
      if (res.status) setStatus(res.status);
    });
  }

  // anything for Claude — from the chat, or a form field's own box —
  // with whatever files came with it
  async function ask(text: string, field: string | null = null, files: File[] = []) {
    if (thinking) return;
    setThinking(true);
    setBusyField(field);
    setChatError(null);
    const message = field ? `[${field}] ${text}` : text;
    setChat((c) => [...c, { role: "user", text: message, at: new Date().toISOString(), ...(files.length ? { files: files.map((f) => f.name) } : {}) }]);
    let form: FormData | null = null;
    if (files.length) {
      form = new FormData();
      for (const f of files) form.append("files", f);
    }
    const res = await chatContract(id, message, form);
    setThinking(false);
    setBusyField(null);
    if (res.error) return setChatError(res.error);
    if (res.chat) setChat(res.chat);
    if (res.details) setD(res.details);
    if (res.clauses) setClauses(res.clauses);
    if (res.status) setStatus(res.status);
  }

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

  async function signNow() {
    setBusy("sign");
    setNote(null);
    const res = await contractSigningLink(id);
    setBusy(null);
    if (res.url) window.open(res.url, "_blank", "noopener");
    else setNote(res.error ?? null);
  }

  // what to do now — always one clear next step
  const next = (() => {
    const to = clients.map((s) => s.email.trim()).join(" and ");
    if (status === "invited")
      return {
        title: "Waiting for the client's form",
        body: "Send them the link — or fill everything in yourself below.",
        action: (
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/start/${token}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn btn-glow flex items-center gap-1.5"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy form link"}
          </button>
        ),
      };
    if (status === "draft" && composed.missing.length)
      return {
        title: `${composed.missing.length} thing${composed.missing.length === 1 ? "" : "s"} left to fill in`,
        body: `${composed.missing.map((m) => m.label).join(", ")} — marked below. Then you can approve it.`,
      };
    if (status === "draft")
      return {
        title: "Ready — approve it",
        body: "Read the contract on the right. When it's right, approve it — then it can be sent.",
        action: (
          <button onClick={() => run("approve", () => approveContract(id), () => setStatus("approved"))} disabled={busy !== null} className="btn btn-glow flex items-center gap-1.5">
            <Check size={14} /> {busy === "approve" ? "Approving…" : "Approve contract"}
          </button>
        ),
      };
    if (status === "approved" && !adobeConnected)
      return {
        title: "Approved — connect Adobe Sign to send it",
        body: "Sending goes through Adobe Acrobat Sign, which isn't connected yet. Add its integration key once under Integrations.",
        action: (
          <Link href="/integrations" className="btn btn-glow flex items-center gap-1.5">
            Connect Adobe Sign <ArrowRight size={14} />
          </Link>
        ),
      };
    if (status === "approved")
      return {
        title: "Approved — send it for signing",
        body: `Adobe Acrobat Sign emails you (${PROVIDER.email}) to sign first; then it goes to ${to} to sign.`,
        action: (
          <ConfirmButton
            message={`Send it through Adobe Acrobat Sign? You sign first as ${PROVIDER.email}, then it goes to ${to}.`}
            onConfirm={() => run("send", () => sendContract(id), () => setStatus("sent"))}
            className="btn btn-glow flex items-center gap-1.5"
          >
            <Send size={14} /> {busy === "send" ? "Sending…" : "Send contract"}
          </ConfirmButton>
        ),
      };
    if (status === "sent")
      return {
        title: "Out for signature",
        body: `Sent ${sentAt}. Sign it first (Adobe's email to ${PROVIDER.email}, or right here) — then ${to} gets it to sign.${
          agreementStatus ? ` Adobe says: ${agreementStatus.toLowerCase().replace(/_/g, " ")}.` : ""
        }`,
        action: (
          <button onClick={signNow} disabled={busy !== null} className="btn btn-glow flex items-center gap-1.5">
            <PenLine size={14} /> {busy === "sign" ? "Opening…" : "Sign now"}
          </button>
        ),
      };
    return {
      title: "Signed by everyone",
      body: "The signed copy is in Adobe Acrobat Sign, and here.",
      action: (
        <a href={`/api/contracts/${id}/pdf?signed=1`} className="btn btn-glow flex items-center gap-1.5">
          <Download size={14} /> Signed copy
        </a>
      ),
    };
  })();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/contracts" aria-label="All contracts" className="mt-0.5 flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-xs text-muted">Service agreement{d.contactEmail && <> · from {d.contactName || d.contactEmail}</>}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/contracts/${id}/pdf`} className="btn btn-ghost flex items-center gap-1.5">
            <FileDown size={14} /> PDF
          </a>
          {!locked && (
            <ConfirmButton message="Delete this contract? The client's link stops working." onConfirm={() => run("delete", () => deleteContract(id), () => router.push("/contracts"))} className="btn btn-ghost px-2.5">
              <Trash2 size={14} />
            </ConfirmButton>
          )}
        </div>
      </div>

      <Stepper at={stepOf(status)} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ContractForm d={d} today={today} missing={missing} locked={locked} busy={busyField} onSet={set} onAsk={(field, text, files) => ask(text, field, files)} />

          {/* after the last question: what to do now */}
          <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-accent/[0.07] p-5">
            <div className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-accent/20 blur-3xl" />
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-accent">Next step</p>
            <p className="mt-1.5 text-base font-medium">{next.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/70">{next.body}</p>
            {next.action && <div className="mt-4 flex">{next.action}</div>}
          </div>


          <ContractChat
            chat={chat}
            thinking={thinking}
            error={chatError}
            locked={locked}
            onSend={(text, files) => ask(text, null, files)}
            onClear={async () => {
              await clearContractChat(id);
              setChat([]);
              setChatError(null);
            }}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border border-white/[0.05] bg-[radial-gradient(120%_60%_at_50%_0%,rgba(111,179,189,0.06),transparent_60%)] p-3 sm:p-8 lg:sticky lg:top-2 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
          {/* the one next step, on top of the contract it's about */}
          <div className="flex flex-wrap items-center gap-3 px-1">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{next.title}</p>
              {!locked && <p className="text-xs text-muted">Live preview · hover a clause to tweak it by hand</p>}
            </div>
            {next.action}
          </div>
          {(error || note) && <p className="fade-in px-1 text-sm text-foreground/85">{error ?? note}</p>}
          {!locked && (
            <div className="flex items-center justify-end px-1 text-xs text-muted">
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
