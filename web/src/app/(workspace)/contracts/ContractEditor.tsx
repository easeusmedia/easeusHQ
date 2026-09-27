"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, RefreshCw, Copy, Download, FileDown, ListChecks, PenLine, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";
import { PROVIDER, compose, withDefaults, type Clause, type ContractDetails } from "@/lib/contract";
import { ConfirmButton } from "../ConfirmButton";
import { ContractPaper } from "./ContractPaper";
import { ContractChat } from "./ContractChat";
import { ContractForm } from "./ContractForm";
import { Stepper, stepOf } from "./status";
import type { ChatMessage } from "./assistant";
import type { TrackedEvent } from "./tracking";
import {
  approveContract,
  chatContract,
  clearContractChat,
  contractSigningLink,
  checkContractMail,
  deleteContract,
  markContractSent,
  markContractSigned,
  resetContractClauses,
  saveContractClauses,
  saveContractDetails,
  sendContract,
} from "./actions";

// Acrobat's E-sign page — its Request e-signatures card takes a dropped file
// straight away. (There's no address that opens the request itself.)
const ACROBAT_ESIGN = "https://acrobat.adobe.com/link/tools/?group=group-sign";

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
  sentByApi,
  events,
  tracking,
  hasSignedCopy,
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
  // sent through the Adobe API, rather than by hand in Acrobat
  sentByApi: boolean;
  // what Adobe's emails have said about it, oldest first
  events: (TrackedEvent & { when: string })[];
  // Gmail's connected, so it follows along by itself
  tracking: boolean;
  // the signed copy came with Adobe's "Signed and Filed" email
  hasSignedCopy: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState(initialDetails);
  const [clauses, setClauses] = useState(initialClauses);
  const [status, setStatus] = useState(initialStatus);
  const [chat, setChat] = useState(initialChat);
  const [thinking, setThinking] = useState(false);
  const [busyField, setBusyField] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  // the left column shows one at a time: the form, or Claude
  const [tab, setTab] = useState<"form" | "chat">("form");
  // Claude answered something sent from the form while the chat was hidden
  const [unseen, setUnseen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // "Send via Acrobat" pressed: the file's downloaded, Acrobat's open
  const [prepared, setPrepared] = useState(false);
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
    if (res.chat) {
      setChat(res.chat);
      // a question back needs answering where it can be seen
      if (res.chat[res.chat.length - 1]?.question) setTab("chat");
      else setUnseen(true);
    }
    // only what Claude changed — anything clicked while it was thinking stays
    if (res.changes) setD((cur) => withDefaults({ ...cur, ...res.changes }));
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

  // Adobe's emails so far, as a line of steps
  const timeline = events.length > 0 && (
    <ol className="mt-3 flex flex-col gap-2 border-l border-accent/30 pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative text-sm text-foreground/85">
          <span className={`absolute -left-[21px] top-[7px] size-2 rounded-full ${e.kind === "completed" ? "bg-emerald-400" : "bg-accent"}`} />
          {e.text} <span className="text-xs text-muted">· {e.when}</span>
        </li>
      ))}
    </ol>
  );
  const check = (
    <button onClick={() => run("check", () => checkContractMail(id))} disabled={busy !== null} className="btn btn-ghost flex items-center gap-1.5">
      <RefreshCw size={14} className={busy === "check" ? "animate-spin" : ""} /> {busy === "check" ? "Checking…" : "Check now"}
    </button>
  );

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
    // No Adobe API on the plan: sent through Acrobat's own (free) Request
    // e-signatures, with the PDF's signature and date spots already tagged
    const acrobat = (
      <a href={ACROBAT_ESIGN} target="_blank" rel="noopener noreferrer" className="btn btn-ghost flex items-center gap-1.5">
        Open Acrobat <ArrowUpRight size={14} />
      </a>
    );
    if (status === "approved" && !adobeConnected) {
      // One click does our side: downloads the PDF, copies the client's
      // email, opens Acrobat. Acrobat's own site isn't automated — Adobe
      // doesn't allow bots on it.
      const go = () => {
        navigator.clipboard.writeText(clients.map((c) => c.email.trim()).join(", ")).catch(() => {});
        const a = document.createElement("a");
        a.href = `/api/contracts/${id}/pdf?sign`;
        a.download = "";
        a.click();
        window.open(ACROBAT_ESIGN, "_blank", "noopener");
        setPrepared(true);
      };
      const send = (
        <button onClick={go} className="btn btn-glow flex items-center gap-1.5">
          <Send size={14} /> Send via Acrobat
        </button>
      );
      const sent = (
        <ConfirmButton
          message="Sent it through Acrobat? The contract is locked from here on."
          confirm="Yes, it's sent"
          onConfirm={() => run("sent", () => markContractSent(id), () => setStatus("sent"))}
          className={`btn flex items-center gap-1.5 ${prepared ? "btn-glow" : "btn-ghost"}`}
        >
          <Check size={14} /> I&apos;ve sent it
        </ConfirmButton>
      );
      return {
        title: prepared ? "Now finish in Acrobat" : "Approved — send it via Acrobat",
        body: prepared ? (
          <ol className="flex list-decimal flex-col gap-1 pl-4">
            <li>
              Drag the file that just downloaded onto <b className="font-medium text-foreground">Request e-signatures</b> in the Acrobat tab.
            </li>
            <li>
              Add <b className="font-medium text-foreground">{PROVIDER.email}</b> first, then paste the client&apos;s email (it&apos;s copied).
            </li>
            <li>
              Put a signature and a date on each person&apos;s own box (<b className="font-medium text-foreground">Auto-place fields</b>, or drag them),
              then <b className="font-medium text-foreground">Send</b>. Acrobat asks Ashmit to sign first, then emails the client.
            </li>
            <li>
              {tracking ? (
                <>That&apos;s it — this page updates by itself when Adobe&apos;s email says it&apos;s out.</>
              ) : (
                <>
                  Back here: <b className="font-medium text-foreground">I&apos;ve sent it</b>.
                </>
              )}
            </li>
          </ol>
        ) : (
          `One click downloads it, copies ${to}, and opens Acrobat — Ashmit signs first there, then the client.`
        ),
        primary: prepared ? (tracking ? check : sent) : send,
        action: (
          <div className="flex flex-wrap gap-2">
            {send}
            {prepared && tracking && check}
            {sent}
          </div>
        ),
      };
    }
    if (status === "sent" && !sentByApi) {
      const signed = (
        <ConfirmButton
          message="Has everyone signed it in Acrobat?"
          confirm="Mark signed"
          onConfirm={() => run("signed", () => markContractSigned(id), () => setStatus("signed"))}
          className="btn btn-glow flex items-center gap-1.5"
        >
          <Check size={14} /> Mark as signed
        </ConfirmButton>
      );
      return {
        title: "Out for signature in Acrobat",
        body: (
          <>
            {tracking
              ? `Sent ${sentAt ?? "today"}. This follows Adobe's emails by itself — it turns Signed, with the signed copy, once everyone has.`
              : `Sent ${sentAt ?? "today"}. Ashmit signs first in Acrobat, then ${to} gets Acrobat's email to sign. Mark it signed once everyone has.`}
            {timeline}
          </>
        ),
        primary: tracking ? check : signed,
        action: (
          <div className="flex flex-wrap gap-2">
            {tracking && check}
            {signed}
            {acrobat}
          </div>
        ),
      };
    }
    if (status === "signed" && !sentByApi) {
      const copy = hasSignedCopy ? (
        <a href={`/api/contracts/${id}/pdf?signed=1`} className="btn btn-glow flex items-center gap-1.5">
          <Download size={14} /> Signed copy
        </a>
      ) : (
        acrobat
      );
      return {
        title: "Signed by everyone",
        body: (
          <>
            {hasSignedCopy ? "The signed copy, as Adobe filed it, is saved here." : "The signed copy is in Acrobat, under Agreements."}
            {timeline}
          </>
        ),
        primary: copy,
        action: copy,
      };
    }
    if (status === "approved")
      return {
        title: "Approved — send it for signing",
        body: `Adobe Acrobat Sign emails you (${PROVIDER.email}) to sign first; then it goes to ${to} to sign.`,
        action: (
          <ConfirmButton
            message={`Send it through Adobe Acrobat Sign? You sign first as ${PROVIDER.email}, then it goes to ${to}.`}
            confirm="Send"
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

  // On a large screen the page itself never scrolls: the header and the
  // stepper stay put; the left column shows the form (which scrolls) or
  // Claude, and on the right the action bar stays while the contract scrolls.
  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-2*var(--page-pad))] lg:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start gap-3">
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

      <div className="shrink-0">
        <Stepper at={stepOf(status)} />
      </div>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        {/* the left column: the form or Claude, one at a time, each given the whole height */}
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          <div className="flex shrink-0 gap-1 rounded-2xl border border-white/[0.06] bg-surface/60 p-1">
            {(
              [
                { key: "form", label: "Form", Icon: ListChecks },
                { key: "chat", label: "Ask Claude", Icon: Sparkles },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  // leaving the chat means its replies were seen; opening it sees them
                  setUnseen(false);
                }}
                aria-pressed={tab === key}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm transition-colors duration-200 ${
                  tab === key ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon size={15} className={tab === key ? "text-accent" : ""} />
                {label}
                {key === "chat" && (thinking || (unseen && tab !== "chat")) && (
                  <span className={`size-1.5 rounded-full bg-accent ${thinking ? "animate-pulse" : ""}`} />
                )}
              </button>
            ))}
          </div>

          {/* both stay mounted, so nothing typed is lost switching between them */}
          <div className={`${tab === "form" ? "flex" : "hidden"} flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1`}>
            <ContractForm d={d} today={today} missing={missing} locked={locked} busy={busyField} onSet={set} onAsk={(field, text, files) => ask(text, field, files)} />

            {/* after the last question: what to do now */}
            <div className="relative shrink-0 overflow-hidden rounded-3xl border border-accent/30 bg-accent/[0.07] p-5">
              <div className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-accent/20 blur-3xl" />
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-accent">Next step</p>
              <p className="mt-1.5 text-base font-medium">{next.title}</p>
              <div className="mt-1 text-sm leading-relaxed text-foreground/70">{next.body}</div>
              {next.action && <div className="mt-4 flex">{next.action}</div>}
            </div>
          </div>

          <div className={`${tab === "chat" ? "block" : "hidden"} h-[560px] lg:h-auto lg:min-h-0 lg:flex-1`}>
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
        </div>

        <div className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/[0.05] bg-[radial-gradient(120%_60%_at_50%_0%,rgba(91,168,212,0.06),transparent_60%)] lg:min-h-0">
          {/* the one next step, fixed above the contract it's about */}
          <div className="flex shrink-0 flex-col gap-2 border-b border-white/[0.05] px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{next.title}</p>
                {!locked && <p className="text-xs text-muted">Live preview · hover a clause to tweak it by hand</p>}
              </div>
              {!locked && (
                <ConfirmButton
                  message="Put the clauses back to the master template's? Changes made to this contract's clauses are lost."
                  confirm="Reset"
                  onConfirm={() =>
                    run("reset", async () => {
                      const res = await resetContractClauses(id);
                      if (res.clauses) setClauses(res.clauses);
                      return res;
                    })
                  }
                  className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
                >
                  <RotateCcw size={12} /> Template clauses
                </ConfirmButton>
              )}
              {"primary" in next && next.primary ? next.primary : next.action}
            </div>
            {(error || note) && <p className="fade-in text-sm text-foreground/85">{error ?? note}</p>}
          </div>
          {/* the contract — scrolls on its own */}
          <div className="p-3 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
            <ContractPaper clauses={clauses} onChange={changeClauses} contract={{ ...composed, details: d }} readOnly={locked} />
          </div>
        </div>
      </div>
    </div>
  );
}
