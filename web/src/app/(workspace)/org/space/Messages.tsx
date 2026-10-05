"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Braces, Check, ChevronDown, ChevronRight, Copy, LayoutTemplate, Library, Mail, MailOpen, MessageSquare, MessagesSquare, Pencil, Plus, Reply, RotateCcw, Search, Trash2, X } from "lucide-react";
import { dayOf, fillParts, fillText, leadVars, LINKEDIN_LIMIT, MESSAGE_CHANNELS, messageGroups, messagePhases, optionLabel, toneOf, variablesIn, type BoardData, type Draft, type LeadData, type MessageData, type Phase, type Reply as ReplyRecord, type SentData, type StageData } from "@/lib/space";
import { createMessage, deleteMessage, pickMessage, setLeadDraft, setLeadVar, updateMessage } from "./actions";
import { ReasonDialog } from "./ReasonDialog";
import { Reveal } from "../../Reveal";
import { Dropdown } from "../../Dropdown";
import { InstagramIcon, LinkedinIcon } from "../../PlatformIcon";
import { formatDateTime } from "../../TaskCard";
import { closeOnBackdrop } from "../../dialog";

const OFFLINE = "That couldn't be saved. Check your connection and try again.";
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  email: <Mail size={13} className="text-sky-400" />,
  instagram: <InstagramIcon size={13} className="text-pink-400" />,
  linkedin: <LinkedinIcon size={13} className="text-blue-400" />,
  other: <MessageSquare size={13} className="text-violet-400" />,
};
const SMALL_BTN = "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground disabled:opacity-50";
const INPUT = "w-full rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-hover";
const BLOCK = "rounded-xl bg-foreground/[0.03]";

const Dot = ({ color }: { color: string }) => <span className={`size-2 shrink-0 rounded-full ${toneOf(color).dot}`} />;

