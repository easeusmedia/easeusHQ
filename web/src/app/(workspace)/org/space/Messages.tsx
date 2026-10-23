"use client";

import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Braces, Check, ChevronRight, Copy, LayoutTemplate, Library, Mail, MessageSquare, Pencil, Plus, Reply, RotateCcw, Search, Trash2, UserCheck, X } from "lucide-react";
import { chosenFor, dayOf, fillParts, fillText, readEdit, forContact, hasChannel, leadContacts, leadVars, LINKEDIN_LIMIT, MARKED, MESSAGE_CHANNELS, messageGroups, NO_CONTACT, draftKey, openerIndex, openerOf, optionLabel, shownDraftKey, PLATFORM_NAME, preparedFor, requestDay, sequenceTabs, toneOf, variablesIn, type BoardData, type Contact, type Draft, type LeadData, type Marked, type MarkChange, type Approval, type MessageData, type Prepared, type SentData, type SequenceTab, type StageData } from "@/lib/space";
import { approveMessage, createMessage, deleteMessage, pickMessage, pickOpener, renameStage, setLeadDraft, setLeadVar, updateMessage } from "./actions";
import { EditableName } from "../../EditableName";
import { ReasonDialog } from "./ReasonDialog";
import { EmailStatus } from "./LeadCard";
import { CanBuild } from "./values";
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
// the two sides of the lead window: its profile, and its messages
const PANEL = "panel-soft rounded-2xl";

const Dot = ({ color }: { color: string }) => <span className={`size-2 shrink-0 rounded-full ${toneOf(color).dot}`} />;

