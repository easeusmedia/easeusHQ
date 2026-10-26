"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Building2, CalendarDays, ExternalLink, Inbox, ListChecks, ListTodo } from "lucide-react";
import { PrefetchLink } from "../PrefetchLink";
import { Avatar } from "../TaskCard";
import { DatePicker } from "../DatePicker";
import { ConfirmButton } from "../ConfirmButton";
import { Bone } from "../Skeleton";
import { closeOnBackdrop } from "../dialog";
import { deleteTaskPermanently } from "../actions";
import { STAGE, stageLabel } from "@/lib/stages";
import { spanLabel, windowful } from "@/lib/history";
import { dayOf, daysBetween, shortDay } from "@/lib/editorKpi";
import type { TaskStatus } from "@/lib/workflow";
import { moreCompleted, openTask } from "./actions";
import type { Overview, WorkCard } from "./data";

// arrives with a short fade and lift; still, for anyone who's asked for less motion
const ARRIVE = "motion-safe:animate-[fade-in_0.24s_cubic-bezier(0.22,1,0.36,1)]";
// a row's height: a window's worth of rows is counted in these
const ROW_PX = 36;
// while more remain, the table's last three rows or so fade out into the
// page, with Show more under it (Abhishek, 26 Oct 2026)
const FADE = "[mask-image:linear-gradient(to_bottom,#000_calc(100%_-_7.5rem),transparent)]";

// "3 Oct", with the year when it isn't this one
const THIS_YEAR = dayOf(new Date()).slice(0, 4);
const dayLabel = (ymd: string) => (ymd.startsWith(THIS_YEAR) ? shortDay(ymd) : `${shortDay(ymd)} ${ymd.slice(0, 4)}`);
const day = (iso: string) => dayLabel(dayOf(new Date(iso)));
// "3 Oct, 11:30 AM", in India
const when = (iso: string) => `${day(iso)}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).toUpperCase()}`;

// how many of someone's tasks their card shows, the rest as "+N more"
const SHOWN = 5;

// Turnaround: start to finish, for finished work only (Abhishek, 26 Oct
// 2026: a running count on open work read as a meaningless number)
const turnaround = (card: WorkCard) => (card.end ? spanLabel(Date.parse(card.end) - Date.parse(card.start)) : "–");

// "2 days late" in rose, "Today", or the day; nothing when there's no date
function Due({ due, today }: { due: string | null; today: string }) {
  if (!due) return null;
  const late = due < today ? daysBetween(due, today) : 0;
  return (
    <span className={`flex shrink-0 items-center gap-1 text-xs tabular-nums ${late ? "text-rose-300" : due === today ? "text-foreground" : "text-muted"}`}>
      <CalendarDays size={12} aria-hidden />
      {late ? `${late} ${late === 1 ? "day" : "days"} late` : due === today ? "Today" : dayLabel(due)}
    </span>
  );
}

