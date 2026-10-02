"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  CircleChevronDown,
  CircleDashed,
  Clock,
  FileText,
  Hash,
  History,
  Hourglass,
  Link2,
  List,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  SquareCheck,
  Trash2,
  Type,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { deleteLead, getLeadDetails, moveLead, renameField, renameLead, setLeadNotes, setLeadValue } from "./actions";
import { StagePill } from "./pills";
import { ReasonDialog } from "./ReasonDialog";
import { LeadHistory } from "./LeadHistory";
import { Messages } from "./Messages";
import { CELL, CheckboxEditor, ContactsEditor, CountEditor, DateEditor, LinksEditor, Menu, TagEditor, TextEditor, dateOf } from "./values";
import { EditableName } from "../../EditableName";
import { Avatar, formatDateTime } from "../../TaskCard";
import { closeOnBackdrop } from "../../dialog";
import {
  daysSince,
  isFilled,
  missingDetails,
  moveNeedsReason,
  type BoardData,
  type FieldData,
  type FieldKind,
  type LeadData,
  type LeadEventData,
  type SentData,
} from "@/lib/space";

const KIND_ICON: Record<FieldKind, LucideIcon> = {
  select: CircleChevronDown,
  multi: List,
  count: Hash,
  contacts: Users,
  links: Link2,
  checkbox: SquareCheck,
  date: CalendarDays,
  text: Type,
};
const ICON_BTN = "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";

// a lead moved into a stage goes to the end of it
const lastInStage = () => Date.now();

type Status = "saving" | "saved" | { error: string } | null;

