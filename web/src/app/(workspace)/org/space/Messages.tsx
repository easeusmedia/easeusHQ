"use client";

import { Fragment, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Braces, Check, ChevronRight, Copy, LayoutTemplate, Library, Mail, MessageSquare, Pencil, Plus, Reply, RotateCcw, Search, Trash2, UserCheck, X } from "lucide-react";
import { chosenFor, dayOf, fillParts, fillText, readEdit, forContact, hasChannel, leadPeople, leadVars, LINKEDIN_LIMIT, MARKED, MESSAGE_CHANNELS, messageGroups, NO_CONTACT, draftKey, openerIndex, openerOf, optionLabel, shownDraftKey, PLATFORM_NAME, preparedFor, requestDay, sequenceTabs, toneOf, variablesIn, type BoardData, type Contact, type Draft, type LeadData, type Marked, type MarkChange, type Approval, type MessageData, type Prepared, type SentData, type SequenceTab, type StageData, approvalIn, approvalKey, approvalKeys, openerOwn, dayLeft, emptyFills, listed, nameKey, varsFor, wordingOf, dayOff, sendKey, sendsOn } from "@/lib/space";
import { setSendOn, approveMessage, createMessage, deleteMessage, pickMessage, pickOpener, renameStage, setLeadDraft, setLeadValue, setLeadVar, setSentFrom, updateMessage } from "./actions";
import { EditableName } from "../../EditableName";
import { ReasonDialog } from "./ReasonDialog";
import { EmailStatus } from "./LeadCard";
import { CanBuild } from "./values";
import { copyMessage, emailHtml, marked, marks, plainText } from "@/lib/emailCopy";
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
  nudge = 0,
  typed,
  setTyped,
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
  // counts up when a move was held back for empty fill-ins: the Fill in form comes into view and they pulse
  nudge?: number;
  // what's typed in the Fill in form, ahead of the save: kept by the window (LeadPeek), so a move straight after sees it
  typed: Record<string, string>;
  setTyped: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onMark: (change: MarkChange) => void;
  onSaved: () => void;
}) {
  // what's typed above shows in every message at once, ahead of the save
  const [mine, setMine] = useState<Record<string, Draft | null>>({});
  const vars = leadVars({ ...lead, vars: { ...lead.vars, ...typed } }, board.fields);
  const auto = leadVars({ ...lead, vars: {} }, board.fields);
  const names = variablesIn(board.messages.flatMap((m) => [m.subject, m.body]));
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  // the people on the lead (none: the lead itself), one at a time, as the contact tabs and the approvals have them
  const contacts = leadPeople(lead.values, board.fields);
  const people: (Contact | null)[] = contacts.length ? contacts : [null];
  const idOf = (c: Contact | null) => c?.id ?? NO_CONTACT;
  // whose messages: picked at the top of the window, for both its sides
  const person = people.find((c) => idOf(c) === idOf(picked_person)) ?? people[0];
  const request = requestDay(board);
  // a day's message (or the opener) picked here, ahead of the save
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const pickOf = (key: string) => (key in picked ? picked[key] : (lead.picks?.[key] ?? null));
  // a pick taken off here (null) is gone, as pickOf has it
  const picks = Object.fromEntries(Object.entries({ ...(lead.picks ?? {}), ...picked }).filter((e): e is [string, string] => !!e[1]));
  // the lead's own wording with what's been saved here since it loaded (null: put back)
  const merged: Prepared | null = prepared ? { ...prepared, drafts: Object.fromEntries(Object.entries({ ...prepared.drafts, ...mine }).filter((e): e is [string, Draft] => !!e[1])) } : null;
  // a lead with more than one person: each has their own copy of a message, an
  // edit for one leaving the others' as they were (Abhishek, 10 Nov 2026)
  const apart = people.length > 1;
  const own = (id: string, c: Contact | null): Draft | undefined => (merged ? preparedFor(merged, picks, id, c) : undefined);
  // approved as ready to send, by message and person, ahead of the save
  const [approved, setApproved] = useState<Record<string, Approval | null>>({});
  const approvals = { ...lead.approvals, ...approved };
  // an approval, else the one standing for it (lib/space approvalIn)
  const approvalOf = (key: string) => approvalIn(approvals, key);
  // where a message's approval is kept: for the opener (the one in use unless said) when it's the opener's own
  const keyOf = (messageId: string, c: Contact | null, i?: number) => approvalKey(prepared ?? { openers: [] }, picks, messageId, c, i);
  async function approve(key: string, on: boolean) {
    // undone, the one standing for it goes too, as on the server
    const keys = on ? [key] : approvalKeys(key);
    const before = Object.fromEntries(keys.map((k) => [k, approvals[k] ?? null]));
    setError(null);
    setApproved((a) => ({ ...a, ...Object.fromEntries(keys.map((k) => [k, on ? { by: "You", at: new Date().toISOString() } : null])) }));
    const res = await approveMessage(lead.id, key, on).catch(() => ({ error: OFFLINE }));
    if (res.error) {
      setApproved((a) => ({ ...a, ...before }));
      return setError(res.error);
    }
    onSaved();
  }
  const canBuild = useContext(CanBuild);
  const router = useRouter();
  // rewritten here (not just written ahead): "This lead's copy"
  const rewritten = (id: string, c: Contact | null) => !!merged && shownDraftKey(merged, picks, id, c) !== null;
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
  // a platform turned on or off for the person (lib/space sendsOn); back to as their handles have it, it's taken off
  async function toggleSend(platform: string) {
    const key = sendKey(platform, person);
    const next = !sendsOn(picks, person, platform);
    const value = next === hasChannel(person, platform) ? null : next ? "on" : "off";
    const before = pickOf(key);
    setError(null);
    setPicked((p) => ({ ...p, [key]: value }));
    const res = await setSendOn(lead.id, platform, person?.id ?? null, value).catch(() => ({ error: OFFLINE }));
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
  async function addChannel(c: Contact | null, channel: string, typed: string): Promise<string | undefined> {
    const field = board.fields.find((f) => f.kind === "contacts");
    const value = channelValue(channel, typed);
    if (!field || !value) return "That couldn't be added.";
    const list = (Array.isArray(lead.values[field.id]) ? lead.values[field.id] : []) as Contact[];
    const kind = channel as Contact["channels"][number]["kind"];
    const known = c && list.some((x) => x.id === c.id);
    const next = known
      ? list.map((x) => (x.id === c!.id ? { ...x, channels: [...x.channels.filter((ch) => ch.value.trim()), { kind, value }] } : x))
      : [...list, { id: crypto.randomUUID(), name: c?.name ?? "", role: c?.role ?? "", channels: [{ kind, value }] }];
    const res = await setLeadValue(lead.id, field.id, next).catch(() => ({ error: OFFLINE }));
    if (res.error) return res.error;
    onSaved();
  }
  // where each person's emails go out from: set here, ahead of the save (null: back to the tracker's)
  const [fromSet, setFromSet] = useState<Record<string, string | null>>({});
  const fromOf = (c: Contact | null) => {
    const key = idOf(c);
    if (!(key in fromSet)) return lead.sentFrom?.[key] ?? null;
    const set = fromSet[key];
    return set ? { email: set, auto: false } : lead.sentFrom?.[key]?.auto ? lead.sentFrom[key] : null;
  };
  async function saveFrom(c: Contact | null, email: string | null) {
    const key = idOf(c);
    const before = fromSet;
    setError(null);
    setFromSet((f) => ({ ...f, [key]: email }));
    const res = await setSentFrom(lead.id, key, email).catch(() => ({ error: OFFLINE }));
    if (res.error) {
      setFromSet(before);
      return setError(res.error);
    }
    onSaved();
  }
  async function saveMine(messageId: string, draft: Draft | null, c: Contact | null) {
    setError(null);
    // a new edit goes under the opener in use (when it wrote this message), and
    // the person when the lead has more than one; putting back takes off the one shown
    const whose = apart ? c : null;
    const key = !merged ? forContact(messageId, whose) : draft ? draftKey(merged, picks, messageId, whose) : (shownDraftKey(merged, picks, messageId, whose) ?? forContact(messageId, whose));
    // putting back, for one person, a copy the lead's people share: the others keep it as their own
    const shared = !draft && whose && merged && !key.includes("@") ? merged.drafts[key] : undefined;
    const keep = shared && merged ? people.filter((o) => o && idOf(o) !== idOf(whose) && !shownDraftKey(merged, picks, messageId, o)?.includes("@")).map((o) => draftKey(merged, picks, messageId, o)) : [];
    const res = await setLeadDraft(lead.id, key, draft, keep).catch(() => ({ error: OFFLINE }));
    if (res.error) return res.error;
    setMine((d) => ({ ...d, [key]: draft, ...Object.fromEntries(keep.map((k) => [k, shared ?? null])) }));
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
  // a day nothing on it reaches the person on is off for them (lib/space dayOff): never the one shown
  const offFor = (x: SequenceTab) => x.day != null && dayOff(x.messages, person, picks);
  // the platforms the days go out on, each turned on or off for the person above the days
  const platforms = (["email", "instagram", "linkedin"] as const).filter((p) => tabs.some((x) => x.day != null && x.messages.some((m) => m.channel === p)));
  const shownTab = [tabs.find((t) => t.key === tab), tabs.find((t) => t.when === "now"), tabs.find((t) => t.when === "next"), ...tabs].find((x) => x && !offFor(x)) ?? tabs[0];
  // sent from a template since deleted: nowhere else to show them
  const orphans = (sent ?? []).filter((x) => !board.messages.some((m) => m.id === x.messageId));
  const sentIds = new Set((sent ?? []).map((x) => x.messageId ?? ""));
  // the variables the person's messages use (every day, so it's filled once), and which are still blank
  const allMessages = tabs.flatMap((t) => t.messages);
  // the wording each message shows (lib/space wordingOf), and the lead as this window has it, ahead of the saves
  const wording = merged ?? { drafts: {}, openers: [] };
  const state = { picks, approvals, vars };
  const used = variablesIn(allMessages.flatMap((m) => people.flatMap((c) => Object.values(wordingOf(wording, picks, m, c)))));
  // only the ones a day's tick waits on (dayLeft) for anyone on the lead, as a move does: these are ringed, counted and pulsed
  // (none until the lead's own wording loads: the board's templates can use fill-ins its wording doesn't)
  const waiting = new Set(merged ? people.flatMap((c) => tabs.flatMap((x) => dayLeft(x.messages, x.key, state, wording, c, lead.email.opens > 0).fill)) : []);
  const blanks = used.filter((n) => waiting.has(n));
  const openers = prepared?.openers ?? [];
  // which meme board image goes with Day 6's email, from the lead's property
  const memeField = board.fields.find((f) => /^meme board$/i.test(f.name.trim()));
  const memeBoard = memeField ? memeField.options.find((o) => (lead.values[memeField.id] as string[] | undefined)?.includes(o.id))?.name : undefined;
  const chosenOn = (x: SequenceTab, c: Contact | null) => [...new Set(x.messages.map((m) => m.channel))].map((ch) => x.messages.filter((m) => m.channel === ch)).map((options) => chosenFor(options, picks, x.key, c, lead.email.opens > 0) ?? options[0]);
  // a day is done once the person's messages on it are approved and every
  // fill-in they use is filled (lib/space dayLeft, as the move into Ready to
  // reach out has it); the ring fills with the approvals, an empty fill-in
  // holding it short. What's left is named, so a hover says so.
  const dayProgress = (x: SequenceTab) => {
    const { due, approve, fill: left } = dayLeft(x.messages, x.key, state, wording, person, lead.email.opens > 0);
    const fill = merged ? left : [];
    return { due: due.length + fill.length, done: due.length - approve.length, approve: approve.map((m) => m.name), fill };
  };
  // "fill in Link, approve Email 1"
  const todo = (fill: string[], approve: string[]) => [fill.length ? `fill in ${listed(fill)}` : "", approve.length ? `approve ${approve.join(", ")}` : ""].filter(Boolean).join(", ");
  const dayApproved = (x: SequenceTab) => {
    const p = dayProgress(x);
    return p.due > 0 && p.done === p.due;
  };
  // the same opener the wording comes from (openerOf), so the lit one is the one shown
  const opener = prepared ? openerIndex(prepared, picks) : 0;
  // an opener is done, green, once each of its own messages the person gets
  // (the one picked on its day, on a platform they're on) is approved for it,
  // and the fill-ins its wording of them uses are filled
  const openerMessages = prepared ? openerOwn(prepared.openers) : new Set<string>();
  const openersOwn = tabs.flatMap((x) => chosenOn(x, person)).filter((m) => openerMessages.has(m.id));
  const openersSendable = openersOwn.filter((m) => sendsOn(picks, person, m.channel));
  const openersDue = openersSendable.length ? openersSendable : openersOwn;
  const openerLeft = (i: number) => openersDue.filter((m) => !approvalOf(keyOf(m.id, person, i)));
  const openerFills = (i: number) => emptyFills(openersSendable, wording, { ...picks, opener: String(i) }, varsFor(vars, person));
  const openerApproved = (i: number) => openersDue.length > 0 && openerLeft(i).length === 0 && openerFills(i).length === 0;
  // the sequence's first email: one after it with no subject of its own is a reply in its thread
  const firstEmail = tabs.filter((x) => x.day != null).flatMap((x) => x.messages).find((m) => m.channel === "email");

  // a move held back for empty fill-ins (LeadPeek): the form comes into view, its empty fields pulse once
  const fillForm = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = fillForm.current;
    if (!nudge || !el) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
    if (still) return;
    for (const input of el.querySelectorAll("[data-empty]")) input.animate([{ boxShadow: "0 0 0 0 rgb(252 165 165 / 0.45)" }, { boxShadow: "0 0 0 6px rgb(252 165 165 / 0)" }], { duration: 900, delay: 250, easing: "ease-out" });
  }, [nudge]);

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
    const rowVars = varsFor(vars, c);
    const mark = (kind: "accepted" | "replied") => platform && onMark({ contact: idOf(c), platform, kind, day: m[kind] ? null : t.key });
    const needs = platform === "linkedin" && !m.accepted;
    const chip = "chip flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50";
    return (
      // one they can't be sent stays readable, its header saying why (Abhishek: greyed read as switched off)
      <div key={chosen.channel} className="flex flex-col gap-2.5">
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
          own={own(chosen.id, c)}
          rewritten={rewritten(chosen.id, c)}
          apart={apart}
          from={chosen.channel === "email" ? { at: fromOf(c), senders: board.senders ?? [], set: (v) => saveFrom(c, v) } : undefined}
          written={!!(prepared && openerOf(prepared, picks)?.drafts[chosen.id])}
          approval={{ at: approvalOf(keyOf(chosen.id, c)), set: (on) => approve(keyOf(chosen.id, c), on) }}
          thread={firstEmail && firstEmail.id !== chosen.id ? own(firstEmail.id, c)?.subject.trim() || firstEmail.subject : ""}
          sent={sent?.find((x) => x.messageId === chosen.id) ?? null}
          extra={/meme/i.test(chosen.name) && memeBoard ? `Image: meme board ${memeBoard}.` : null}
          cant={can ? null : (chosen.channel as "email" | "linkedin" | "instagram" | "other")}
          onAddChannel={(value) => addChannel(c, chosen.channel, value)}
          onMine={(d) => saveMine(chosen.id, d, c)}
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
          {aside}
          {/* the platforms the person is reached on, each switched on or off
              (Abhishek, 12 Nov 2026): a LinkedIn that won't accept, an
              Instagram not used; a day with nothing switched on goes off */}
          {platforms.length > 0 && (
            <section className="border-t border-white/[0.06] px-5 py-5">
              <p className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">Reach out on</p>
              <div className="flex flex-col">
                {platforms.map((p) => {
                  const on = sendsOn(picks, person, p);
                  return (
                    <button key={p} type="button" role="switch" aria-checked={on} onClick={() => toggleSend(p)} className="-mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.04]">
                      <span className={`grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] transition-opacity duration-200 ${on ? "" : "opacity-40"}`}>{CHANNEL_ICON[p]}</span>
                      <span className={`flex-1 transition-colors duration-200 ${on ? "text-foreground/85" : "text-muted"}`}>{PLATFORM_NAME[p]}</span>
                      <span className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${on ? "bg-accent" : "bg-white/15"}`}>
                        <span className={`size-3 rounded-full bg-white transition-transform duration-200 ${on ? "translate-x-3" : ""}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {/* the form, under the lead's details (Abhishek, 23 Oct 2026): the words that change per lead, typed once, filling every message that uses them */}
          {prepared && used.length > 0 && (
            <section ref={fillForm} className="border-t border-white/[0.06] px-5 py-5">
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Fill in</p>
                <span className={`ml-auto text-xs ${blanks.length ? "text-red-300" : "text-emerald-300"}`}>{blanks.length ? `${blanks.length} to fill` : "All filled"}</span>
              </div>
              <div className="flex flex-col gap-3">
                {/* an empty one a message uses: a thin red ring, the red of its {{Variable}} in the messages, gone once filled */}
                {used.map((name) => {
                  // Name: the picked person's own (lib/space nameKey), their first name until one's typed
                  const key = name === "Name" ? nameKey(person) : name;
                  const given = name === "Name" && person ? varsFor({}, person).Name : auto[name];
                  return (
                    <label key={name} className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-muted">{name}</span>
                      <input
                        value={typed[key] ?? lead.vars[key] ?? ""}
                        onChange={(e) => setTyped((x) => ({ ...x, [key]: e.target.value }))}
                        onBlur={(e) => saveVar(key, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        placeholder={given ? `${given} (filled in for you)` : `Type the ${name.toLowerCase()}`}
                        data-empty={blanks.includes(name) || undefined}
                        className={`${INPUT} ${blanks.includes(name) ? "border-red-300/50" : ""}`}
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          )}
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
                  {openers.map((o, i) => {
                    const done = openerApproved(i);
                    const left = openerLeft(i);
                    const fills = openerFills(i);
                    const begun = openersDue.length - left.length;
                    // green (!: the picked chip's look in globals.css is unlayered)
                    return (
                      <button key={i} type="button" role="tab" aria-selected={i === opener} onClick={() => i !== opener && pickOpenerAt(i)} title={done ? "Approved: Days 1 and 2 for this opener" : `For this opener (Days 1 and 2): ${todo(fills, left.map((m) => m.name))}`} className={`chip flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${done ? `border-emerald-400/40! text-emerald-200! ${i === opener ? "bg-emerald-400/25!" : "bg-emerald-400/15!"}` : ""}`}>
                        {done && <Check size={12} className="shrink-0" aria-label="Approved" />}
                        {o.label || `Opener ${i + 1}`}
                        {!done && begun > 0 && (
                          <span className="fade-in text-[11px] text-muted tabular-nums">
                            {begun}/{openersDue.length + fills.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              {/* a little room around the strip, so the lit day's ring is never clipped */}
              <div ref={strip} role="tablist" aria-label="Days" className={`-m-1 flex min-w-0 flex-1 items-center p-1 ${fit === 3 ? "flex-wrap gap-1" : "overflow-hidden"}`}>
                {tabs.map((x, i) => {
                  const replied = repliedOn(x.key);
                  const on = x.key === t.key;
                  const progress = dayProgress(x);
                  const ready = progress.due > 0 && progress.done === progress.due;
                  const tone = x.when === "now" ? "emerald" : x.when === "next" ? "accent" : null;
                  // the open one always says its name; the others, when it's tight, a number (a stage: its first letter)
                  const short = fit > 0 && !on;
                  const off = offFor(x);
                  return (
                    <Fragment key={x.key}>
                      {i > 0 && fit < 2 && <span aria-hidden className={`h-px shrink-0 ${fit === 0 ? "w-5" : "w-2"} ${dayApproved(tabs[i - 1]) ? "bg-emerald-400/35" : "bg-white/[0.09]"}`} />}
                      <button
                        type="button"
                        role="tab"
                        aria-selected={on}
                        disabled={off}
                        onClick={() => setTab(x.key)}
                        title={off ? `${x.title}: off for ${person?.name ?? "this lead"}` : ready ? `${x.title}: approved` : progress.done < progress.due ? `${x.title}: ${todo(progress.fill, progress.approve)}` : x.sub}
                        className={`flex shrink-0 items-center gap-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-[color,background-color,box-shadow,opacity] duration-200 ${short ? (fit >= 2 ? "p-0.5" : "p-1") : "py-1 pr-3.5 pl-1.5"} ${
                          off ? "cursor-not-allowed text-muted opacity-40" : on ? "bg-accent/[0.14] text-foreground ring-1 ring-accent/40" : `hover:bg-white/[0.04] hover:text-foreground ${x.when === "done" && !ready ? "text-muted/70" : "text-muted"}`
                        }`}
                      >
                        {replied || ready ? (
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300" aria-label={replied ? "Replied" : "Approved"}>
                            <Check size={12} />
                          </span>
                        ) : (
                          <span className={`relative grid size-5 shrink-0 place-items-center rounded-full ring-1 text-[10px] tabular-nums ${tone === "emerald" ? "ring-emerald-400/50 text-emerald-300" : tone === "accent" ? "ring-accent/50 text-accent" : "ring-white/15"}`} aria-label={x.when === "now" ? "Today" : x.when === "next" ? "Next" : undefined}>
                            {/* part approved: the ring fills that far */}
                            {progress.done > 0 && (
                              <svg viewBox="0 0 20 20" aria-hidden className="absolute inset-0 size-5 -rotate-90">
                                <circle cx="10" cy="10" r="9.5" fill="none" stroke="rgb(52 211 153 / 0.8)" strokeWidth="1.5" pathLength="100" strokeDasharray={`${(progress.done / progress.due) * 100} 100`} className="transition-[stroke-dasharray] duration-300" />
                              </svg>
                            )}
                            {short ? (x.day ?? x.title.charAt(0)) : tone && <span className={`size-1.5 rounded-full ${tone === "emerald" ? "bg-emerald-400" : "bg-accent"}`} />}
                          </span>
                        )}
                        {!short && <span>{x.title}</span>}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
              <button type="button" onClick={() => setLibrary(true)} title="All messages" className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
                Templates
                <Library size={14} />
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
// "+ Add an email address": what a message that can't be sent yet asks for, and an example
const ADD_LABEL: Record<string, string> = { email: "an email address", linkedin: "their LinkedIn", instagram: "their Instagram", other: "a website" };
const ADD_EXAMPLE: Record<string, string> = { email: "name@clinic.com", linkedin: "linkedin.com/in/their-name", instagram: "@their.handle or instagram.com/their.handle", other: "clinic.com" };
// what's typed, as the contact keeps it: an Instagram "@handle" or a bare LinkedIn name made a profile address
function channelValue(kind: string, typed: string): string | null {
  const v = typed.trim();
  if (!v) return null;
  if (kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.)?(instagram|linkedin)\.com\//i.test(v)) return `https://${v.replace(/^www\./i, "www.")}`;
  if (kind === "instagram" && /^@?[\w.]{2,30}$/.test(v)) return `https://www.instagram.com/${v.replace(/^@/, "")}/`;
  if (kind === "linkedin" && /^[\w-]{3,100}$/.test(v)) return `https://www.linkedin.com/in/${v}/`;
  return /\s/.test(v) ? null : v;
}

function MessageForm({
  message,
  stages,
  leadId,
  vars,
  names,
  own,
  rewritten,
  apart = false,
  from,
  written,
  approval,
  thread,
  sent,
  extra,
  cant,
  onAddChannel,
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
  // one of the lead's people: an edit is theirs alone, never a fill-in's value for everyone
  apart?: boolean;
  // an email's: the address it goes out from (the tracker's, else set by hand), the ones to pick from, and setting it
  from?: { at: { email: string; auto: boolean } | null; senders: string[]; set: (email: string | null) => void };
  written: boolean;
  approval: { at: Approval | null; set: (on: boolean) => void };
  // the subject of the sequence's first email, as this lead has it (none: this is it)
  thread: string;
  sent: SentData | null;
  extra?: string | null;
  // the channel the person picked has nothing on yet, so this can't be sent
  cant?: string | null;
  onAddChannel: (value: string) => Promise<string | undefined>;
  onMine: (draft: Draft | null) => Promise<string | undefined>;
  onVar: (name: string, value: string) => Promise<string | undefined>;
}) {
  const canBuild = useContext(CanBuild);
  const isEmail = message.channel === "email";
  // an email as it goes out: the lead's copy (else the template) with the
  // house's links and bold and the template's own (lib/emailCopy marked), so a
  // copy brought in as plain words still carries them
  const words = own ?? message;
  const source = isEmail ? { ...words, body: marked(words.body, message.body) } : words;
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState(false);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  // adding the email or handle this message needs, right where it's missing
  const [adding, setAdding] = useState(false);
  const [handle, setHandle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  async function addHandle(e: React.FormEvent) {
    e.preventDefault();
    if (!cant) return;
    if (!channelValue(cant, handle)) return setAddError(cant === "email" ? "That doesn't look like an email address." : "That doesn't look like a link or handle.");
    setBusy(true);
    const err = await onAddChannel(handle);
    setBusy(false);
    if (err) return setAddError(err);
    setAdding(false);
    setHandle("");
    setAddError(null);
  }
  // the values the editor was filled from: what it's read back against
  const [base, setBase] = useState(vars);
  // an email with no subject of its own (Emails 2 to 4) is a reply in the first one's thread
  // the lead's own wording with no subject of its own (an import that brought
  // only the words) keeps the board's subject for it ("{{Subject}}"); an email
  // with none at all (Emails 2 to 4) is a reply in the first one's thread
  const ownSubject = source.subject.trim() ? source.subject : message.subject;
  const subjectText = isEmail && !ownSubject.trim() && thread.trim() ? `Re: ${thread}` : ownSubject;
  const shownSubject = sent ? sent.subject : fillText(subjectText, vars);
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
      // Fill in (and every message); other changes keep their variables. A
      // reply's subject reads against the "Re: " it shows, so left as it was
      // it still follows the thread
      const fixed = apart ? ["Name", ...names] : ["Name"];
      let subject = readEdit(subjectText, base, draft.subject, fixed);
      let body = readEdit(source.body, base, draft.body, fixed);
      // one value changed two ways: each part keeps its own wording instead
      if ("name" in subject && "name" in body && subject.name === body.name && subject.value !== body.value) {
        subject = readEdit(subjectText, base, draft.subject, [...fixed, subject.name]);
        body = readEdit(source.body, base, draft.body, [...fixed, body.name]);
      }
      for (const r of [subject, body]) if ("name" in r) err ??= await onVar(r.name, r.value);
      if (!err && ("text" in subject || "text" in body)) err = await onMine({ subject: "text" in subject ? subject.text : source.subject, body: "text" in body ? body.text : source.body });
    } else err = await onMine(null);
    setBusy(false);
    if (err) return setError(err);
    setEditing(false);
  }
  // the subject and the words each copy on their own
  async function copy(what: "subject" | "body") {
    await (what === "subject" ? navigator.clipboard.writeText(shownSubject) : copyMessage(shownBody, isEmail));
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
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
            {cant && !sent && !adding && (
              <button type="button" onClick={() => setAdding(true)} className="fade-in shrink-0 text-xs font-normal text-amber-300/90 transition-colors hover:text-amber-200">
                + Add {ADD_LABEL[cant] ?? "a way to reach them"}
              </button>
            )}
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
        {/* editing: its buttons up here, not under a long message */}
        {editing && (
          <span className="fade-in -mt-0.5 flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => setEditing(false)} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={() => save({ subject, body })} disabled={busy || !body.trim()} className="btn btn-sm btn-glow">
              {busy ? "Saving…" : "Save for this lead"}
            </button>
          </span>
        )}
        {!editing && (
          <span className="-mt-0.5 flex shrink-0 items-center">
            <button type="button" onClick={() => copy("body")} title={copied === "body" ? "Copied" : isEmail && shownSubject ? "Copy the body" : "Copy the message"} aria-label={isEmail && shownSubject ? "Copy the body" : "Copy the message"} className={ICON}>
              {copied === "body" ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
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

      {adding && cant && !sent && (
        <form onSubmit={addHandle} className="fade-in flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <input
            autoFocus
            value={handle}
            onChange={(e) => (setHandle(e.target.value), setAddError(null))}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            placeholder={ADD_EXAMPLE[cant] ?? ""}
            aria-label={`Add ${ADD_LABEL[cant] ?? "a way to reach them"}`}
            className={`${FIELD} min-w-0 flex-1 text-sm`}
          />
          <button type="button" onClick={() => (setAdding(false), setHandle(""), setAddError(null))} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={busy || !handle.trim()} className="btn btn-sm btn-glow">
            {busy ? "Adding…" : "Add"}
          </button>
          {addError && (
            <p role="alert" className="w-full text-xs text-red-300">
              {addError}
            </p>
          )}
        </form>
      )}

      {editing ? (
        <div className="fade-in flex flex-col gap-2.5 px-4 py-4">
          {isEmail && <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" className={`${FIELD} text-sm font-medium`} />}
          <textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} aria-label={message.name} className={`${FIELD} field-sizing-content min-h-40 resize-none text-sm leading-relaxed`} />
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}
          {(message.channel === "linkedin" || rewritten) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {message.channel === "linkedin" && <Limit channel={message.channel} text={body} />}
              {rewritten && (
                <button type="button" onClick={() => save(null)} disabled={busy} className="flex items-center gap-1 text-muted transition-colors hover:text-foreground">
                  <RotateCcw size={11} /> {written ? "Back to the written message" : "Back to the template"}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div onCopy={isEmail ? copyClean : undefined} className="px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          {/* where it goes out from: the mail tracker's, or picked or typed here (Abhishek, 10 Nov 2026) */}
          {from && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5 whitespace-normal text-foreground">
              <span className="text-muted">From</span>
              <Dropdown
                size="sm"
                value={from.at?.email ?? ""}
                placeholder="Pick an address"
                create
                options={[...new Set([...(from.at ? [from.at.email] : []), ...from.senders])].map((e) => ({ value: e, label: e }))}
                onChange={(v) => from.set(v.trim() || null)}
              />
            </div>
          )}
          {isEmail && shownSubject && (
            <p className="mb-3 flex items-start gap-1.5 text-foreground">
              <span className="min-w-0">
                <span className="text-muted">Subject: </span>
                <span className="font-medium">{sent ? shownSubject : <Filled text={subjectText} vars={vars} />}</span>
              </span>
              <button type="button" onClick={() => copy("subject")} title={copied === "subject" ? "Copied" : "Copy the subject"} aria-label="Copy the subject" className="-my-0.5 grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
                {copied === "subject" ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
              </button>
            </p>
          )}
          <Filled text={sent ? shownBody : source.body} vars={vars} />
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
            {approval.at && <Check size={13} />}
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
              await copyMessage(message.channel === "email" ? `${message.subject ? `Subject: ${message.subject}\n\n` : ""}${marked(message.body)}` : message.body, message.channel === "email");
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
        <div onCopy={message.channel === "email" ? copyClean : undefined} className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
          <Filled text={message.channel === "email" ? marked(message.body) : message.body} vars={{}} template />
        </div>
      </div>
    </div>
  );
}

// A message's text with its variables lit: filled ones in blue, missing
// ones in red, so what still needs typing stands out (in a bare template,
// where nothing is filled yet, every variable is simply blue)
// (its **bold** bold and its [links](https://…) links)
function Filled({ text, vars, template = false }: { text: string; vars: Record<string, string>; template?: boolean }) {
  return marks(text).map((r, j) => {
    const words = <Parts text={r.text} vars={vars} template={template} />;
    return r.bold ? (
      <strong key={j}>{words}</strong>
    ) : r.href ? (
      <a key={j} href={r.href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
        {words}
      </a>
    ) : (
      <Fragment key={j}>{words}</Fragment>
    );
  });
}

function Parts({ text, vars, template }: { text: string; vars: Record<string, string>; template: boolean }) {
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

// an email's words selected and copied by hand: the same clean email as Copy
// gives, not the app's font and colours
function copyClean(e: React.ClipboardEvent) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const walk = (n: Node): string => {
    const inner = () => [...n.childNodes].map(walk).join("");
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? "";
    if (n instanceof HTMLAnchorElement) return `[${inner()}](${n.href})`;
    if (n instanceof HTMLElement && n.tagName === "STRONG") return `**${inner()}**`;
    return inner();
  };
  const text = walk(sel.getRangeAt(0).cloneContents());
  e.preventDefault();
  e.clipboardData.setData("text/plain", plainText(text));
  e.clipboardData.setData("text/html", emailHtml(text));
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
          <Filled text={sent.body} vars={{}} />
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
          <Dropdown pill={{ icon: stage ? <Dot color={stage.color} /> : null }} value={stageId} placeholder="Stage" clearable={false} options={stages.map((s) => ({ value: s.id, label: s.name }))} onChange={setStageId} />
        )}
        <Dropdown
          pill={{ icon: CHANNEL_ICON[channel] ?? CHANNEL_ICON.other }}
          value={channel}
          placeholder="Sent by"
          clearable={false}
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