// Everyone as a card again, with icons (Abhishek, 26 Oct 2026: the table
// read badly; "the icons and the card thing was better"): who they are, how
// many tasks they're on, and those tasks as rows. The card opens their page;
// a task opens its overview right here. The header link stretches over the
// whole card, so it's one link for a keyboard too, and the task rows sit
// above it as their own buttons.
export function PeopleWork({ people, today }: { people: { id: string; name: string; title: string | null; now: WorkCard[] }[]; today: string }) {
  const [open, setOpen] = useState<WorkCard | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const show = (card: WorkCard) => {
    setOpen(card);
    dialog.current?.showModal();
  };
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {people.map((p) => {
          const n = p.now.length;
          const count = `${n} current ${n === 1 ? "task" : "tasks"}`;
          return (
            <div
              key={p.id}
              className={`relative flex min-w-0 flex-col gap-4 rounded-2xl panel-soft panel-hover p-4 motion-safe:hover:-translate-y-0.5 ${ARRIVE}`}
            >
              <PrefetchLink
                href={`/team-work?person=${p.id}`}
                className="flex min-w-0 items-center gap-3 outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-accent/60"
              >
                <Avatar name={p.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-6">{p.name}</span>
                  {p.title && <span className="block truncate text-xs text-muted">{p.title}</span>}
                </span>
                <span title={count} className={`relative z-[1] flex shrink-0 items-center gap-1.5 text-sm tabular-nums ${n ? "text-foreground" : "text-muted"}`}>
                  <ListChecks size={15} aria-hidden className={n ? "text-accent" : "text-muted"} />
                  {n}
                  <span className="sr-only"> current {n === 1 ? "task" : "tasks"}</span>
                </span>
              </PrefetchLink>

              {n === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Inbox size={14} aria-hidden /> Nothing on now
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <ListTodo size={13} aria-hidden /> Current tasks
                  </p>
                  <ul className="divide-y divide-border">
                    {p.now.slice(0, SHOWN).map((c) => (
                      <li key={c.kind + c.id}>
                        <button
                          type="button"
                          onClick={() => show(c)}
                          className="relative z-[1] -mx-2 flex w-[calc(100%+1rem)] min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{c.title}</span>
                            {/* the client it's for; nothing for anything else (Abhishek, 26 Oct 2026) */}
                            {c.client && (
                              <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted">
                                <Building2 size={11} aria-hidden className="shrink-0" />
                                <span className="truncate">{c.client}</span>
                              </span>
                            )}
                          </span>
                          <Due due={c.due} today={today} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {n > SHOWN && <p className="text-xs text-muted">+{n - SHOWN} more</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <TaskDialog dialog={dialog} card={open} canDelete={false} />
    </>
  );
}

type Tab = "current" | "completed";

// One person's work as two lists (Abhishek, 26 Oct 2026): what they're on
// now, and everything they've finished, a window's worth at a time and
// narrowed to a range of days if wanted. The tab goes in the address
// (?tab=), so a link opens it and Back works. Any row opens the task's
// overview, where its stages are.
export function PersonWork({
  person,
  current,
  completed,
  today,
  canDelete,
}: {
  person: { id: string; name: string; title: string | null };
  current: WorkCard[];
  // how many they've finished in all, until the list itself is read
  completed: number;
  today: string;
  canDelete: boolean;
}) {
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "completed" ? "completed" : "current";
  const [range, setRange] = useState({ from: "", to: "" });
  const [done, setDone] = useState<WorkCard[] | null>(null);
  const [total, setTotal] = useState(completed);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<WorkCard | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const tablist = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  // The line under the open tab, slid across when the tab changes; put in
  // place without sliding the first time
  useLayoutEffect(() => {
    const place = () => {
      const on = tablist.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      const line = bar.current;
      if (!on || !line) return;
      line.style.width = `${on.offsetWidth}px`;
      line.style.transform = `translateX(${on.offsetLeft}px)`;
      void line.offsetWidth;
      line.dataset.ready = "";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [tab, total, current.length]);

  // Finished work is read once Completed tasks is first opened, so the first
  // page is the rows that fit under the list's top; again whenever the range
  // changes
  const wanted = tab === "completed" || done !== null;
  useEffect(() => {
    if (!wanted) return;
    const top = list.current?.getBoundingClientRect().top ?? 0;
    let live = true;
    moreCompleted(person.id, range, 0, windowful(window.innerHeight - top, ROW_PX)).then((r) => {
      if (!live || !r) return;
      setDone(r.cards);
      setTotal(r.total);
    });
    return () => {
      live = false;
    };
  }, [person.id, range, wanted]);

  // A new range starts the list again: cleared to its skeleton, so Show more
  // can't page the old list against the new range, and a Show more still on
  // its way for the old range is dropped when it lands
  const asked = useRef(0);
  const pick = (next: typeof range) => {
    asked.current++;
    setDone(null);
    setRange(next);
  };

  async function showMore() {
    if (!done) return;
    const at = asked.current;
    setLoadingMore(true);
    const r = await moreCompleted(person.id, range, done.length, windowful(window.innerHeight, ROW_PX));
    setLoadingMore(false);
    if (!r || at !== asked.current) return;
    setDone((d) => [...(d ?? []), ...r.cards.filter((c) => !d?.some((x) => x.id === c.id))]);
    setTotal(r.total);
  }

  const show = (card: WorkCard) => {
    setOpen(card);
    dialog.current?.showModal();
  };

  // Next keeps its router in step with pushState: a real history entry, no
  // round trip.
  const go = (next: Tab) => {
    if (next === tab) return;
    const q = new URLSearchParams(params);
    if (next === "completed") q.set("tab", "completed");
    else q.delete("tab");
    window.history.pushState(null, "", `?${q.toString()}`);
  };

  // named plainly (Abhishek, 26 Oct 2026)
  const tabs = [
    { key: "current", label: "Current tasks", n: current.length },
    { key: "completed", label: "Completed tasks", n: total },
  ] as const;
  const more = !!done && done.length < total;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PrefetchLink href="/team-work" className="flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground">
          <ArrowLeft size={14} /> Team work
        </PrefetchLink>
        <div className="flex items-center gap-4">
          <span className="shrink-0 rounded-full ring-1 ring-white/10 ring-offset-2 ring-offset-surface">
            <Avatar name={person.name} size={56} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{person.name}</h1>
            {person.title && <p className="mt-0.5 truncate text-sm text-muted">{person.title}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* plain text tabs on a hairline, the open one underlined */}
        <div ref={tablist} role="tablist" aria-label="Work" className="relative flex gap-6 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => go(t.key)}
              className={`flex items-baseline gap-1.5 whitespace-nowrap pb-2.5 text-sm font-medium transition-colors ${tab === t.key ? "text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {t.label}
              <span className="text-xs font-normal tabular-nums text-muted">{t.n}</span>
            </button>
          ))}
          <span
            ref={bar}
            aria-hidden
            className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-0 rounded-full bg-accent data-ready:motion-safe:transition-[transform,width] data-ready:motion-safe:duration-300 data-ready:motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </div>

        {tab === "current" ? (
          <section key="current" role="tabpanel" className={ARRIVE}>
            {current.length === 0 ? (
              <Empty text="Nothing on now" />
            ) : (
              <Table heads={["Task", "Started", "Due"]}>
                {current.map((c) => (
                  <CurrentRow key={c.kind + c.id} card={c} today={today} onOpen={() => show(c)} />
                ))}
              </Table>
            )}
          </section>
        ) : (
          <section key="completed" role="tabpanel" className={`flex flex-col gap-3 ${ARRIVE}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              {/* how many in the range, or in all; held at its height until it's known */}
              <p className="text-sm tabular-nums text-muted">{done ? `${total} completed` : " "}</p>
              <div className="flex items-center gap-2">
                <div className="w-36">
                  <DatePicker size="sm" value={range.from} onChange={(from) => pick({ ...range, from })} placeholder="From" />
                </div>
                <span className="text-xs text-muted">to</span>
                <div className="w-36">
                  <DatePicker size="sm" value={range.to} onChange={(to) => pick({ ...range, to })} placeholder="To" />
                </div>
              </div>
            </div>
            {done?.length === 0 ? (
              <Empty text={range.from || range.to ? "Nothing completed in these dates" : "No completed tasks"} />
            ) : (
              <div ref={list}>
                {done ? (
                  <Table heads={["Task", "Started", "Finished", "Turnaround"]} fade={more}>
                    {done.map((c) => (
                      // each row eases in as it's added
                      <Row key={c.kind + c.id} card={c} onOpen={() => show(c)} className={ARRIVE}>
                        <Cell>{day(c.start)}</Cell>
                        <Cell>{c.end ? day(c.end) : "–"}</Cell>
                        <Cell tone={c.late ? "text-red-300" : undefined}>{turnaround(c)}</Cell>
                      </Row>
                    ))}
                  </Table>
                ) : (
                  <ListBones />
                )}
              </div>
            )}
            {/* words, not a button's look, and never faded with the rows */}
            {more && (
              <button
                type="button"
                onClick={showMore}
                disabled={loadingMore}
                className="self-center px-2 py-1 text-sm text-muted transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted"
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            )}
          </section>
        )}
      </div>

      <TaskDialog
        dialog={dialog}
        card={open}
        canDelete={canDelete}
        onDeleted={(gone) => {
          setDone((d) => d?.filter((c) => c.id !== gone.id) ?? d);
          setTotal((t) => Math.max(0, t - 1));
        }}
      />
    </div>
  );
}

// The task's overview window, the same from the people list and a person's
// page. The task stays in it after it closes, so it fades out with its
// content in it.
function TaskDialog({
  dialog,
  card,
  canDelete,
  onDeleted,
}: {
  dialog: React.RefObject<HTMLDialogElement | null>;
  card: WorkCard | null;
  canDelete: boolean;
  onDeleted?: (card: WorkCard) => void;
}) {
  return (
    <dialog
      ref={dialog}
      {...closeOnBackdrop}
      className="glass fixed top-1/2 left-1/2 m-0 max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 text-foreground"
    >
      {card && (
        <TaskOverview
          key={card.kind + card.id}
          card={card}
          canDelete={canDelete}
          close={() => dialog.current?.close()}
          onDeleted={() => {
            onDeleted?.(card);
            dialog.current?.close();
          }}
        />
      )}
    </dialog>
  );
}

function Empty({ text }: { text: string }) {
  return <p className={`rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted ${ARRIVE}`}>{text}</p>;
}

// The old History table's look (Abhishek, 26 Oct 2026: "the way you did it
// previously was way better"): one bordered box, a small muted header,
// hairline rows. On a narrow screen the box scrolls sideways, not the page.
function Table({ heads, fade = false, children }: { heads: string[]; fade?: boolean; children: React.ReactNode }) {
  return (
    <div className={`overflow-x-auto rounded-xl panel-soft ${fade ? FADE : ""}`}>
      <table className="w-full text-left text-sm">
        <thead className="bg-white/[0.03] text-muted">
          <tr>
            {heads.map((h, i) => (
              <th key={h} className={`whitespace-nowrap px-3 py-2 font-medium ${i ? "w-32" : "min-w-48"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// One task: its title, and the client it's for (if it's for one) after it, as
// History had it; then its dates. The whole row opens it; the title is a
// button so a keyboard can too.
function Row({ card, onOpen, className = "", children }: { card: WorkCard; onOpen: () => void; className?: string; children: React.ReactNode }) {
  return (
    <tr onClick={onOpen} className={`cursor-pointer border-t border-border transition-colors hover:bg-white/[0.04] ${className}`}>
      <td className="px-3 py-2">
        <button type="button" className="text-left">
          {card.title}
        </button>
        {card.client && <span className="ml-2 text-xs text-muted">{card.client}</span>}
      </td>
      {children}
    </tr>
  );
}

// A task still open: when it started, and its due day, rose once that's passed
function CurrentRow({ card, today, onOpen }: { card: WorkCard; today: string; onOpen: () => void }) {
  return (
    <Row card={card} onOpen={onOpen}>
      <Cell>{day(card.start)}</Cell>
      <Cell tone={card.due && card.due < today ? "text-red-300" : undefined}>{card.due ? dayLabel(card.due) : "–"}</Cell>
    </Row>
  );
}

function Cell({ tone = "text-muted", children }: { tone?: string; children: React.ReactNode }) {
  return <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${tone}`}>{children}</td>;
}

// A list on its way: plain lines in the table's box
export function ListBones({ n = 6 }: { n?: number }) {
  return (
    <div className="overflow-hidden rounded-xl panel-soft">
      <div className="flex h-9 items-center bg-white/[0.03] px-3">
        <Bone className="h-3 w-20" />
      </div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex h-9 items-center gap-6 border-t border-border px-3">
          <Bone className={`h-3.5 ${i % 3 === 0 ? "w-1/2" : i % 3 === 1 ? "w-2/5" : "w-1/3"}`} />
          <Bone className="ml-auto h-3 w-14 shrink-0" />
          <Bone className="h-3 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-5">
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">{text}</p>
    </div>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost flex items-center gap-1.5">
      {label} <ExternalLink size={11} />
    </a>
  );
}

// The task, opened, read from the server as it opens. Client work: every
// stage it went through, who moved it and how long it stayed, its delivered
// file, its notes. A to-do: who made it and when, its due date and each time
// that moved and why, its notes and links. Finished work can be deleted for
// good by whoever could on History, with the same confirmation.
function TaskOverview({ card, canDelete, close, onDeleted }: { card: WorkCard; canDelete: boolean; close: () => void; onDeleted: () => void }) {
  // undefined while it's on the way; null if it's gone
  const [data, setData] = useState<Overview | null | undefined>(undefined);
  const { kind, id } = card;
  useEffect(() => {
    let live = true;
    openTask({ kind, id }).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [kind, id]);

  const facts =
    data?.kind === "task"
      ? [
          ["Started", day(card.start)],
          ["Finished", card.end ? day(card.end) : "Not yet"],
          ["Turnaround", turnaround(card)],
          ["Due", data.due ? dayLabel(data.due) : "No date"],
        ]
      : data?.kind === "work"
        ? [
            ["Created by", data.createdBy ?? "–"],
            ["Created on", day(data.createdAt)],
            ["Due", data.due ? dayLabel(data.due) : "No date"],
            ["Completed on", card.end ? day(card.end) : "Not yet"],
          ]
        : [];

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{card.title}</h2>
          <p className="mt-0.5 text-xs text-muted">{card.where}</p>
        </div>
        {card.stage && <span className={`shrink-0 rounded-full border px-2 py-px text-xs font-medium ${card.stage.pill}`}>{card.stage.label}</span>}
      </div>

      {data === undefined ? (
        <p className="mt-4 text-xs text-muted">Loading…</p>
      ) : data === null ? (
        <p className="mt-4 text-sm text-muted">This task no longer exists.</p>
      ) : (
        // eases open downward as it arrives, rather than the window jumping
        <div className="open-down">
          <div className="min-h-0 overflow-hidden">
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {facts.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="truncate text-sm tabular-nums">{value}</p>
                  <p className="text-xs text-muted">{label}</p>
                </div>
              ))}
            </div>

            {data.kind === "task" ? (
              <>
                {data.drive && (
                  <div className="mt-5 flex">
                    <LinkButton label="Final Drive" url={data.drive} />
                  </div>
                )}
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium text-muted">Stages</p>
                  <ol className="panel-soft flex flex-col rounded-xl p-4">
                    {data.phases.map((p, i) => {
                      const stage = STAGE[p.stage as TaskStatus];
                      const last = i === data.phases.length - 1;
                      return (
                        <li key={i} className={`relative flex gap-3 ${last ? "" : "pb-4"}`}>
                          {/* the line on to the next stage */}
                          {!last && <span className="absolute bottom-0 left-[9px] top-6 w-px bg-gradient-to-b from-white/15 to-white/[0.04]" />}
                          <span className={`relative mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border ${stage?.pill ?? "border-white/15 bg-white/[0.04]"}`}>
                            <span className={`size-1.5 rounded-full ${stage?.dot ?? "bg-white/40"}`} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <span className={`inline-flex rounded-full border px-2 py-px text-xs font-medium ${stage?.pill ?? "border-border"}`}>
                                {stage ? stageLabel(p.stage as TaskStatus, data.workflow) : p.stage}
                              </span>
                              {p.ms !== null && (
                                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted">
                                  {spanLabel(p.ms)}
                                  {last && " so far"}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                              <span className="shrink-0 tabular-nums">{when(p.at)}</span>
                              {p.by ? (
                                <>
                                  <span>·</span>
                                  {p.by !== "Notion" && <Avatar name={p.by} size={16} presence={false} />}
                                  <span className="truncate">{p.by}</span>
                                </>
                              ) : (
                                <span>· Created</span>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                {data.notes && <Note label="Brief" text={data.notes} />}
                {data.reviewNotes && <Note label="Last revision note" text={data.reviewNotes} />}
              </>
            ) : (
              <>
                {data.dates.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-medium text-muted">Due date changes</p>
                    <ul className="flex flex-col gap-2">
                      {data.dates.map((d, i) => (
                        <li key={i} className="rounded-xl border border-border/70 bg-white/[0.02] px-3 py-2.5">
                          <p className="text-sm">
                            {/* the same date both sides: done already, ticked off late (FrozenTasks) */}
                            {d.from && d.from === d.to
                              ? "Ticked off late"
                              : d.to
                                ? `${d.from ? `Moved from ${day(d.from)} to` : "Set to"} ${day(d.to)}`
                                : "Due date removed"}
                          </p>
                          {d.reason && <p className="mt-0.5 text-sm text-muted">{d.reason}</p>}
                          <p className="mt-1 text-xs text-muted">
                            {d.by}, {when(d.at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.notes && <Note label="Notes" text={data.notes} />}
                {data.links.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-medium text-muted">Links</p>
                    <div className="flex flex-wrap gap-2">
                      {data.links.map((l) => (
                        <LinkButton key={l.label + l.url} label={l.label} url={l.url} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        {canDelete && card.end ? (
          <ConfirmButton
            message={`Delete "${card.title}"? This can't be undone.`}
            className="text-xs text-muted transition-colors hover:text-red-400"
            onConfirm={async () => {
              const res = await deleteTaskPermanently(card.id, card.kind === "work" ? "internal" : "client");
              if (!res.error) onDeleted();
            }}
          >
            Delete
          </ConfirmButton>
        ) : (
          <span />
        )}
        <button type="button" onClick={close} className="btn btn-ghost">
          Close
        </button>
      </div>
    </>
  );
}