// A lead as a page, the way Notion opens one: its name, every property as
// a row, its contacts, the write-up and its record. Open while `lead` is
// set; closing (Escape, the backdrop, the ×) calls onClose.
export function LeadPeek({
  lead,
  board,
  onClose,
}: {
  lead: LeadData | null;
  board: BoardData;
  canBuild: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // the last lead stays drawn while the window fades out
  const [shown, setShown] = useState(lead);
  if (lead && lead !== shown) setShown(lead);
  const open = !!lead;
  // each opening draws the page afresh, so its editors start from the latest values
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpens((n) => n + 1);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      // only its own closing: a reason prompt inside it closing reaches here too
      onClose={(e) => e.target === e.currentTarget && open && onClose()}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(58rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-0 text-foreground"
    >
      {shown && <LeadPage key={`${shown.id}:${opens}`} lead={shown} open={open} board={board} close={() => ref.current?.close()} onDeleted={onClose} />}
    </dialog>
  );
}

function LeadPage({
  lead,
  open,
  board,
  close,
  onDeleted,
}: {
  lead: LeadData;
  open: boolean;
  board: BoardData;
  close: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const id = lead.id;

  // What's shown changes at once on an edit, then settles to the board's
  // own copy when it refreshes. Each part follows the board only when the
  // board's copy of it actually changed.
  const [synced, setSynced] = useState(lead);
  const [title, setTitle] = useState(lead.title);
  // property edits not yet on the board's copy: shown over it until a
  // refresh after their save lands, so one save's refresh never flickers another
  const [pending, setPending] = useState<Record<string, { v: unknown; done: boolean }>>({});
  const [stageId, setStageId] = useState(lead.stageId);
  if (lead !== synced) {
    setSynced(lead);
    if (lead.title !== synced.title) setTitle(lead.title);
    if (lead.values !== synced.values && Object.values(pending).some((p) => p.done))
      setPending((cur) => Object.fromEntries(Object.entries(cur).filter(([, p]) => !p.done)));
    if (lead.stageId !== synced.stageId) setStageId(lead.stageId);
  }

  const [notes, setNotes] = useState<string | null>(null);
  const savedNotes = useRef("");
  const [events, setEvents] = useState<LeadEventData[] | null>(null);
  const [sent, setSent] = useState<SentData[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // a move that needs a reason (kept while its prompt fades out)
  const [move, setMove] = useState<{ to: string; hint: string; asking: boolean }>({ to: "", hint: "", asking: false });
  const [deleting, setDeleting] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  // the write-up and the record, each time it opens
  useEffect(() => {
    if (!open) return;
    let live = true;
    getLeadDetails(id).then((r) => {
      if (!live) return;
      if (r.error) return setStatus({ error: r.error });
      savedNotes.current = r.notes ?? "";
      setNotes(r.notes ?? "");
      setEvents(r.events ?? []);
      setSent(r.sent ?? []);
    });
    return () => {
      live = false;
    };
  }, [id, open]);

  // after any save: say so, show the new line on the record, refresh the board
  function saved() {
    clearTimeout(statusTimer.current);
    setStatus("saved");
    statusTimer.current = setTimeout(() => setStatus((s) => (s === "saved" ? null : s)), 2000);
    getLeadDetails(id).then((r) => r.events && setEvents(r.events));
    router.refresh();
  }
  async function run<T extends { error?: string }>(work: Promise<T>, undo?: () => void): Promise<T> {
    clearTimeout(statusTimer.current);
    setStatus("saving");
    // a dropped connection, or a deploy since this page loaded
    const res = await work.catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }) as T);
    if (res.error) {
      undo?.();
      setStatus({ error: res.error });
    } else saved();
    return res;
  }

  function saveTitle() {
    const next = title.trim().replace(/\s+/g, " ");
    if (!next) return setTitle(lead.title);
    if (next !== lead.title) run(renameLead(id, next), () => setTitle(lead.title));
  }

  const values: Record<string, unknown> = { ...lead.values };
  for (const [f, p] of Object.entries(pending)) {
    if (p.v == null) delete values[f];
    else values[f] = p.v;
  }
  const saveValue = (fieldId: string) => (v: unknown) => {
    setPending((cur) => ({ ...cur, [fieldId]: { v, done: false } }));
    run(setLeadValue(id, fieldId, v), () =>
      setPending((cur) => {
        const next = { ...cur };
        delete next[fieldId];
        return next;
      }),
    ).then((r) => {
      if (!r.error) setPending((cur) => (cur[fieldId]?.v === v ? { ...cur, [fieldId]: { v, done: true } } : cur));
    });
  };

  function saveNotes() {
    if (notes == null || notes === savedNotes.current) return;
    const text = notes;
    run(setLeadNotes(id, text)).then((r) => {
      if (!r.error) savedNotes.current = text;
    });
  }

  // One stage forward moves at once; anything else asks why first
  const order = board.stages.map((s) => s.id);
  const stage = board.stages.find((s) => s.id === stageId);
  function ask(to: string) {
    const from = order.indexOf(stageId);
    const skipped = order.indexOf(to) - from - 1;
    const hint =
      skipped < 0
        ? "This moves it back. Say why, and it stays on the lead's record."
        : `This skips ${skipped} ${skipped === 1 ? "stage" : "stages"}. Say why, and it stays on the lead's record.`;
    setMove({ to, hint, asking: true });
  }
  async function pickStage(to: string) {
    if (to === stageId) return;
    if (moveNeedsReason(order, stageId, to)) return ask(to);
    const from = stageId;
    setStageId(to);
    const res = await run(moveLead(id, to, lastInStage()), () => setStageId(from));
    // the board changed under it since it loaded: ask after all
    if (res.needsReason) {
      setStatus(null);
      ask(to);
    }
  }


  const missing = missingDetails(board.fields, values);
  const inStage = daysSince(lead.stageSince);
  const fieldName = (f: FieldData) => (
    <EditableName
      name={f.name}
      pencil="hover"
      onSave={async (name) => {
        const res = await renameField(f.id, name);
        if (res.error) return res.error;
        router.refresh();
      }}
    />
  );

  return (
    <div className="flex max-h-[88vh] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 py-2 pr-3 pl-5 sm:pl-6">
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{board.name}</span>
        {status === "saving" && <span className="shrink-0 text-[11px] text-muted">Saving…</span>}
        {status === "saved" && (
          <span className="fade-in flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <Check size={12} /> Saved
          </span>
        )}
        {status && typeof status === "object" && (
          <span role="alert" className="fade-in min-w-0 text-right text-xs text-red-300">
            {status.error}
          </span>
        )}
        <Menu height={48} width={200} align="end" popup="menu" label="More" buttonClassName={ICON_BTN} button={<MoreHorizontal size={16} />}>
          {(closeMenu) => (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                setDeleting(true);
              }}
              className="menu-item px-2.5 py-2 text-xs text-rose-300! hover:text-rose-200!"
            >
              <Trash2 size={14} /> Delete lead
            </button>
          )}
        </Menu>
        <button type="button" onClick={close} aria-label="Close" title="Close" className={ICON_BTN}>
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-7 pb-8 sm:px-10">
        {/* the name, renamed in place; the pencil says so and focuses it */}
        <div className="group/title flex items-start gap-2">
        <textarea
          ref={titleRef}
          rows={1}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Untitled lead"
          aria-label="Lead name"
          className="field-sizing-content block w-full resize-none bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none! placeholder:text-muted/50"
        />
          <button type="button" onClick={() => titleRef.current?.focus()} aria-label="Rename lead" title="Rename" className="mt-2 shrink-0 rounded-md p-1 text-muted opacity-45 transition-opacity group-hover/title:opacity-100 hover:text-foreground">
            <Pencil size={14} />
          </button>
        </div>
        {missing.length > 0 && (
          <p className="fade-in mt-1.5 flex items-center gap-2 text-xs text-amber-200/80">
            <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
            Basic details to fill: {missing.join(", ")}
          </p>
        )}

        <div className="mt-6 flex flex-col">
          <Row icon={CircleDashed} label="Stage">
            <Menu
              height={340}
              width={260}
              className="w-full min-w-0"
              buttonClassName={CELL}
              button={stage ? <StagePill name={stage.name} color={stage.color} /> : <span className="text-sm text-muted/50">Empty</span>}
            >
              {(closeMenu) => (
                <>
                  <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-muted/80">One stage forward moves at once. Anything else asks why.</p>
                  <div className="max-h-72 overflow-y-auto">
                    {board.stages.map((s, i) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          closeMenu();
                          pickStage(s.id);
                        }}
                        className="menu-item px-2 py-1.5 text-xs"
                      >
                        <StagePill name={s.name} color={s.color} />
                        {s.id === stageId ? (
                          <Check size={13} className="ml-auto shrink-0 text-accent" />
                        ) : (
                          i === order.indexOf(stageId) + 1 && <span className="ml-auto shrink-0 text-[11px] text-muted">Next</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Menu>
          </Row>

          {board.fields
            .filter((f) => f.kind !== "contacts")
            .map((f) => (
              <Row key={f.id} icon={KIND_ICON[f.kind]} label={fieldName(f)} missing={f.required && !isFilled(f.kind, values[f.id])}>
                <Editor field={f} value={values[f.id]} save={saveValue(f.id)} />
              </Row>
            ))}

          <Row icon={UserRound} label="Added by">
            <span className="flex items-center gap-2 px-2 text-sm text-foreground/80">
              <Avatar name={lead.createdBy.name} size={18} presence={false} />
              {lead.createdBy.name} · <span className="text-muted">{dateOf(lead.createdAt)}</span>
            </span>
          </Row>
          {lead.editedByName && lead.editedAt && (
            <Row icon={Clock} label="Last edited">
              <span className="px-2 text-sm text-foreground/80">
                {lead.editedByName} · <span className="text-muted">{formatDateTime(lead.editedAt)}</span>
              </span>
            </Row>
          )}
          <Row icon={Hourglass} label="In stage since">
            <span className="px-2 text-sm text-foreground/80">
              {dateOf(lead.stageSince)} · <span className="text-muted">{inStage === 0 ? "today" : `${inStage} ${inStage === 1 ? "day" : "days"}`}</span>
            </span>
          </Row>
        </div>

        {/* contacts are what the outreach runs on, so they get the width */}
        {board.fields
          .filter((f) => f.kind === "contacts")
          .map((f) => (
            <Section key={f.id} icon={Users} title={fieldName(f)} missing={f.required && !isFilled(f.kind, values[f.id])}>
              <ContactsEditor value={values[f.id]} save={saveValue(f.id)} />
            </Section>
          ))}

        <Section icon={MessagesSquare} title="Messages">
          <Messages lead={{ ...lead, values }} board={board} stageId={stageId} sent={sent} onSent={setSent} onSaved={saved} />
        </Section>

        <Section icon={FileText} title="Write-up">
          <textarea
            value={notes ?? ""}
            disabled={notes === null}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder={notes === null ? "Loading…" : "What the show does, the gap you spotted, message drafts…"}
            aria-label="Write-up"
            className="field-sizing-content block min-h-28 w-full resize-none rounded-xl border border-border/60 bg-white/[0.02] px-4 py-3 text-sm leading-relaxed text-foreground/90 outline-none transition-colors placeholder:text-muted/50 focus:border-hover disabled:opacity-60"
          />
        </Section>

        <Section icon={History} title="History">
          {events ? <LeadHistory events={events} /> : <p className="px-1 text-xs text-muted">Loading the record…</p>}
        </Section>

        <p className="mt-10 border-t border-border/50 pt-4 text-xs text-muted">
          Added by {lead.createdBy.name} on {dateOf(lead.createdAt)}
        </p>
      </div>

      <ReasonDialog
        open={move.asking}
        title={`Move to ${board.stages.find((s) => s.id === move.to)?.name ?? "that stage"}?`}
        hint={move.hint}
        confirm="Move"
        placeholder="Why is it moving?"
        onCancel={() => setMove((m) => ({ ...m, asking: false }))}
        onConfirm={async (reason) => {
          const res = await moveLead(id, move.to, lastInStage(), reason);
          if (res.error) return res.error;
          setStageId(move.to);
          setMove((m) => ({ ...m, asking: false }));
          saved();
        }}
      />
      <ReasonDialog
        open={deleting}
        danger
        title={`Delete “${lead.title}”?`}
        hint="Its record is kept with what was deleted, and it can be put back."
        confirm="Delete lead"
        onCancel={() => setDeleting(false)}
        onConfirm={async (reason) => {
          const res = await deleteLead(id, reason);
          if (res.error) return res.error;
          setDeleting(false);
          onDeleted();
          router.refresh();
        }}
      />
    </div>
  );
}

// One property: its name (with an amber dot while a basic detail is
// empty), then its value. Stacked on a phone.
function Row({ icon: Icon, label, missing = false, children }: { icon: LucideIcon; label: React.ReactNode; missing?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-start gap-x-3 py-0.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex min-h-8 min-w-0 items-center gap-2 px-1 text-xs text-muted">
        <Icon size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
        {missing && <Dot />}
      </div>
      <div className="flex min-h-8 min-w-0 items-center">{children}</div>
    </div>
  );
}

function Section({ icon: Icon, title, missing = false, children }: { icon: LucideIcon; title: React.ReactNode; missing?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-2.5 flex items-center gap-2 px-1 text-xs font-medium text-muted">
        <Icon size={14} className="shrink-0" />
        {title}
        {missing && <Dot />}
      </h3>
      {children}
    </section>
  );
}

const Dot = () => <span title="Basic detail" aria-label="Basic detail, still empty" className="size-1.5 shrink-0 rounded-full bg-amber-400" />;

function Editor({ field, value, save }: { field: FieldData; value: unknown; save: (v: unknown) => void }) {
  switch (field.kind) {
    case "select":
    case "multi":
      return <TagEditor field={field} value={value} save={save} />;
    case "count":
      return <CountEditor value={value} save={save} />;
    case "contacts":
      return <ContactsEditor value={value} save={save} />;
    case "links":
      return <LinksEditor value={value} save={save} />;
    case "checkbox":
      return <CheckboxEditor field={field} value={value} save={save} />;
    case "date":
      return <DateEditor value={value} save={save} />;
    case "text":
      return <TextEditor value={value} save={save} />;
  }
}