// A lead's messages, laid out as the Dream 300 sequence pages are (Abhishek,
// 17 Oct 2026): beside what's known about the lead (`aside`, on the left),
// the days of the sequence as steps along the top (done, today, next), and
// the picked day's messages below; on the days that change with the opener
// (the first emails written ahead), Main and its backups beside the day.
// Before Ready to reach out there's nothing to send, so only `aside` shows.
// Each message is the lead's own wording when it has one (rewritten for it,
// or written for it ahead: lib/space preparedFor), else the template. The
// words that change per lead are filled once, above the day, and appear in
// every message that uses them. A day's messages show one per platform; two
// on the same platform (Day 2: opened Email 1 or not) are picked between.
export function Messages({
  lead,
  board,
  stageId,
  sent,
  prepared,
  aside,
  person: picked_person,
  onMark,
  onSaved,
}: {
  lead: LeadData;
  board: BoardData;
  stageId: string;
  sent: SentData[] | null;
  // its own wording, once the lead's details have loaded
  prepared: Prepared | null;
  aside: React.ReactNode;
  // the person picked at the top of the window, when the lead has more than one
  person: Contact | null;
  onMark: (change: MarkChange) => void;
  onSaved: () => void;
}) {
  // what's typed above shows in every message at once, ahead of the save
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<Record<string, Draft | null>>({});
  const vars = leadVars({ ...lead, vars: { ...lead.vars, ...typed } }, board.fields);
  const auto = leadVars({ ...lead, vars: {} }, board.fields);
  const names = variablesIn(board.messages.flatMap((m) => [m.subject, m.body]));
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  // the people on the lead (none: the lead itself), one at a time
  const contacts = leadContacts(lead.values, board.fields);
  const people: (Contact | null)[] = contacts.length ? contacts : [null];
  const idOf = (c: Contact | null) => c?.id ?? NO_CONTACT;
  // whose messages: picked at the top of the window, for both its sides
  const person = people.find((c) => idOf(c) === idOf(picked_person)) ?? people[0];
  const firstName = (name: string) => name.trim().split(/\s+/)[0];
  const request = requestDay(board);
  // a day's message (or the opener) picked here, ahead of the save
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const pickOf = (key: string) => (key in picked ? picked[key] : (lead.picks?.[key] ?? null));
  const picks = { ...(lead.picks ?? {}), ...Object.fromEntries(Object.entries(picked).filter((e): e is [string, string] => !!e[1])) };
  // the lead's own wording with what's been saved here since it loaded (null: put back)
  const merged: Prepared | null = prepared ? { ...prepared, drafts: Object.fromEntries(Object.entries({ ...prepared.drafts, ...mine }).filter((e): e is [string, Draft] => !!e[1])) } : null;
  const own = (id: string): Draft | undefined => (merged ? preparedFor(merged, picks, id) : undefined);
  // approved as ready to send, by message and person, ahead of the save
  const [approved, setApproved] = useState<Record<string, Approval | null>>({});
  const approvalOf = (key: string) => (key in approved ? approved[key] : (lead.approvals?.[key] ?? null));
  async function approve(key: string, on: boolean) {
    const before = approvalOf(key);
    setError(null);
    setApproved((a) => ({ ...a, [key]: on ? { by: "You", at: new Date().toISOString() } : null }));
    const res = await approveMessage(lead.id, key, on).catch(() => ({ error: OFFLINE }));
    if (res.error) {
      setApproved((a) => ({ ...a, [key]: before }));
      return setError(res.error);
    }
    onSaved();
  }
  const canBuild = useContext(CanBuild);
  const router = useRouter();
  // rewritten here (not just written ahead): "This lead's copy"
  const rewritten = (id: string) => !!merged && shownDraftKey(merged, picks, id) !== null;
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
  async function pickOpenerAt(i: number) {
    const before = pickOf("opener");
    setError(null);
    setPicked((p) => ({ ...p, opener: String(i) }));
    const res = await pickOpener(lead.id, i).catch(() => ({ error: OFFLINE }));
    if (res.error) {
      setPicked((p) => ({ ...p, opener: before }));
      return setError(res.error);
    }
    onSaved();
  }
  // a reply that came on a day: by email (the sales inbox) or, marked, on
  // Instagram or LinkedIn by anyone on the lead
  const repliedOn = (key: string) => lead.email.replied?.day === key || people.some((c) => MARKED.some((p) => lead.marks[idOf(c)]?.[p]?.replied?.day === key));
  const stage = board.stages.find((s) => s.id === stageId);
  const today = dayOf(stage?.name ?? "");

  async function saveVar(name: string, value: string): Promise<string | undefined> {
    if ((lead.vars[name] ?? "") === value.trim()) return;
    setError(null);
    setTyped((t) => ({ ...t, [name]: value.trim() }));
    const res = await setLeadVar(lead.id, name, value).catch(() => ({ error: OFFLINE }));
    if (!res.error) {
      onSaved();
      return;
    }
    // not saved: the window goes back to the saved value
    setTyped((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== name)));
    setError(res.error);
    return res.error;
  }
  async function saveMine(messageId: string, draft: Draft | null) {
    setError(null);
    // a new edit goes under the opener in use (when it wrote this message); putting back takes off the one shown
    const key = !merged ? messageId : draft ? draftKey(merged, picks, messageId) : (shownDraftKey(merged, picks, messageId) ?? messageId);
    const res = await setLeadDraft(lead.id, key, draft).catch(() => ({ error: OFFLINE }));
    if (res.error) return res.error;
    setMine((d) => ({ ...d, [key]: draft }));
    onSaved();
  }

  // the tabs: every day of the sequence (from Ready to reach out on), and a
  // stage past it with messages of its own (Replied, Audit sent…)
  const tabs = sequenceTabs(board, stageId);
  const [tab, setTab] = useState<string | null>(() => tabs.find((t) => t.when === "now")?.key ?? tabs.find((t) => t.when === "next")?.key ?? tabs[0]?.key ?? null);
  // How much the day strip shows, measured so nothing is ever cut off: 0 every
  // day's name, 1 the others as numbered circles, 2 also without the lines,
  // 3 wrapping onto a second row. A new width, another day open or another
  // stage tab starts again from the fullest that fits.
  const strip = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const [stripWidth, setStripWidth] = useState(0);
  const hasTabs = tabs.length > 0;
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setStripWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasTabs]);
  const fitFor = `${stripWidth}:${tab}:${tabs.map((x) => x.key).join(",")}`;
  const [fittedFor, setFittedFor] = useState(fitFor);
  if (fitFor !== fittedFor) {
    setFittedFor(fitFor);
    setFit(0);
  }
  useLayoutEffect(() => {
    const el = strip.current;
    if (el && fit < 3 && el.scrollWidth > el.clientWidth + 1) setFit((f) => f + 1);
  }, [fit, fitFor]);
  const shownTab = tabs.find((t) => t.key === tab) ?? tabs.find((t) => t.when === "now") ?? tabs[0];
  // sent from a template since deleted: nowhere else to show them
  const orphans = (sent ?? []).filter((x) => !board.messages.some((m) => m.id === x.messageId));
  const sentIds = new Set((sent ?? []).map((x) => x.messageId ?? ""));
  // the variables the person's messages use (every day, so it's filled once), and which are still blank
  const allMessages = tabs.flatMap((t) => t.messages);
  const used = variablesIn(allMessages.flatMap((m) => [own(m.id)?.subject ?? m.subject, own(m.id)?.body ?? m.body]));
  const blanks = used.filter((n) => !vars[n]);
  const openers = prepared?.openers ?? [];
  // which meme board image goes with Day 6's email, from the lead's property
  const memeField = board.fields.find((f) => /^meme board$/i.test(f.name.trim()));
  const memeBoard = memeField ? memeField.options.find((o) => (lead.values[memeField.id] as string[] | undefined)?.includes(o.id))?.name : undefined;
  const chosenOn = (x: SequenceTab, c: Contact | null) => [...new Set(x.messages.map((m) => m.channel))].map((ch) => x.messages.filter((m) => m.channel === ch)).map((options) => chosenFor(options, picks, x.key, c, lead.email.opens > 0) ?? options[0]);
  // a day is done once every message the person can be reached by is approved
  // (a greyed one, on a platform they aren't on, doesn't count)
  const dayApproved = (x: SequenceTab) => {
    const sendable = chosenOn(x, person).filter((m) => hasChannel(person, m.channel));
    return sendable.length > 0 && sendable.every((m) => !!approvalOf(forContact(m.id, person)));
  };
  // the same opener the wording comes from (openerOf), so the lit one is the one shown
  const opener = prepared ? openerIndex(prepared, picks) : 0;

  // before Ready to reach out: what's known about it, nothing to send
  if (!tabs.length) return <div className={`${PANEL} @container min-h-0 w-full max-w-xl flex-1 overflow-y-auto`}>{aside}</div>;

  // one platform's message on the day for the person: picked between when
  // there are two, then the message, then how it went (from the day on)
  const platformRow = (t: SequenceTab, options: MessageData[], c: Contact | null) => {
    const key = forContact(t.key, c);
    const chosen = chosenFor(options, picks, t.key, c, lead.email.opens > 0) ?? options[0];
    const can = hasChannel(c, chosen.channel);
    // the day has come, or gone (a lead past the days, in Replied, can still untap)
    const reached = t.when === "done" || (t.day != null && today != null && t.day <= today);
    const platform = MARKED.includes(chosen.channel as Marked) ? (chosen.channel as Marked) : null;
    const m = platform ? (lead.marks[idOf(c)]?.[platform] ?? {}) : {};
    const rowVars = c?.name.trim() ? { ...vars, Name: firstName(c.name) } : vars;
    const mark = (kind: "accepted" | "replied") => platform && onMark({ contact: idOf(c), platform, kind, day: m[kind] ? null : t.key });
    const needs = platform === "linkedin" && !m.accepted;
    const chip = "chip flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50";
    return (
      <div key={chosen.channel} className={`flex flex-col gap-2.5 ${can ? "" : "opacity-50"}`} title={can ? undefined : `${c?.name.trim() || "This lead"} has no ${PLATFORM_NAME[chosen.channel as keyof typeof PLATFORM_NAME] ?? chosen.channel}${chosen.channel === "email" ? " address" : " handle"}`}>
        {options.length > 1 &&
          (options.length <= 4 ? (
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o.id} type="button" aria-pressed={chosen.id === o.id} onClick={() => chosen.id !== o.id && pick(key, o.id)} className={chip}>
                  <span className="flex shrink-0">{CHANNEL_ICON[o.channel] ?? CHANNEL_ICON.other}</span>
                  {optionLabel(options, o)}
                </button>
              ))}
            </div>
          ) : (
            <Dropdown size="sm" value={chosen.id} placeholder="Pick a message" options={options.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => v && pick(key, v)} />
          ))}
        <MessageForm
          key={`${chosen.id}:${opener}:${idOf(c)}`}
          message={chosen}
          stages={board.stages}
          leadId={lead.id}
          vars={rowVars}
          names={names}
          own={own(chosen.id)}
          rewritten={rewritten(chosen.id)}
          written={!!(prepared && openerOf(prepared, picks)?.drafts[chosen.id])}
          approval={{ at: approvalOf(forContact(chosen.id, c)), set: (on) => approve(forContact(chosen.id, c), on) }}
          sent={sent?.find((x) => x.messageId === chosen.id) ?? null}
          extra={/meme/i.test(chosen.name) && memeBoard ? `Image: meme board ${memeBoard}.` : null}
          onMine={(d) => saveMine(chosen.id, d)}
          onVar={saveVar}
        />
        {can && reached && (chosen.channel === "email" ? lead.email.sent || lead.email.bounced : !!platform) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chosen.channel === "email" && <EmailStatus email={lead.email} />}
            {platform === "linkedin" && (request === t.day || needs) && (
              <button type="button" aria-pressed={!!m.accepted} onClick={() => mark("accepted")} title={m.accepted ? "They accepted the connection request. Tap to undo." : "They accepted our connection request"} className={chip}>
                {CHANNEL_ICON[platform]} <UserCheck size={12} /> {m.accepted ? "Accepted" : "Accept"}
              </button>
            )}
            {/* LinkedIn's Reply only once the request is accepted */}
            {platform && !needs && (
              <button type="button" aria-pressed={!!m.replied} onClick={() => mark("replied")} title={m.replied ? "Replied. Tap to undo." : `They replied on ${PLATFORM_NAME[platform]}`} className={chip}>
                {CHANNEL_ICON[platform]} <Reply size={12} /> {m.replied ? "Replied" : "Reply"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const t = shownTab;
  // its messages, one platform at a time, in the day's own order
  const byPlatform = [...new Set(t.messages.map((m) => m.channel))].map((ch) => t.messages.filter((m) => m.channel === ch));

  return (
    <div className="@container min-h-0 flex-1">
      {/* the lead's profile on the left; on the right its messages, the days along their top */}
      <div className="grid h-full min-h-0 gap-4 @3xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        {/* side by side, as tall as the emails beside it (Abhishek: the panels equal); stacked, as tall as what's in it */}
        <aside className={`${PANEL} @container max-h-full min-h-0 self-start overflow-y-auto @3xl:self-stretch`}>
          {/* the form: the words that change per lead, typed once, filling every email that uses them */}
          {prepared && used.length > 0 && (
            <section className="border-b border-white/[0.06] px-5 py-5">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Fill in</p>
                <span className={`ml-auto text-xs ${blanks.length ? "text-red-300" : "text-emerald-300"}`}>{blanks.length ? `${blanks.length} to fill` : "All filled"}</span>
              </div>
              <div className="flex flex-col gap-3">
                {used.map((name) => (
                  <label key={name} className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-muted">{name}</span>
                    <input
                      value={typed[name] ?? lead.vars[name] ?? ""}
                      onChange={(e) => setTyped((x) => ({ ...x, [name]: e.target.value }))}
                      onBlur={(e) => saveVar(name, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      placeholder={auto[name] ? `${auto[name]} (filled in for you)` : `Type the ${name.toLowerCase()}`}
                      className={`${INPUT} ${!(typed[name] ?? lead.vars[name] ?? auto[name]) ? "border-red-400/30" : ""}`}
                    />
                  </label>
                ))}
              </div>
            </section>
          )}
          {aside}
        </aside>
        <section className={`${PANEL} @container flex min-h-0 flex-col overflow-hidden`}>
          {/* the days as steps along the top: done (approved or replied) with a
              tick, today green, next blue, the open one lit, joined by lines.
              In a narrow window the other days shrink to numbered circles (on a
              phone, without the lines), so every day shows and nothing is cut off. */}
          <div className="flex shrink-0 flex-col gap-2.5 border-b border-white/[0.07] px-4 py-3">
            {/* the opener, as on the Dream 300 pages: the first email written
                for this lead, main or a backup; Days 1 and 2 change with it */}
            {openers.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Opener</span>
                <div role="tablist" aria-label="Opener" className="flex flex-wrap items-center gap-1.5">
                  {openers.map((o, i) => (
                    <button key={i} type="button" role="tab" aria-selected={i === opener} onClick={() => i !== opener && pickOpenerAt(i)} title="Days 1 and 2 change with the opener picked; Days 3 to 8 stay the same" className="chip rounded-full px-3 py-1 text-xs">
                      {o.label || `Opener ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              {/* a little room around the strip, so the lit day's ring is never clipped */}
              <div ref={strip} role="tablist" aria-label="Days" className={`-m-1 flex min-w-0 flex-1 items-center p-1 ${fit === 3 ? "flex-wrap gap-1" : "overflow-hidden"}`}>
                {tabs.map((x, i) => {
                  const replied = repliedOn(x.key);
                  const on = x.key === t.key;
                  const ready = dayApproved(x);
                  const tone = x.when === "now" ? "emerald" : x.when === "next" ? "accent" : null;
                  // the open one always says its name; the others, when it's tight, a number (a stage: its first letter)
                  const short = fit > 0 && !on;
                  return (
                    <Fragment key={x.key}>
                      {i > 0 && fit < 2 && <span aria-hidden className={`h-px shrink-0 ${fit === 0 ? "w-5" : "w-2"} ${dayApproved(tabs[i - 1]) ? "bg-emerald-400/35" : "bg-white/[0.09]"}`} />}
                      <button
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setTab(x.key)}
                        title={x.sub}
                        className={`flex shrink-0 items-center gap-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-200 ${short ? (fit >= 2 ? "p-0.5" : "p-1") : "py-1 pr-3.5 pl-1.5"} ${
                          on ? "bg-accent/[0.14] text-foreground ring-1 ring-accent/40" : `hover:bg-white/[0.04] hover:text-foreground ${x.when === "done" && !ready ? "text-muted/70" : "text-muted"}`
                        }`}
                      >
                        {replied || ready ? (
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300" aria-label={replied ? "Replied" : "Approved"}>
                            <Check size={12} />
                          </span>
                        ) : (
                          <span className={`grid size-5 shrink-0 place-items-center rounded-full ring-1 text-[10px] tabular-nums ${tone === "emerald" ? "ring-emerald-400/50 text-emerald-300" : tone === "accent" ? "ring-accent/50 text-accent" : "ring-white/15"}`} aria-label={x.when === "now" ? "Today" : x.when === "next" ? "Next" : undefined}>
                            {short ? (x.day ?? x.title.charAt(0)) : tone && <span className={`size-1.5 rounded-full ${tone === "emerald" ? "bg-emerald-400" : "bg-accent"}`} />}
                          </span>
                        )}
                        {!short && <span>{x.title}</span>}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
              <button type="button" onClick={() => setLibrary(true)} aria-label="All messages" title="All messages" className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
                <Library size={15} />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {error && (
            <p role="alert" className="fade-in text-xs text-red-300">
              {error}
            </p>
          )}

          {/* the picked day */}
          <div key={`${t.key}:${idOf(person)}`} className="fade-in flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-2 text-xs">
              <span className="flex min-w-0 text-[15px] font-semibold text-foreground">
                {canBuild ? (
                  <EditableName
                    name={t.stage.name}
                    pencil="hover"
                    onSave={async (name) => {
                      // a day keeps its number whatever it's called: without it, it would leave the sequence
                      const words = t.day != null ? name.replace(/^\s*day\s*\d+\s*·?\s*/i, "").trim() : name.trim();
                      const next = t.day != null ? (words ? `Day ${t.day} · ${words}` : `Day ${t.day}`) : words;
                      if (!next) return "Give it a name.";
                      const res = await renameStage(t.stage.id, next).catch(() => ({ error: OFFLINE }));
                      if (res.error) return res.error;
                      router.refresh();
                    }}
                  />
                ) : (
                  t.stage.name
                )}
              </span>
              {t.when && t.when !== "done" && (
                <span className={`rounded-full px-2 py-0.5 text-[12px] ${t.when === "now" ? "bg-emerald-400/10 text-emerald-300" : "bg-accent/10 text-accent"}`}>{t.when === "now" ? "Today" : "Next"}</span>
              )}
              {repliedOn(t.key) && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[12px] text-emerald-300">
                  <Reply size={11} /> Replied
                </span>
              )}
            </p>
            {prepared ? (
              <div className="flex flex-col gap-4">{byPlatform.map((options) => platformRow(t, options, person))}</div>
            ) : (
              <p className="px-1 pt-3 text-xs text-muted">Loading its messages…</p>
            )}
          </div>

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
          </div>
        </section>
      </div>
      <MessageLibrary
        open={library}
        onClose={() => setLibrary(false)}
        board={board}
        sentIds={sentIds}
        highlight={t.messages.map((m) => m.id)}
        render={(m) => <TemplateView key={m.id} message={m} group={messageGroups(board).find((g) => g.items.some((x) => x.id === m.id))?.title ?? ""} stages={board.stages} names={names} />}
      />
    </div>
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
  const canBuild = useContext(CanBuild);
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
            {canBuild && (
              <button type="button" onClick={() => setCreating(true)} aria-pressed={creating} className="btn btn-xs btn-glow ml-auto flex items-center gap-1 px-2">
                <Plus size={12} /> New
              </button>
            )}
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
                <p className="px-2 pb-1 text-[12px] font-medium text-muted">{g.title}</p>
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
    <span className={`text-[12px] tabular-nums ${over ? "text-rose-300" : "text-muted"} ${className}`}>
      {text.length}/{LINKEDIN_LIMIT}
      {over && " · LinkedIn allows 300 characters"}
    </span>
  );
}

// One of the day's emails as a card (Abhishek, 17 Oct 2026): its name, rule
// and actions on top; its subject and words, the filled-in variables lit;
// Approve at its foot. The pencil opens it to change for this lead alone (the
// template and other leads stay as they are), with Back to what was written
// for it (or the template). A message sent already reads as it went.
function MessageForm({
  message,
  stages,
  leadId,
  vars,
  names,
  own,
  rewritten,
  written,
  approval,
  sent,
  extra,
  onMine,
  onVar,
}: {
  message: MessageData;
  stages: StageData[];
  leadId: string;
  vars: Record<string, string>;
  names: string[];
  own: Draft | undefined;
  rewritten: boolean;
  written: boolean;
  approval: { at: Approval | null; set: (on: boolean) => void };
  sent: SentData | null;
  extra?: string | null;
  onMine: (draft: Draft | null) => Promise<string | undefined>;
  onVar: (name: string, value: string) => Promise<string | undefined>;
}) {
  const canBuild = useContext(CanBuild);
  const source = own ?? message;
  const isEmail = message.channel === "email";
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState(false);
  const [copied, setCopied] = useState(false);
  // the values the editor was filled from: what it's read back against
  const [base, setBase] = useState(vars);
  const shownSubject = sent ? sent.subject : fillText(source.subject, vars);
  const shownBody = sent ? sent.body : fillText(source.body, vars);

  function edit() {
    setBase(vars);
    setSubject(shownSubject);
    setBody(shownBody);
    setError(null);
    setEditing(true);
  }
  async function save(draft: Draft | null) {
    if (draft && !draft.body.trim()) return setError("A message needs some words.");
    setBusy(true);
    setError(null);
    let err: string | undefined;
    if (draft) {
      // read back against what it was filled from: a changed value goes to
      // Fill in (and every message); other changes keep their variables
      let subject = readEdit(source.subject, base, draft.subject, ["Name"]);
      let body = readEdit(source.body, base, draft.body, ["Name"]);
      // one value changed two ways: each part keeps its own wording instead
      if ("name" in subject && "name" in body && subject.name === body.name && subject.value !== body.value) {
        subject = readEdit(source.subject, base, draft.subject, ["Name", subject.name]);
        body = readEdit(source.body, base, draft.body, ["Name", body.name]);
      }
      for (const r of [subject, body]) if ("name" in r) err ??= await onVar(r.name, r.value);
      if (!err && ("text" in subject || "text" in body)) err = await onMine({ subject: "text" in subject ? subject.text : source.subject, body: "text" in body ? body.text : source.body });
    } else err = await onMine(null);
    setBusy(false);
    if (err) return setError(err);
    setEditing(false);
  }
  async function copy() {
    await navigator.clipboard.writeText(isEmail && shownSubject ? `Subject: ${shownSubject}\n\n${shownBody}` : shownBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  if (template) return <TemplateEditor message={message} stages={stages} names={names} leadId={leadId} onDone={() => setTemplate(false)} />;

  const ICON = "grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";
  const FIELD = "w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-foreground outline-none! transition-colors placeholder:text-muted/50 focus:border-accent/40";

  return (
    <article className="fade-in overflow-hidden rounded-xl border border-white/[0.08]">
      {/* its name and rule, and what can be done with it */}
      <header className="flex items-start gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="mt-0.5 flex shrink-0">{CHANNEL_ICON[message.channel] ?? CHANNEL_ICON.other}</span>
        <div className="min-w-0 flex-1">
          <h4 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="min-w-0 truncate">{message.name}</span>
            {rewritten && !sent && <span className="shrink-0 text-xs font-normal text-muted">· Edited</span>}
            {sent && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[12px] font-medium text-emerald-300">
                <Check size={11} /> Sent
              </span>
            )}
          </h4>
          {/* the template's sending note stays in All messages; only what's
              needed to send this one shows here (Day 6's meme board image) */}
          {extra && <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{extra}</p>}
        </div>
        {!editing && (
          <span className="-mt-0.5 flex shrink-0 items-center">
            <button type="button" onClick={copy} title={copied ? "Copied" : "Copy the message"} aria-label="Copy the message" className={ICON}>
              {copied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
            </button>
            {!sent && (
              <button type="button" onClick={edit} title="Edit for this lead" aria-label="Edit this message" className={ICON}>
                <Pencil size={14} />
              </button>
            )}
            {canBuild && !sent && (
              <button type="button" onClick={() => setTemplate(true)} title="Edit the template, for every lead" aria-label="Edit the template" className={ICON}>
                <LayoutTemplate size={14} />
              </button>
            )}
          </span>
        )}
      </header>

      {editing ? (
        <div className="fade-in flex flex-col gap-2.5 px-4 py-4">
          {isEmail && <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className={`${FIELD} text-sm font-medium`} />}
          <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} aria-label={message.name} className={`${FIELD} field-sizing-content min-h-40 resize-none text-sm leading-relaxed`} />
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {message.channel === "linkedin" && <Limit channel={message.channel} text={body} />}
            {rewritten && (
              <button type="button" onClick={() => save(null)} disabled={busy} className="flex items-center gap-1 text-muted transition-colors hover:text-foreground">
                <RotateCcw size={11} /> {written ? "Back to the written message" : "Back to the template"}
              </button>
            )}
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
                Cancel
              </button>
              <button type="button" onClick={() => save({ subject, body })} disabled={busy || !body.trim()} className="btn btn-sm btn-glow">
                {busy ? "Saving…" : "Save for this lead"}
              </button>
            </span>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          {isEmail && shownSubject && (
            <p className="mb-3 text-foreground">
              <span className="text-muted">Subject: </span>
              <span className="font-medium">{sent ? shownSubject : <Filled text={source.subject} vars={vars} />}</span>
            </p>
          )}
          {sent ? shownBody : <Filled text={source.body} vars={vars} />}
        </div>
      )}

      {!sent && !editing && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] px-4 py-2.5 text-xs">
          {message.channel === "linkedin" && <Limit channel={message.channel} text={shownBody} />}
          <button
            type="button"
            aria-pressed={!!approval.at}
            onClick={() => approval.set(!approval.at)}
            title={approval.at ? "Approved. Tap to undo." : "Approve this message as ready to send"}
            className={`ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors ${
              approval.at ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/20" : "border-white/[0.12] bg-white/[0.04] text-foreground hover:bg-white/[0.08]"
            }`}
          >
            <Check size={13} className={approval.at ? "" : "text-emerald-300"} />
            {approval.at ? "Approved" : "Approve"}
          </button>
        </footer>
      )}
    </article>
  );
}

// A template as the library shows it: its day and platform, its rule, and
// its words with the variables lit; copy it, or (setting up) change it
function TemplateView({ message, group, stages, names }: { message: MessageData; group: string; stages: StageData[]; names: string[] }) {
  const canBuild = useContext(CanBuild);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  if (editing) return <TemplateEditor message={message} stages={stages} names={names} onDone={() => setEditing(false)} />;
  const label = message.name.replace(/^day \d+\s*·\s*/i, "");
  return (
    <div className="fade-in flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-muted">{group}</p>
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="flex shrink-0">{CHANNEL_ICON[message.channel] ?? CHANNEL_ICON.other}</span>
            <span className="min-w-0 truncate">{label || message.name}</span>
          </h3>
        </div>
        <span className="ml-auto flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(message.channel === "email" && message.subject ? `Subject: ${message.subject}\n\n${message.body}` : message.body);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn btn-sm btn-glow flex items-center gap-1.5"
          >
            {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </button>
          {canBuild && (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-sm btn-glow flex items-center gap-1.5">
              <Pencil size={13} /> Edit template
            </button>
          )}
        </span>
      </div>
      {message.note && <p className="border-l-2 border-white/10 pl-3 text-xs leading-relaxed text-muted">{message.note}</p>}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
        {message.channel === "email" && message.subject && (
          <p className="border-b border-white/[0.06] px-4 py-2.5 text-sm">
            <span className="text-muted">Subject </span>
            <span className="font-medium">
              <Filled text={message.subject} vars={{}} template />
            </span>
          </p>
        )}
        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          <Filled text={message.body} vars={{}} template />
        </div>
      </div>
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
        <span className="ml-auto text-[12px] text-muted">{message ? "For every lead that hasn\u2019t sent it" : "For every lead in the stage you pick"}</span>
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
        {used.length > 0 && <span className="ml-1 text-[12px] text-muted">Insert:</span>}
        {used.map((n) => (
          <button key={n} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(n)} className="rounded bg-accent/15 px-1.5 py-0.5 text-[12px] text-accent transition-colors hover:bg-accent/25">
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
          <p className="text-[12px] text-muted">Every lead in that stage gets it, with its own variables.</p>
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
      {message && <p className="text-[12px] text-muted">Leads that already sent it keep what went out, and a lead with its own copy keeps that copy.</p>}

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