// A lead's messages as a timeline, day by day, the way its history reads.
// Reaching out starts at Ready to reach out: there every day of the
// sequence shows (Day 1 open, the rest folded), so the whole run can be read
// ahead. On a day, only that day and the next show, both open: what to send
// now, and what comes after. Outside the sequence (the replies, the audit)
// a stage shows its own. Before Ready to reach out there is nothing to send.
// The words that change per lead are filled once, in one place above, and
// appear in every message that uses them. On a message: copy it, mark it
// sent, or change it:
// - Edit (the pencil): this lead's copy only; the template stays as it is.
// - Template: that message's template, for every lead that hasn't sent it
//   (a lead with its own copy keeps it). Variables are made here.
// Every other message is in All messages, grouped and searchable.
export function Messages({ lead, board, stageId, sent, onReply, onSaved }: { lead: LeadData; board: BoardData; stageId: string; sent: SentData[] | null; onReply: (replies: ReplyRecord[]) => void; onSaved: () => void }) {
  // what's typed above shows in every message at once, ahead of the save
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<Record<string, Draft | null>>({});
  const vars = leadVars({ ...lead, vars: { ...lead.vars, ...typed } }, board.fields);
  const auto = leadVars({ ...lead, vars: {} }, board.fields);
  const names = variablesIn(board.messages.flatMap((m) => [m.subject, m.body]));
  const own = (id: string) => (id in mine ? (mine[id] ?? undefined) : lead.drafts?.[id]);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  // the days done that are opened, to read back
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const toggleDay = (key: string) => setOpenDays((o) => (o.delete(key) ? new Set(o) : new Set(o).add(key)));
  // a day's message picked here, ahead of the save
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const pickOf = (key: string) => (key in picked ? picked[key] : (lead.picks?.[key] ?? null));
  async function pick(key: string, messageId: string) {
    const before = pickOf(key);
    setError(null);
    setPicked((p) => ({ ...p, [key]: messageId }));
    const res = await pickMessage(lead.id, key, messageId).catch(() => ({ error: OFFLINE }));
    if (res.error) {
      setPicked((p) => ({ ...p, [key]: before }));
      return setError(res.error);
    }
    onSaved();
  }
  // a reply, ticked under the day it came on
  const repliedOn = (key: string) => lead.replies.some((r) => r.key === key);
  const toggleReply = (key: string) => onReply(repliedOn(key) ? lead.replies.filter((r) => r.key !== key) : [...lead.replies, { key, at: new Date().toISOString() }]);
  const today = dayOf(board.stages.find((s) => s.id === stageId)?.name ?? "");

  async function saveVar(name: string, value: string) {
    if ((lead.vars[name] ?? "") === value.trim()) return;
    setTyped((t) => ({ ...t, [name]: value.trim() }));
    const res = await setLeadVar(lead.id, name, value).catch(() => ({ error: OFFLINE }));
    if (res.error) setError(res.error);
    else onSaved();
  }
  async function saveMine(messageId: string, draft: Draft | null) {
    setError(null);
    const res = await setLeadDraft(lead.id, messageId, draft).catch(() => ({ error: OFFLINE }));
    if (res.error) return res.error;
    setMine((d) => ({ ...d, [messageId]: draft }));
    onSaved();
  }

  const phases = messagePhases(board, stageId);
  // the days already done, folded until opened; the rest (today, next) open
  const done = phases.filter((p) => p.when === "done");
  const ahead = phases.filter((p) => p.when !== "done");
  const shown = ahead.flatMap((p) => p.messages);
  // sent from a template since deleted: nowhere else to show them
  const orphans = (sent ?? []).filter((x) => !board.messages.some((m) => m.id === x.messageId));
  // the variables the shown messages use, and which are still blank
  const used = variablesIn(shown.flatMap((m) => [own(m.id)?.subject ?? m.subject, own(m.id)?.body ?? m.body]));
  const blanks = used.filter((n) => !vars[n]);
  const sentIds = new Set((sent ?? []).map((x) => x.messageId ?? ""));

  const card = (m: MessageData, folded = false) => (
    <MessageCard
      key={m.id}
      folded={folded}
      message={m}
      stages={board.stages}
      leadId={lead.id}
      vars={vars}
      names={names}
      own={own(m.id)}
      sent={sent?.find((x) => x.messageId === m.id) ?? null}
      onMine={(d) => saveMine(m.id, d)}
    />
  );

  // one day on the timeline: its node, the line down to the next shown day,
  // its message (or the options to pick from) and its reply
  const step = (p: Phase, below: Phase | undefined, last: boolean) => {
    const options = p.messages;
    const chosenId = options.length > 1 ? pickOf(p.key) : options[0].id;
    const chosen = options.find((m) => m.id === chosenId) ?? null;
    const replied = repliedOn(p.key);
    const canReply = p.day != null && today != null && p.day <= today;
    const folded = p.when === "done" && !openDays.has(p.key);
    // the first email's opens, on Day 1 once it's done
    const opened = p.when === "done" && p.day === 1 && lead.opens > 0 && (
      <span className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-muted">
        <MailOpen size={11} /> Opened {lead.opens}×
      </span>
    );
    const content = (
      <>
        {options.length > 1 &&
          (options.length <= 4 ? (
            <div className="flex flex-wrap gap-1.5">
              {options.map((m) => (
                <button key={m.id} type="button" aria-pressed={chosen?.id === m.id} onClick={() => chosen?.id !== m.id && pick(p.key, m.id)} className="chip flex items-center gap-1.5 rounded-full px-3 py-1 text-xs">
                  <span className="flex shrink-0">{CHANNEL_ICON[m.channel] ?? CHANNEL_ICON.other}</span>
                  {optionLabel(options, m)}
                </button>
              ))}
            </div>
          ) : (
            <Dropdown size="sm" value={chosen?.id ?? ""} placeholder="Pick a message" options={options.map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => v && pick(p.key, v)} />
          ))}
        {chosen && card(chosen, p.when === "done" || (options.length === 1 && !p.when))}
        {canReply && (
          <button type="button" aria-pressed={replied} onClick={() => toggleReply(p.key)} title={replied ? `Replied on ${p.title}. Tap to undo.` : `They replied on ${p.title}, anywhere`} className="chip flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs">
            <Reply size={12} /> Replied
          </button>
        )}
      </>
    );
    return (
      <div className={`relative flex gap-3 ${last ? "" : p.when === "done" ? "pb-2" : "pb-5"}`}>
        {/* the line down: quiet through the days done, easing into today
            (green), then glowing from today to the next (blue) */}
        {below &&
          (p.when === "now" && below.when === "next" ? (
            <span className="progress-line absolute top-7 bottom-1 left-[11.25px] w-[1.5px] rounded-full" />
          ) : p.when === "done" && below.when === "now" ? (
            <span className="absolute top-7 bottom-1 left-[11px] w-px bg-linear-to-b from-white/15 to-emerald-400/50" />
          ) : (
            <span className={`absolute top-7 bottom-1 left-[11px] w-px ${p.when === "done" ? "bg-white/15" : "bg-white/10"}`} />
          ))}
        <span
          className={`relative flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
            p.when === "now" ? "step-now" : replied ? "bg-emerald-400/15 text-emerald-300" : p.when === "next" ? "step-next bg-accent/15 text-accent" : "bg-white/[0.06] text-muted"
          }`}
        >
          {replied ? <Reply size={12} /> : (p.day ?? <MessagesSquare size={12} />)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {p.when === "done" ? (
            // a day done: one line (opens, reply) that opens to what was sent
            <button type="button" onClick={() => toggleDay(p.key)} aria-expanded={!folded} className="group/day flex flex-wrap items-center gap-2 pt-0.5 text-left text-xs">
              <span className="font-medium text-foreground/80 transition-colors group-hover/day:text-foreground">{p.title}</span>
              {opened}
              {replied && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-300">
                  <Reply size={11} /> Replied
                </span>
              )}
              <ChevronDown size={13} className={`ml-auto shrink-0 text-muted transition-transform duration-300 ${folded ? "" : "rotate-180"}`} />
            </button>
          ) : (
            <p className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
              <span className="font-medium text-foreground/90">{p.title}</span>
              {p.when && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${p.when === "now" ? "bg-emerald-400/10 text-emerald-300" : "bg-accent/10 text-accent"}`}>{p.when === "now" ? "Today" : "Next"}</span>
              )}
            </p>
          )}
          {p.when === "done" ? (
            // room around the chips, so their glow isn't clipped by the fold
            <div className="-mx-2">
              <Reveal open={!folded}>
                <div className="flex flex-col gap-2 px-2 pt-2 pb-3">{content}</div>
              </Reveal>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2">{content}</div>
          )}
        </div>
      </div>
    );
  };
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <MessagesSquare size={14} className="shrink-0 text-muted" />
        <h3 className="text-xs font-medium text-muted">Messages</h3>
        <button type="button" onClick={() => setLibrary(true)} className={`${SMALL_BTN} ml-auto shrink-0`}>
          <Library size={13} /> All messages <span className="tabular-nums text-muted/70">{board.messages.length}</span>
        </button>
      </div>

      {error && (
        <p role="alert" className="fade-in px-1 text-xs text-red-300">
          {error}
        </p>
      )}

      {/* the words that change per lead: typed once, in every message that uses them */}
      {used.length > 0 && (
        <div className={`${BLOCK} p-3`}>
          <div className="mb-2 flex items-center gap-2 px-1 text-xs">
            <Braces size={13} className="shrink-0 text-muted" />
            <span className="font-medium text-foreground/90">Fill in once</span>
            <span className={`ml-auto ${blanks.length ? "text-red-300" : "text-muted"}`}>{blanks.length ? `${blanks.length} to fill` : "All filled"}</span>
          </div>
          <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
            {used.map((name) => (
              <label key={name} className="flex min-w-0 flex-col gap-1">
                <span className="px-1 text-[11px] font-medium text-muted">{name}</span>
                <input
                  value={typed[name] ?? lead.vars[name] ?? ""}
                  onChange={(e) => setTyped((t) => ({ ...t, [name]: e.target.value }))}
                  onBlur={(e) => saveVar(name, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  placeholder={auto[name] ? `${auto[name]} (filled in for you)` : `Type the ${name.toLowerCase()}`}
                  className={INPUT}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* day by day, as the history reads: each day already done folded
          to one line (opens and replies at a glance) that opens to what
          was sent, then today and the next. A day with more than one message offers them first, and the
          one picked opens (kept for the lead); a day it has reached takes
          its reply */}
      {phases.length > 0 && (
        // inset a little, so the nodes' glow has room inside the window's scroll box
        <ol className="flex flex-col pl-1.5">
          {done.map((p, i) => (
            <li key={p.key}>{step(p, done[i + 1] ?? ahead[0], false)}</li>
          ))}
          {ahead.map((p, i) => (
            <li key={p.key}>{step(p, ahead[i + 1], i === ahead.length - 1)}</li>
          ))}
        </ol>
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

      <MessageLibrary open={library} onClose={() => setLibrary(false)} board={board} sentIds={sentIds} highlight={shown.map((m) => m.id)} render={(m) => card(m)} />
    </section>
  );
}

// Every message on a board, grouped by day of the sequence and then by
// stage, in a list down the left; the one picked opens on the right, to read,
// copy or edit. New writes another message onto any stage. Search looks through names, notes and words.
export function MessageLibrary({
  open,
  onClose,
  board,
  render,
  sentIds,
  highlight = [],
}: {
  open: boolean;
  onClose: () => void;
  board: BoardData;
  render: (m: MessageData) => React.ReactNode;
  sentIds?: Set<string>;
  highlight?: string[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const needle = q.trim().toLowerCase();
  const groups = messageGroups(board)
    .map((g) => ({ ...g, items: g.items.filter((m) => !needle || `${m.name}\n${m.note}\n${m.subject}\n${m.body}`.toLowerCase().includes(needle)) }))
    .filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);
  const shown = all.find((m) => m.id === picked) ?? all.find((m) => highlight.includes(m.id)) ?? all[0];
  // the group's own name already says the day ("Day 1"), so the rows don't repeat it
  const label = (m: MessageData) => m.name.replace(/^day \d+\s*·\s*/i, "");

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      onClose={(e) => e.target === e.currentTarget && open && onClose()}
      className="glass fixed top-1/2 left-1/2 m-0 h-[min(44rem,88vh)] w-[min(62rem,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-0 text-foreground"
    >
      <div className="flex h-full min-h-0">
        <aside className="flex w-[17rem] shrink-0 flex-col border-r border-border/60 bg-black/10">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <Library size={14} className="text-muted" />
            <p className="text-sm font-medium">All messages</p>
            <span className="text-xs text-muted tabular-nums">{board.messages.length}</span>
            <button type="button" onClick={() => setCreating(true)} aria-pressed={creating} className="btn btn-xs btn-glow ml-auto flex items-center gap-1 px-2">
              <Plus size={12} /> New
            </button>
          </div>
          <label className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-border/60 bg-white/[0.02] px-2.5 py-1.5 focus-within:border-hover">
            <Search size={13} className="shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a message"
              aria-label="Find a message"
              className="w-full bg-transparent text-sm text-foreground outline-none! placeholder:text-muted/60"
            />
          </label>
          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {groups.map((g) => (
              <div key={g.key} className="pt-2">
                <p className="px-2 pb-1 text-[11px] font-medium text-muted">{g.title}</p>
                {g.items.map((m) => {
                  const on = !creating && shown?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setPicked(m.id);
                        setCreating(false);
                      }}
                      aria-current={on}
                      title={m.name}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${on ? "bg-white/[0.08] text-foreground" : "text-foreground/75 hover:bg-white/[0.04] hover:text-foreground"}`}
                    >
                      <span className="flex shrink-0">{CHANNEL_ICON[m.channel] ?? CHANNEL_ICON.other}</span>
                      <span className="min-w-0 flex-1 truncate">{label(m) || m.name}</span>
                      {sentIds?.has(m.id) && <Check size={12} className="shrink-0 text-emerald-300" aria-label="Sent" />}
                      {!sentIds?.has(m.id) && highlight.includes(m.id) && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Today's" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {!groups.length && <p className="px-2 pt-3 text-xs text-muted">No message has those words.</p>}
          </nav>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-end px-3 pt-3">
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {/* a new message, onto the stage of the one being read */}
            {creating ? (
              <TemplateEditor
                stages={board.stages}
                stageId={shown?.stageId ?? board.stages.find((st) => dayOf(st.name) != null)?.id}
                names={variablesIn(board.messages.flatMap((m) => [m.subject, m.body]))}
                onDone={(made) => {
                  setCreating(false);
                  if (made) setPicked(made);
                }}
              />
            ) : shown ? (
              render(shown)
            ) : null}
          </div>
        </section>
      </div>
    </dialog>
  );
}

// One message for this lead: read it, fill what's missing, copy it, mark it
// sent; or change this lead's copy, or the template behind it
// LinkedIn's limit, counted as you go: grey under it, rose over it
function Limit({ channel, text, className = "" }: { channel: string; text: string; className?: string }) {
  if (channel !== "linkedin") return null;
  const over = text.length > LINKEDIN_LIMIT;
  return (
    <span className={`text-[11px] tabular-nums ${over ? "text-rose-300" : "text-muted"} ${className}`}>
      {text.length}/{LINKEDIN_LIMIT}
      {over && " · LinkedIn allows 300 characters"}
    </span>
  );
}

function MessageCard({
  message,
  stages,
  leadId,
  vars,
  names,
  own,
  sent,
  onMine,
  folded = false,
}: {
  message: MessageData;
  stages: StageData[];
  leadId: string;
  vars: Record<string, string>;
  names: string[];
  own: Draft | undefined;
  sent: SentData | null;
  onMine: (draft: Draft | null) => Promise<string | undefined>;
  folded?: boolean;
}) {
  const [mode, setMode] = useState<"view" | "mine" | "template">("view");
  const [open, setOpen] = useState(!folded);
  const [copied, setCopied] = useState(false);
  const source = own ?? message;
  const subject = sent ? sent.subject : fillText(source.subject, vars);
  const body = sent ? sent.body : fillText(source.body, vars);
  const isEmail = message.channel === "email";

  async function copy() {
    await navigator.clipboard.writeText(isEmail && subject ? `Subject: ${subject}\n\n${body}` : body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  if (mode === "template") return <TemplateEditor message={message} stages={stages} names={names} leadId={leadId} onDone={() => setMode("view")} />;
  if (mode === "mine") return <OwnEditor message={message} subject={fillText(source.subject, vars)} body={fillText(source.body, vars)} hasOwn={!!own} onDone={() => setMode("view")} onSave={onMine} />;

  const ACTION = "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";

  return (
    <div className={`fade-in rounded-xl p-4 ${sent ? "bg-emerald-400/[0.04] ring-1 ring-emerald-400/20" : BLOCK}`}>
      {/* the message's name; copy and edit right beside it */}
      <div className="flex items-center gap-2">
        {folded && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Fold ${message.name}` : `Open ${message.name}`} className="-ml-1 flex shrink-0 text-muted hover:text-foreground">
            <ChevronRight size={14} className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          </button>
        )}
        <span className="flex shrink-0">{CHANNEL_ICON[message.channel] ?? CHANNEL_ICON.other}</span>
        {folded ? (
          <button type="button" onClick={() => setOpen(!open)} className="min-w-0 truncate text-left text-sm font-medium hover:text-foreground">
            {message.name}
          </button>
        ) : (
          <span className="min-w-0 truncate text-sm font-medium">{message.name}</span>
        )}
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
      {/* the board's rule for when to send it */}
      {message.note && <p className={`mt-1.5 text-xs leading-relaxed text-muted ${folded ? "pl-[1.625rem]" : ""}`}>{message.note}</p>}

      {open && (
        <>
          <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {isEmail && (sent ? subject : source.subject) && (
              <p className="mb-2 text-foreground">
                <span className="text-muted">Subject: </span>
                {sent ? subject : <Filled text={source.subject} vars={vars} />}
              </p>
            )}
            {sent ? body : <Filled text={source.body} vars={vars} />}
          </div>

          {/* LinkedIn's limit, counted as it reads */}
          {message.channel === "linkedin" && !sent && (
            <div className="mt-3 flex border-t border-border/40 pt-3">
              <Limit channel={message.channel} text={body} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// A message's text with its variables lit: filled ones in blue, missing
// ones in red, so what still needs typing stands out (in a bare template,
// where nothing is filled yet, every variable is simply blue)
function Filled({ text, vars, template = false }: { text: string; vars: Record<string, string>; template?: boolean }) {
  return (
    <>
      {fillParts(text, vars).map((p, i) =>
        "text" in p ? (
          <span key={i}>{p.text}</span>
        ) : p.value || template ? (
          <span key={i} title={p.name} className="rounded bg-accent/15 px-0.5 text-[color-mix(in_srgb,var(--accent)_55%,white)]">
            {p.value || `{{${p.name}}}`}
          </span>
        ) : (
          <span key={i} title="Fill this in above" className="rounded bg-red-400/10 px-0.5 text-red-300">
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
      <Limit channel={message.channel} text={body} className="self-end" />
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

// Writing a template, new or existing. A new one goes on whichever stage is
// picked (any day, or a stage made later). Select words and press "Make a
// variable" to turn them into one ({{Guest}}), or press it with nothing
// selected to add a new one where the cursor is; every lead fills its own in.
function TemplateEditor({
  message,
  stageId: startStage,
  stages,
  names,
  leadId,
  onDone,
}: {
  message?: MessageData;
  stageId?: string;
  stages: StageData[];
  names: string[];
  leadId?: string;
  onDone: (madeId?: string) => void;
}) {
  const router = useRouter();
  const [stageId, setStageId] = useState(message?.stageId ?? startStage ?? stages[0]?.id ?? "");
  const [name, setName] = useState(message?.name ?? "");
  const [channel, setChannel] = useState(message?.channel ?? "email");
  const [subject, setSubject] = useState(message?.subject ?? "");
  const [body, setBody] = useState(message?.body ?? "");
  const [note, setNote] = useState(message?.note ?? "");
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
  const stage = stages.find((s) => s.id === stageId);

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
    if (leadId && naming.words && !names.includes(n)) setLeadVar(leadId, n, naming.words).catch(() => undefined);
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
    const res: { error?: string; message?: MessageData } = await (message ? updateMessage(message.id, { name, channel, subject, body, note }) : createMessage(stageId, name, channel, subject, body, note)).catch(() => ({
      error: OFFLINE,
    }));
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onDone(res.message?.id);
  }

  const used = variablesIn([subject, body, ...names.map((n) => `{{${n}}}`)]);

  return (
    <div className={`fade-in flex flex-col gap-2.5 p-4 ring-1 ring-accent/30 ${BLOCK}`}>
      <div className="flex items-center gap-2">
        <LayoutTemplate size={13} className="shrink-0 text-accent" />
        <span className="text-sm font-medium">{message ? "Edit template" : "New message"}</span>
        <span className="ml-auto text-[11px] text-muted">{message ? "For every lead that hasn\u2019t sent it" : "For every lead in the stage you pick"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {message ? (
          stage && (
            <span className="flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.07] px-3 py-1.5 text-xs text-foreground">
              <Dot color={stage.color} /> {stage.name}
            </span>
          )
        ) : (
          <Dropdown pill={{ icon: stage ? <Dot color={stage.color} /> : null }} value={stageId} placeholder="Stage" options={stages.map((s) => ({ value: s.id, label: s.name }))} onChange={setStageId} />
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

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="When to send it, like: only if they accepted the connection" aria-label="When to send it" className={`${INPUT} text-xs`} />
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
      <Limit channel={channel} text={body} className="self-end" />

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
        {message ? (
          <button type="button" onClick={() => setDeleting(true)} className={`${SMALL_BTN} hover:text-red-300`}>
            <Trash2 size={12} /> Delete template
          </button>
        ) : (
          <p className="text-[11px] text-muted">Every lead in that stage gets it, with its own variables.</p>
        )}
        <div className="ml-auto flex shrink-0 gap-1.5">
          <button type="button" onClick={() => onDone()} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy || !body.trim()} className="btn btn-sm btn-glow">
            {busy ? "Saving…" : message ? "Save template" : "Add message"}
          </button>
        </div>
      </div>
      {message && <p className="text-[11px] text-muted">Leads that already sent it keep what went out, and a lead with its own copy keeps that copy.</p>}

      {message && (
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
      )}
    </div>
  );
}
