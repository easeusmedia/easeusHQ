"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Braces, BriefcaseBusiness, Check, ChevronRight, Copy, ExternalLink, LayoutTemplate, Mail, MessageSquare, MessagesSquare, Pencil, RotateCcw, Send, Trash2, Undo2 } from "lucide-react";
import { fillParts, fillText, leadVars, MESSAGE_CHANNELS, sendLink, toneOf, variablesIn, type BoardData, type Contact, type Draft, type LeadData, type MessageData, type SentData, type StageData } from "@/lib/space";
import { deleteMessage, markSent, setLeadDraft, setLeadVar, unmarkSent, updateMessage } from "./actions";
import { StagePill } from "./pills";
import { ReasonDialog } from "./ReasonDialog";
import { Reveal } from "../../Reveal";
import { Dropdown } from "../../Dropdown";
import { InstagramIcon } from "../../PlatformIcon";
import { formatDateTime } from "../../TaskCard";

const OFFLINE = "That couldn't be saved. Check your connection and try again.";
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  email: <Mail size={13} className="text-sky-400" />,
  instagram: <InstagramIcon size={13} className="text-pink-400" />,
  linkedin: <BriefcaseBusiness size={13} className="text-blue-400" />,
  other: <MessageSquare size={13} className="text-violet-400" />,
};
const SMALL_BTN = "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50";
const INPUT = "w-full rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-hover";
const BLOCK = "rounded-xl bg-foreground/[0.03]";

const Dot = ({ color }: { color: string }) => <span className={`size-2 shrink-0 rounded-full ${toneOf(color).dot}`} />;

