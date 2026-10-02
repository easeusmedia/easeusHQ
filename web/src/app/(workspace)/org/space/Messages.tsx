"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Braces, BriefcaseBusiness, Check, ChevronRight, Copy, Mail, MessageSquare, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { fillParts, fillText, leadVars, MESSAGE_CHANNELS, variablesIn, type BoardData, type LeadData, type MessageData, type SentData } from "@/lib/space";
import { createMessage, deleteMessage, markSent, setLeadVar, unmarkSent, updateMessage } from "./actions";
import { StagePill } from "./pills";
import { ReasonDialog } from "./ReasonDialog";
import { Reveal } from "../../Reveal";
import { InstagramIcon } from "../../PlatformIcon";
import { formatDateTime } from "../../TaskCard";

const OFFLINE = "That couldn't be saved. Check your connection and try again.";
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  email: <Mail size={14} />,
  instagram: <InstagramIcon size={14} />,
  linkedin: <BriefcaseBusiness size={14} />,
  other: <MessageSquare size={14} />,
};
const SMALL_BTN = "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50";

// The lead's messages, stage by stage, as the sequence lays them out. The
// stage it's in opens; the rest fold away. Each message is the stage's
// wording with this lead's details filled in: copy it, send it, mark it
// sent (then it's frozen as sent). Editing a message changes it for every
// lead that hasn't sent it yet.
export function Messages({
  lead,
  board,
  stageId,
  sent,
  onSent,
  onSaved,
}: {
  lead: LeadData;
  board: BoardData;
  stageId: string;
  sent: SentData[] | null;
  onSent: (sent: SentData[]) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // details typed here show at once, ahead of the board's refresh
  const [typed, setTyped] = useState<Record<string, string>>({});
  const vars = leadVars({ ...lead, vars: { ...lead.vars, ...typed } }, board.fields);
  const auto = leadVars({ ...lead, vars: {} }, board.fields);
  const names = variablesIn(board.messages.flatMap((m) => [m.subject, m.body]));
  const [error, setError] = useState<string | null>(null);

  async function saveVar(name: string, value: string) {
    if ((lead.vars[name] ?? "") === value.trim() && typed[name] === undefined) return;
    setTyped((t) => ({ ...t, [name]: value.trim() }));
    const res = await setLeadVar(lead.id, name, value).catch(() => ({ error: OFFLINE }));
    if (res.error) setError(res.error);
    else onSaved();
  }

  const others = board.stages.filter((s) => s.id !== stageId && board.messages.some((m) => m.stageId === s.id));
  const current = board.messages.filter((m) => m.stageId === stageId);
  const [othersOpen, setOthersOpen] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  // the details fold away, opening by themselves only when this stage's
  // messages still have blanks to fill
  const blanks = names.filter((n) => !vars[n]);
  const nowBlank = variablesIn(board.messages.filter((m) => m.stageId === stageId).flatMap((m) => [fillText(m.subject, vars), fillText(m.body, vars)]));
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);
  const showDetails = detailsOpen ?? nowBlank.length > 0;
  const here = board.stages.findIndex((s) => s.id === stageId);

  return (
    <div className="flex flex-col gap-4">
      {/* the words that change per lead: typed once, every message uses them */}
      {names.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-white/[0.02]">
          <button type="button" onClick={() => setDetailsOpen(!showDetails)} aria-expanded={showDetails} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs">
            <ChevronRight size={14} className={`shrink-0 text-muted transition-transform duration-200 ${showDetails ? "rotate-90" : ""}`} />
            <span className="font-medium text-foreground/90">Message details</span>
            <span className={`ml-auto ${blanks.length ? "text-red-300" : "text-muted"}`}>{blanks.length ? `${blanks.length} to fill` : "All filled"}</span>
          </button>
          <Reveal open={showDetails}>
          <p className="mb-2.5 px-4 text-xs text-muted">Type each once; every message uses it.</p>
          <div className="grid gap-x-3 gap-y-2 px-3 pb-3 sm:grid-cols-2">
            {names.map((name) => (
              <label key={name} className="flex min-w-0 flex-col gap-1">
                <span className="px-1 text-[11px] font-medium text-muted">{name}</span>
                <input
                  defaultValue={lead.vars[name] ?? ""}
                  onBlur={(e) => saveVar(name, e.target.value)}
                  placeholder={auto[name] ? `${auto[name]} (filled in for you)` : `Type the ${name.toLowerCase()}`}
                  className="w-full rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-hover"
                />
              </label>
            ))}
          </div>
          </Reveal>
        </div>
      )}

      {error && (
        <p role="alert" className="fade-in px-1 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* today's: this stage's messages, in full */}
      {here >= 0 && (
        <div className="flex flex-col gap-3">
          {current.length ? (
            current.map((m) => <MessageCard key={m.id} message={m} leadId={lead.id} vars={vars} names={names} sent={sent?.find((x) => x.messageId === m.id) ?? null} onSent={(x) => onSent(x)} all={sent} onSaved={onSaved} onError={setError} />)
          ) : (
            <p className="px-1 text-xs text-muted">Nothing to send at this stage.</p>
          )}
          <AddMessage stageId={stageId} onAdded={() => router.refresh()} />
        </div>
      )}

      {/* every other stage's messages, folded into one row */}
      {others.length > 0 && (
        <div className="rounded-xl border border-border/60">
          <button type="button" onClick={() => setOthersOpen(!othersOpen)} aria-expanded={othersOpen} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs">
            <ChevronRight size={14} className={`shrink-0 text-muted transition-transform duration-200 ${othersOpen ? "rotate-90" : ""}`} />
            <span className="font-medium text-foreground/90">Other stages</span>
            <span className="ml-auto text-muted">{others.reduce((n, st) => n + board.messages.filter((m) => m.stageId === st.id).length, 0)} messages</span>
          </button>
          <Reveal open={othersOpen}>
            <div className="flex flex-col gap-1 px-2 pb-2">
              {others.map((stage) => {
                const list = board.messages.filter((m) => m.stageId === stage.id);
                const isOpen = !!toggled[stage.id];
                const doneHere = list.filter((m) => sent?.some((x) => x.messageId === m.id)).length;
                return (
                  <div key={stage.id}>
                    <button type="button" onClick={() => setToggled((o) => ({ ...o, [stage.id]: !isOpen }))} aria-expanded={isOpen} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.03]">
                      <ChevronRight size={13} className={`shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                      <StagePill name={stage.name} color={stage.color} />
                      <span className="ml-auto text-[11px] text-muted tabular-nums">{doneHere ? `${doneHere} of ${list.length} sent` : `${list.length}`}</span>
                    </button>
                    <Reveal open={isOpen}>
                      <div className="flex flex-col gap-2 py-2 pl-6">
                        {list.map((m) => (
                          <MessageCard key={m.id} message={m} leadId={lead.id} vars={vars} names={names} sent={sent?.find((x) => x.messageId === m.id) ?? null} onSent={(x) => onSent(x)} all={sent} onSaved={onSaved} onError={setError} />
                        ))}
                      </div>
                    </Reveal>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      )}

      {/* everything this lead has been sent, newest first */}
      {sent && sent.length > 0 && (
        <div className="rounded-xl border border-border/60">
          <button type="button" onClick={() => setSentOpen(!sentOpen)} aria-expanded={sentOpen} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs">
            <ChevronRight size={14} className={`shrink-0 text-muted transition-transform duration-200 ${sentOpen ? "rotate-90" : ""}`} />
            <span className="font-medium text-foreground/90">Sent so far</span>
            <span className="ml-auto text-muted">{sent.length}</span>
          </button>
          <Reveal open={sentOpen}>
            <ul className="flex flex-col divide-y divide-border/40 px-2 pb-2">
              {sent.map((x) => (
                <SentRow key={x.id} sent={x} />
              ))}
            </ul>
          </Reveal>
        </div>
      )}
    </div>
  );
}

// One message: read, copy, mark sent; or edit the stage's wording
function MessageCard({
  message,
  leadId,
  vars,
  names,
  sent,
  all,
  onSent,
  onSaved,
  onError,
}: {
  message: MessageData;
  leadId: string;
  vars: Record<string, string>;
  names: string[];
  sent: SentData | null;
  all: SentData[] | null;
  onSent: (sent: SentData[]) => void;
  onSaved: () => void;
  onError: (e: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const subject = sent ? sent.subject : fillText(message.subject, vars);
  const body = sent ? sent.body : fillText(message.body, vars);
  const missing = sent ? [] : variablesIn([subject, body]);

  async function copy() {
    await navigator.clipboard.writeText(subject ? `Subject: ${subject}\n\n${body}` : body);
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
      const res = await markSent(leadId, message.id).catch(() => ({ error: OFFLINE, sent: undefined }));
      setBusy(false);
      if (res.error || !res.sent) return onError(res.error ?? OFFLINE);
      onSent([res.sent, ...(all ?? [])]);
    }
    onSaved();
  }

  if (editing) return <MessageEditor message={message} names={names} leadId={leadId} onDone={() => setEditing(false)} />;

  return (
    <div className={`fade-in rounded-xl border p-3.5 ${sent ? "border-emerald-400/20 bg-emerald-400/[0.03]" : "border-border/60 bg-white/[0.02]"}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-muted">{CHANNEL_ICON[message.channel] ?? CHANNEL_ICON.other}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{message.name}</span>
        {sent && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
            <Check size={11} /> Sent
          </span>
        )}
        {!sent && (
          <>
            <button type="button" onClick={() => setEditing(true)} className={SMALL_BTN} title="Edit this stage's wording">
              <Pencil size={12} /> Edit
            </button>
            <button type="button" onClick={() => setDeleting(true)} aria-label={`Delete ${message.name}`} title="Delete" className={`${SMALL_BTN} hover:text-red-300`}>
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {sent ? (
        <SentText subject={subject} body={body} />
      ) : (
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          {message.subject && (
            <p className="mb-2 text-foreground">
              <span className="text-muted">Subject: </span>
              <Filled text={message.subject} vars={vars} />
            </p>
          )}
          <Filled text={message.body} vars={vars} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5">
        <button type="button" onClick={copy} className={SMALL_BTN}>
          {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={toggleSent}
          disabled={busy || (!sent && missing.length > 0)}
          title={missing.length ? `Fill in ${missing.join(", ")} first` : undefined}
          className={`${SMALL_BTN} ${sent ? "" : "text-accent hover:text-accent"}`}
        >
          {sent ? <Undo2 size={12} /> : <Send size={12} />} {busy ? "Saving…" : sent ? "Mark as not sent" : "Mark as sent"}
        </button>
        <span className="ml-auto text-[11px] text-muted">
          {sent ? `Sent by ${sent.byName} · ${formatDateTime(sent.sentAt)}` : missing.length ? <span className="text-red-300">Fill in {missing.join(", ")} first</span> : null}
        </span>
      </div>

      <ReasonDialog
        open={deleting}
        danger
        title={`Delete ${message.name}?`}
        hint="It comes off this stage for every lead. Messages already sent stay on their leads."
        confirm="Delete message"
        onCancel={() => setDeleting(false)}
        onConfirm={async (reason) => {
          const res = await deleteMessage(message.id, reason).catch(() => ({ error: OFFLINE }));
          if (res.error) return res.error;
          setDeleting(false);
          router.refresh();
        }}
      />
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
          <span key={i} title="Fill this in under Message details" className="rounded bg-red-400/10 px-0.5 text-red-300">
            {`{{${p.name}}}`}
          </span>
        ),
      )}
    </>
  );
}

function SentText({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
      {subject && (
        <p className="mb-2">
          <span className="text-muted">Subject: </span>
          {subject}
        </p>
      )}
      {body}
    </div>
  );
}

function SentRow({ sent }: { sent: SentData }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.03]">
        <ChevronRight size={13} className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        <span className="text-muted">{CHANNEL_ICON[sent.channel] ?? CHANNEL_ICON.other}</span>
        <span className="min-w-0 truncate font-medium text-foreground/90">{sent.name}</span>
        <span className="shrink-0 text-muted">· {sent.stageName}</span>
        <span className="ml-auto shrink-0 text-muted">
          {sent.byName}, {formatDateTime(sent.sentAt)}
        </span>
      </button>
      <Reveal open={open}>
        <div className="px-7 pt-1 pb-2">
          <SentText subject={sent.subject} body={sent.body} />
        </div>
      </Reveal>
    </li>
  );
}

// Editing a stage's wording. Select words and press "Make a variable" to
// turn them into one ({{Guest}}); every lead fills it in on its own.
function MessageEditor({ message, names, leadId, onDone }: { message: MessageData; names: string[]; leadId: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(message.name);
  const [channel, setChannel] = useState(message.channel);
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ field: "subject" | "body"; from: number; to: number; words: string; name: string } | null>(null);
  const last = useRef<"subject" | "body">("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const fieldOf = (f: "subject" | "body") => (f === "subject" ? subjectRef.current : bodyRef.current);
  const setOf = (f: "subject" | "body") => (f === "subject" ? setSubject : setBody);
  const valueOf = (f: "subject" | "body") => (f === "subject" ? subject : body);

  // the selected words become {{Name}}, and this lead keeps them as its value
  function startVariable() {
    const f = last.current;
    const el = fieldOf(f);
    if (!el) return;
    const from = el.selectionStart ?? 0;
    const to = el.selectionEnd ?? 0;
    const words = valueOf(f).slice(from, to).trim();
    if (!words) return setError("Select the words that change from lead to lead, then press Make a variable.");
    setError(null);
    const guess = words.split(/\s+/).length <= 2 && words.length <= 24 ? words.replace(/^\w/, (c) => c.toUpperCase()) : "";
    setNaming({ field: f, from, to, words, name: guess });
  }
  function finishVariable() {
    if (!naming) return;
    const n = naming.name.trim().replace(/[{}]/g, "");
    if (!n) return;
    const text = valueOf(naming.field);
    setOf(naming.field)(`${text.slice(0, naming.from)}{{${n}}}${text.slice(naming.to)}`);
    // the words picked were this lead's value: keep them for it
    if (!names.includes(n)) setLeadVar(leadId, n, naming.words).catch(() => undefined);
    setNaming(null);
  }
  function insert(n: string) {
    const f = last.current;
    const el = fieldOf(f);
    const text = valueOf(f);
    const at = el?.selectionStart ?? text.length;
    setOf(f)(`${text.slice(0, at)}{{${n}}}${text.slice(el?.selectionEnd ?? at)}`);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateMessage(message.id, { name, channel, subject, body }).catch(() => ({ error: OFFLINE }));
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onDone();
  }

  const used = variablesIn([subject, body, ...names.map((n) => `{{${n}}}`)]);
  const input = "w-full rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-hover";

  return (
    <div className="fade-in flex flex-col gap-2.5 rounded-xl border border-accent/30 bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Message name" className={`${input} max-w-60 font-medium`} />
        <div className="flex gap-1">
          {MESSAGE_CHANNELS.map((c) => (
            <button key={c.kind} type="button" aria-pressed={channel === c.kind} onClick={() => setChannel(c.kind)} className="chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]">
              {CHANNEL_ICON[c.kind]} {c.label}
            </button>
          ))}
        </div>
      </div>
      {channel === "email" && <input ref={subjectRef} value={subject} onFocus={() => (last.current = "subject")} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className={input} />}
      <textarea
        ref={bodyRef}
        value={body}
        onFocus={() => (last.current = "body")}
        onChange={(e) => setBody(e.target.value)}
        aria-label="Message"
        className={`${input} field-sizing-content min-h-40 resize-none leading-relaxed`}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={startVariable} className="btn btn-xs btn-glow flex items-center gap-1.5 px-2.5">
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
              Turn <span className="text-foreground">“{naming.words.length > 40 ? `${naming.words.slice(0, 40)}…` : naming.words}”</span> into a variable called
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
              Make it
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
      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
        <p className="text-[11px] text-muted">Saving changes this message for every lead that hasn&apos;t sent it yet.</p>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" onClick={onDone} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-sm btn-glow">
            {busy ? "Saving…" : "Save for all leads"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A new message on a stage
function AddMessage({ stageId, onAdded }: { stageId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const res = await createMessage(stageId, name, channel).catch(() => ({ error: OFFLINE }));
    setBusy(false);
    if (res.error) return setError(res.error);
    setName("");
    setOpen(false);
    onAdded();
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${SMALL_BTN} self-start`}>
        <Plus size={13} /> Add a message
      </button>
    );
  return (
    <div className="fade-in flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Message name, like Email 2"
        className="w-52 rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-1.5 text-sm outline-none focus:border-hover"
      />
      {MESSAGE_CHANNELS.map((c) => (
        <button key={c.kind} type="button" aria-pressed={channel === c.kind} onClick={() => setChannel(c.kind)} className="chip flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]">
          {CHANNEL_ICON[c.kind]} {c.label}
        </button>
      ))}
      <button type="button" onClick={add} disabled={busy || !name.trim()} className="btn btn-xs btn-glow px-2.5 disabled:opacity-50">
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn btn-xs btn-ghost px-2">
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-300">{error}</p>}
    </div>
  );
}