// A lead's messages. Its stage's message comes first, written out for this
// lead: copy it, mark it sent. Two ways to change it, on the message itself:
// - Edit (the pencil): this lead's copy only; the template stays as it is.
// - Edit template: that message's template, for every lead that hasn't sent
//   it (a lead with its own copy keeps it). Variables are made here.
// Other stages' messages fold away below.
export function Messages({ lead, board, stageId, sent, onSent, onSaved }: { lead: LeadData; board: BoardData; stageId: string; sent: SentData[] | null; onSent: (sent: SentData[]) => void; onSaved: () => void }) {
  // what's typed here shows at once, ahead of the board's refresh
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<Record<string, Draft | null>>({});
  const vars = leadVars({ ...lead, vars: { ...lead.vars, ...typed } }, board.fields);
  const auto = leadVars({ ...lead, vars: {} }, board.fields);
  const names = variablesIn(board.messages.flatMap((m) => [m.subject, m.body]));
  const own = (id: string) => (id in mine ? (mine[id] ?? undefined) : lead.drafts?.[id]);
  const [error, setError] = useState<string | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  async function saveVar(name: string, value: string) {
    if ((lead.vars[name] ?? "") === value.trim() && typed[name] === undefined) return;
    setTyped((t) => ({ ...t, [name]: value.trim() }));
    const res = await setLeadVar(lead.id, name, value).catch(() => ({
      error: OFFLINE,
    }));
    if (res.error) setError(res.error);
    else onSaved();
  }
  async function saveMine(messageId: string, draft: Draft | null) {
    setError(null);
    const res = await setLeadDraft(lead.id, messageId, draft).catch(() => ({
      error: OFFLINE,
    }));
    if (res.error) return res.error;
    setMine((d) => ({ ...d, [messageId]: draft }));
    onSaved();
  }

  const stage = board.stages.find((s) => s.id === stageId);
  const current = board.messages.filter((m) => m.stageId === stageId);
  const others = board.stages.filter((s) => s.id !== stageId && board.messages.some((m) => m.stageId === s.id));
  const otherCount = others.reduce((n, st) => n + board.messages.filter((m) => m.stageId === st.id).length, 0);
  // sent from a template since deleted: nowhere else to show them
  const orphans = (sent ?? []).filter((x) => !board.messages.some((m) => m.id === x.messageId));
  const blanks = names.filter((n) => !vars[n]);
  const contacts = board.fields.filter((f) => f.kind === "contacts").flatMap((f) => (Array.isArray(lead.values[f.id]) ? (lead.values[f.id] as Contact[]) : []));
  // where the sequence picks up, for a stage with nothing to send
  const here = board.stages.findIndex((s) => s.id === stageId);
  const next = board.stages.slice(here + 1).find((s) => board.messages.some((m) => m.stageId === s.id));

  const card = (m: MessageData) => (
    <MessageCard
      key={m.id}
      message={m}
      stages={board.stages}
      leadId={lead.id}
      vars={vars}
      auto={auto}
      names={names}
      own={own(m.id)}
      sent={sent?.find((x) => x.messageId === m.id) ?? null}
      all={sent}
      onSent={onSent}
      onSaved={onSaved}
      onError={setError}
      onVar={saveVar}
      onMine={(d) => saveMine(m.id, d)}
      contacts={contacts}
    />
  );

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 px-1">
        <MessagesSquare size={14} className="shrink-0 text-muted" />
        <h3 className="text-xs font-medium text-muted">Messages</h3>
        {stage && <span className="min-w-0 truncate text-xs text-muted/70">for {stage.name}</span>}
      </div>

      {error && (
        <p role="alert" className="fade-in px-1 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* this stage's: the message to send now */}
      {current.length ? (
        current.map(card)
      ) : (
        <div className={`${BLOCK} flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3`}>
          <p className="text-sm text-muted">Nothing to send at this stage.</p>
          {next && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              The next message is at <StagePill name={next.name} color={next.color} />
            </p>
          )}
        </div>
      )}

      {/* every other stage's, folded into one row */}
      {others.length > 0 && (
        <div className={BLOCK}>
          <FoldHead open={othersOpen} onClick={() => setOthersOpen(!othersOpen)} title="Other stages" summary={`${otherCount} ${otherCount === 1 ? "message" : "messages"}`} />
          <Reveal open={othersOpen}>
            <div className="flex flex-col gap-1 px-2 pb-2">
              {others.map((st) => {
                const list = board.messages.filter((m) => m.stageId === st.id);
                const isOpen = !!toggled[st.id];
                const done = list.filter((m) => sent?.some((x) => x.messageId === m.id)).length;
                return (
                  <div key={st.id}>
                    <button
                      type="button"
                      onClick={() => setToggled((o) => ({ ...o, [st.id]: !isOpen }))}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
                    >
                      <ChevronRight size={13} className={`shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                      <StagePill name={st.name} color={st.color} />
                      <span className="ml-auto text-[11px] text-muted tabular-nums">{done ? `${done} of ${list.length} sent` : list.length}</span>
                    </button>
                    <Reveal open={isOpen}>
                      <div className="flex flex-col gap-2 py-2 pl-6">{list.map(card)}</div>
                    </Reveal>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      )}

      {/* the words that change per lead, all in one place */}
      {names.length > 0 && (
        <div className={BLOCK}>
          <FoldHead open={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)} title="Variables for this lead" summary={blanks.length ? `${blanks.length} to fill` : "All filled"} alert={blanks.length > 0} />
          <Reveal open={detailsOpen}>
            <div className="grid gap-x-3 gap-y-2 px-3 pb-3 sm:grid-cols-2">
              {names.map((name) => (
                <label key={name} className="flex min-w-0 flex-col gap-1">
                  <span className="px-1 text-[11px] font-medium text-muted">{name}</span>
                  <input
                    defaultValue={lead.vars[name] ?? ""}
                    onBlur={(e) => saveVar(name, e.target.value)}
                    placeholder={auto[name] ? `${auto[name]} (filled in for you)` : `Type the ${name.toLowerCase()}`}
                    className={INPUT}
                  />
                </label>
              ))}
            </div>
          </Reveal>
        </div>
      )}

      {orphans.length > 0 && (
        <div className={BLOCK}>
          <p className="px-3 pt-2.5 pb-1 text-xs font-medium text-foreground/90">Sent from templates since deleted</p>
          <ul className="flex flex-col divide-y divide-border/40 px-2 pb-2">
            {orphans.map((x) => (
              <SentRow key={x.id} sent={x} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function FoldHead({ open, onClick, title, summary, alert = false }: { open: boolean; onClick: () => void; title: string; summary: string; alert?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs">
      <ChevronRight size={14} className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
      <span className="font-medium text-foreground/90">{title}</span>
      <span className={`ml-auto ${alert ? "text-red-300" : "text-muted"}`}>{summary}</span>
    </button>
  );
}

// One message for this lead: read it, fill what's missing, copy it, mark it
// sent; or change this lead's copy, or the template behind it
function MessageCard({
  message,
  stages,
  leadId,
  vars,
  auto,
  names,
  own,
  sent,
  all,
  onSent,
  onSaved,
  onError,
  onVar,
  onMine,
  contacts,
}: {
  message: MessageData;
  stages: StageData[];
  leadId: string;
  vars: Record<string, string>;
  auto: Record<string, string>;
  names: string[];
  own: Draft | undefined;
  sent: SentData | null;
  all: SentData[] | null;
  onSent: (sent: SentData[]) => void;
  onSaved: () => void;
  onError: (e: string | null) => void;
  onVar: (name: string, value: string) => void;
  onMine: (draft: Draft | null) => Promise<string | undefined>;
  contacts: Contact[];
}) {
  const [mode, setMode] = useState<"view" | "mine" | "template">("view");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const source = own ?? message;
  const subject = sent ? sent.subject : fillText(source.subject, vars);
  const body = sent ? sent.body : fillText(source.body, vars);
  const missing = sent ? [] : variablesIn([subject, body]);
  const isEmail = message.channel === "email";

  async function copy() {
    await navigator.clipboard.writeText(isEmail && subject ? `Subject: ${subject}\n\n${body}` : body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  async function toggleSent() {
    setBusy(true);
    onError(null);
    if (sent) {
      const res = await unmarkSent(sent.id).catch(() => ({ error: OFFLINE }));
      setBusy(false);
      if (res.error) return onError(res.error);
      onSent((all ?? []).filter((s) => s.id !== sent.id));
    } else {
      const res = await markSent(leadId, message.id).catch(() => ({
        error: OFFLINE,
        sent: undefined,
      }));
      setBusy(false);
      if (res.error || !res.sent) return onError(res.error ?? OFFLINE);
      onSent([res.sent, ...(all ?? [])]);
    }
    onSaved();
  }

  if (mode === "template") return <TemplateEditor message={message} stages={stages} names={names} leadId={leadId} onDone={() => setMode("view")} />;
  if (mode === "mine") return <OwnEditor message={message} subject={fillText(source.subject, vars)} body={fillText(source.body, vars)} hasOwn={!!own} onDone={() => setMode("view")} onSave={onMine} />;

  const link = sent ? null : sendLink(message.channel, contacts, subject, body);
  const ACTION = "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";

  return (
    <div className={`fade-in rounded-xl p-4 ${sent ? "bg-emerald-400/[0.04] ring-1 ring-emerald-400/20" : BLOCK}`}>
      {/* the message's name; copy and edit right beside it */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex shrink-0">{CHANNEL_ICON[message.channel] ?? CHANNEL_ICON.other}</span>
        <span className="min-w-0 truncate text-sm font-medium">{message.name}</span>
        {own && !sent && (
          <span title="Edited for this lead only" className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted">
            This lead&apos;s copy
          </span>
        )}
        {sent && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            <Check size={11} /> Sent
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={copy} title="Copy the message" className={ACTION}>
            {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </button>
          {!sent && (
            <>
              <button type="button" onClick={() => setMode("mine")} title="Edit this message for this lead only" className={ACTION}>
                <Pencil size={13} /> Edit
              </button>
              <button type="button" onClick={() => setMode("template")} title="Edit this message's template, for every lead" className={ACTION}>
                <LayoutTemplate size={13} /> Template
              </button>
            </>
          )}
        </span>
      </div>

      <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
        {isEmail && (sent ? subject : source.subject) && (
          <p className="mb-2 text-foreground">
            <span className="text-muted">Subject: </span>
            {sent ? subject : <Filled text={source.subject} vars={vars} />}
          </p>
        )}
        {sent ? body : <Filled text={source.body} vars={vars} />}
      </div>

      {/* what's still blank, filled right here */}
      {missing.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-red-400/[0.05] p-2.5">
          <p className="text-[11px] text-red-300">Fill in before sending</p>
          {missing.map((name) => (
            <label key={name} className="flex items-center gap-2.5">
              <span className="w-24 shrink-0 truncate text-xs text-muted">{name}</span>
              <input
                defaultValue=""
                onBlur={(e) => e.target.value.trim() && onVar(name, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                placeholder={auto[name] ?? `Type the ${name.toLowerCase()}`}
                className={`${INPUT} py-1`}
              />
            </label>
          ))}
        </div>
      )}

      {/* Sending happens in Gmail, Instagram or LinkedIn: this opens it
          ready to go; marking it sent then keeps a record of what went out */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
        {sent ? (
          <>
            <span className="text-[11px] text-muted">
              Sent by {sent.byName} · {formatDateTime(sent.sentAt)}
            </span>
            <button type="button" onClick={toggleSent} disabled={busy} className={`${SMALL_BTN} ml-auto`}>
              <Undo2 size={12} /> {busy ? "Saving…" : "Mark as not sent"}
            </button>
          </>
        ) : (
          <>
            {link &&
              (missing.length ? (
                <span title={`Fill in ${missing.join(", ")} first`} className="btn btn-sm btn-glow pointer-events-none opacity-50">
                  <ExternalLink size={13} /> {link.label}
                </span>
              ) : (
                <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={() => message.channel !== "email" && copy()} className="btn btn-sm btn-glow">
                  <ExternalLink size={13} /> {link.label}
                </a>
              ))}
            {!link && message.channel !== "email" && message.channel !== "other" && (
              <span className="text-[11px] text-muted">Add their {message.channel === "instagram" ? "Instagram" : "LinkedIn"} under Contacts to open it from here.</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[11px] text-muted">Sent it?</span>
              <button
                type="button"
                onClick={toggleSent}
                disabled={busy || missing.length > 0}
                title={missing.length ? `Fill in ${missing.join(", ")} first` : "Keep a record of what went out"}
                className="btn btn-sm btn-ghost"
              >
                <Send size={12} /> {busy ? "Saving…" : "Mark as sent"}
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// A message's text with its variables lit: filled ones in blue, missing
// ones in red, so what still needs typing stands out
function Filled({ text, vars }: { text: string; vars: Record<string, string> }) {
  return (
    <>
      {fillParts(text, vars).map((p, i) =>
        "text" in p ? (
          <span key={i}>{p.text}</span>
        ) : p.value ? (
          <span key={i} title={p.name} className="rounded bg-accent/15 px-0.5 text-[color-mix(in_srgb,var(--accent)_55%,white)]">
            {p.value}
          </span>
        ) : (
          <span key={i} title="Fill this in below" className="rounded bg-red-400/10 px-0.5 text-red-300">
            {`{{${p.name}}}`}
          </span>
        ),
      )}
    </>
  );
}

function SentRow({ sent }: { sent: SentData }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.03]">
        <ChevronRight size={13} className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        <span className="flex shrink-0">{CHANNEL_ICON[sent.channel] ?? CHANNEL_ICON.other}</span>
        <span className="min-w-0 truncate font-medium text-foreground/90">{sent.name}</span>
        <span className="shrink-0 text-muted">· {sent.stageName}</span>
        <span className="ml-auto shrink-0 text-muted">
          {sent.byName}, {formatDateTime(sent.sentAt)}
        </span>
      </button>
      <Reveal open={open}>
        <div className="px-7 pt-1 pb-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
          {sent.subject && (
            <p className="mb-2">
              <span className="text-muted">Subject: </span>
              {sent.subject}
            </p>
          )}
          {sent.body}
        </div>
      </Reveal>
    </li>
  );
}

// Changing the message for this lead alone: the text as it would go out,
// edited freely. The template and every other lead stay as they are.
function OwnEditor({
  message,
  subject: startSubject,
  body: startBody,
  hasOwn,
  onDone,
  onSave,
}: {
  message: MessageData;
  subject: string;
  body: string;
  hasOwn: boolean;
  onDone: () => void;
  onSave: (draft: Draft | null) => Promise<string | undefined>;
}) {
  const [subject, setSubject] = useState(startSubject);
  const [body, setBody] = useState(startBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(draft: Draft | null) {
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) return setError(err);
    onDone();
  }

  return (
    <div className={`fade-in flex flex-col gap-2.5 p-4 ring-1 ring-accent/30 ${BLOCK}`}>
      <div className="flex items-center gap-2">
        <span className="flex shrink-0">{CHANNEL_ICON[message.channel] ?? CHANNEL_ICON.other}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{message.name}</span>
        <span className="shrink-0 text-[11px] text-muted">Editing for this lead only</span>
      </div>
      {message.channel === "email" && startSubject && <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className={INPUT} />}
      <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" className={`${INPUT} field-sizing-content min-h-40 resize-none leading-relaxed`} />
      {error && (
        <p role="alert" className="fade-in text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
        {hasOwn ? (
          <button type="button" onClick={() => save(null)} disabled={busy} className={SMALL_BTN}>
            <RotateCcw size={12} /> Go back to the template
          </button>
        ) : (
          <p className="text-[11px] text-muted">The template and other leads stay as they are.</p>
        )}
        <div className="ml-auto flex shrink-0 gap-1.5">
          <button type="button" onClick={onDone} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={() => save({ subject, body })} disabled={busy || !body.trim()} className="btn btn-sm btn-glow">
            {busy ? "Saving…" : "Save for this lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Writing a template, new or existing. Select words and press "Make a
// variable" to turn them into one ({{Guest}}), or press it with nothing
// selected to add a new one where the cursor is; every lead fills its own in.
function TemplateEditor({ message, stages, names, leadId, onDone }: { message: MessageData; stages: StageData[]; names: string[]; leadId: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(message.name);
  const [channel, setChannel] = useState(message.channel);
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<{
    field: "subject" | "body";
    from: number;
    to: number;
    words: string;
    name: string;
  } | null>(null);
  const last = useRef<"subject" | "body">("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const stage = stages.find((s) => s.id === message.stageId);

  const fieldOf = (f: "subject" | "body") => (f === "subject" ? subjectRef.current : bodyRef.current);
  const setOf = (f: "subject" | "body") => (f === "subject" ? setSubject : setBody);
  const valueOf = (f: "subject" | "body") => (f === "subject" ? subject : body);

  function startVariable() {
    const f = channel === "email" ? last.current : "body";
    const el = fieldOf(f);
    const text = valueOf(f);
    const from = el?.selectionStart ?? text.length;
    const to = el?.selectionEnd ?? from;
    const words = text.slice(from, to).trim();
    setError(null);
    const guess = words && words.split(/\s+/).length <= 2 && words.length <= 24 ? words.replace(/^\w/, (c) => c.toUpperCase()) : "";
    setNaming({ field: f, from, to, words, name: guess });
  }
  function finishVariable() {
    if (!naming) return;
    const n = naming.name.trim().replace(/[{}]/g, "");
    if (!n) return;
    const text = valueOf(naming.field);
    setOf(naming.field)(`${text.slice(0, naming.from)}{{${n}}}${text.slice(naming.to)}`);
    // words picked from this lead's message were its value: keep them for it
    if (naming.words && !names.includes(n)) setLeadVar(leadId, n, naming.words).catch(() => undefined);
    setNaming(null);
  }
  function insert(n: string) {
    const f = channel === "email" ? last.current : "body";
    const el = fieldOf(f);
    const text = valueOf(f);
    const at = el?.selectionStart ?? text.length;
    setOf(f)(`${text.slice(0, at)}{{${n}}}${text.slice(el?.selectionEnd ?? at)}`);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateMessage(message.id, {
      name,
      channel,
      subject,
      body,
    }).catch(() => ({ error: OFFLINE }));
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onDone();
  }

  const used = variablesIn([subject, body, ...names.map((n) => `{{${n}}}`)]);

  return (
    <div className={`fade-in flex flex-col gap-2.5 p-4 ring-1 ring-accent/30 ${BLOCK}`}>
      <div className="flex items-center gap-2">
        <LayoutTemplate size={13} className="shrink-0 text-accent" />
        <span className="text-sm font-medium">Edit template</span>
        <span className="ml-auto text-[11px] text-muted">For every lead that hasn&apos;t sent it</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {stage && (
          <span className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.07] px-3 py-1.5 text-xs text-foreground">
            <Dot color={stage.color} /> {stage.name}
          </span>
        )}
        <Dropdown
          pill={{ icon: CHANNEL_ICON[channel] ?? CHANNEL_ICON.other }}
          value={channel}
          placeholder="Sent by"
          options={MESSAGE_CHANNELS.map((c) => ({
            value: c.kind,
            label: c.label,
          }))}
          onChange={setChannel}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, like Email 2"
          aria-label="Template name"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none! placeholder:text-muted/60"
        />
      </div>

      {channel === "email" && (
        <input ref={subjectRef} value={subject} onFocus={() => (last.current = "subject")} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className={INPUT} />
      )}
      <textarea
        ref={bodyRef}
        autoFocus
        value={body}
        onFocus={() => (last.current = "body")}
        onChange={(e) => setBody(e.target.value)}
        placeholder={"Hi {{Name}},\n\nWrite the message. Words that change from lead to lead become variables."}
        aria-label="Message"
        className={`${INPUT} field-sizing-content min-h-40 resize-none leading-relaxed`}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={startVariable}
          title="Select words to turn them into a variable, or add a new one at the cursor"
          className="btn btn-xs btn-glow flex items-center gap-1.5 px-2.5"
        >
          <Braces size={12} /> Make a variable
        </button>
        {used.length > 0 && <span className="ml-1 text-[11px] text-muted">Insert:</span>}
        {used.map((n) => (
          <button key={n} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(n)} className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/25">
            {n}
          </button>
        ))}
      </div>

      <Reveal open={!!naming}>
        {naming && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] p-2.5 text-xs">
            <span className="text-muted">
              {naming.words ? (
                <>
                  Turn <span className="text-foreground">“{naming.words.length > 40 ? `${naming.words.slice(0, 40)}…` : naming.words}”</span> into a variable called
                </>
              ) : (
                "Add a variable called"
              )}
            </span>
            <input
              autoFocus
              value={naming.name}
              onChange={(e) => setNaming({ ...naming, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  finishVariable();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setNaming(null);
                }
              }}
              placeholder="Guest"
              className="w-32 rounded-md border border-border/60 bg-white/[0.03] px-2 py-1 text-xs text-foreground outline-none focus:border-hover"
            />
            <button type="button" onClick={finishVariable} disabled={!naming.name.trim()} className="btn btn-xs btn-glow px-2.5 disabled:opacity-50">
              {naming.words ? "Make it" : "Add it"}
            </button>
            <button type="button" onClick={() => setNaming(null)} className="btn btn-xs btn-ghost px-2">
              Cancel
            </button>
          </div>
        )}
      </Reveal>

      {error && (
        <p role="alert" className="fade-in text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
        <button type="button" onClick={() => setDeleting(true)} className={`${SMALL_BTN} hover:text-red-300`}>
          <Trash2 size={12} /> Delete template
        </button>
        <div className="ml-auto flex shrink-0 gap-1.5">
          <button type="button" onClick={onDone} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy || !body.trim()} className="btn btn-sm btn-glow">
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted">Leads that already sent it keep what went out, and a lead with its own copy keeps that copy.</p>

      <ReasonDialog
        open={deleting}
        danger
        title={`Delete ${message.name}?`}
        hint="It comes off this stage for every lead. Messages already sent stay on their leads."
        confirm="Delete template"
        onCancel={() => setDeleting(false)}
        onConfirm={async (reason) => {
          const res = await deleteMessage(message.id, reason).catch(() => ({
            error: OFFLINE,
          }));
          if (res.error) return res.error;
          setDeleting(false);
          router.refresh();
          onDone();
        }}
      />
    </div>
  );
}
