"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ChevronRight, CircleChevronDown, Hash, Link2, List, Pencil, SlidersHorizontal, SquareCheck, Trash2, Type, User, Users, type LucideIcon } from "lucide-react";
import { assignLead, deleteLead, getLeadDetails, moveLead, renameField, renameLead, setLeadValue } from "./actions";
import { StagePill } from "./pills";
import { ReasonDialog } from "./ReasonDialog";
import { LeadHistory } from "./LeadHistory";
import { Messages } from "./Messages";
import { CheckboxEditor, ContactsEditor, ContactsView, CountEditor, DateEditor, LinksEditor, Menu, SECTION, SECTION_BODY, SECTION_HEAD, SECTION_TITLE, TagEditor, TextEditor, ValueRead, dateOf } from "./values";
import { EditableName } from "../../EditableName";
import { formatDateTime } from "../../TaskCard";
import { Dropdown } from "../../Dropdown";
import { chip } from "../../chip";
import { closeOnBackdrop } from "../../dialog";
import { isFilled, missingDetails, moveNeedsReason, toneOf, type BoardData, type FieldData, type FieldKind, type LeadData, type LeadEventData, type MarkChange, type Person, type SentData } from "@/lib/space";

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

// a lead moved into a stage goes to the end of it
const lastInStage = () => Date.now();

type Status = "saving" | "saved" | { error: string } | null;

// A lead's window, built like a task's (TaskDetailsDialog): the name and a
// History switch on top; its stage and assignee as chips;
// then everything known about it (details, from Day 1 its opens and replies,
// contacts), and last its messages, day by day; along the bottom, delete,
// who added it, and Close. History slides open beside it. Open while `lead`
// is set; closing calls onClose. Every change saves as it's made.
export function LeadPeek({ lead, board, people, onClose, onTrack }: { lead: LeadData | null; board: BoardData; people: Person[]; canBuild: boolean; onClose: () => void; onTrack: (id: string, change: MarkChange) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // the last lead stays drawn while the window fades out
  const [shown, setShown] = useState(lead);
  if (lead && lead !== shown) setShown(lead);
  const open = !!lead;
  // each opening draws the page afresh, so its editors start from the latest values
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [history, setHistory] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOpens((n) => n + 1);
      setHistory(false);
    }
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
      // the width eases open with the History panel, as a task's does
      className={`dialog-grow glass fixed top-1/2 left-1/2 m-0 max-h-[88vh] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-5 text-foreground ${history ? "w-[63rem]" : "w-[41rem]"}`}
    >
      {shown && (
        <LeadPage key={`${shown.id}:${opens}`} lead={shown} open={open} board={board} people={people} history={history} onHistory={() => setHistory((h) => !h)} close={() => ref.current?.close()} onDeleted={onClose} onTrack={onTrack} />
      )}
    </dialog>
  );
}

function LeadPage({
  lead,
  open,
  board,
  people,
  history,
  onHistory,
  close,
  onDeleted,
  onTrack,
}: {
  lead: LeadData;
  open: boolean;
  board: BoardData;
  people: Person[];
  history: boolean;
  onHistory: () => void;
  close: () => void;
  onDeleted: () => void;
  onTrack: (id: string, change: MarkChange) => void;
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
  const [assignee, setAssignee] = useState(lead.assignedTo?.id ?? "");
  if (lead !== synced) {
    setSynced(lead);
    if (lead.title !== synced.title) setTitle(lead.title);
    if (lead.values !== synced.values && Object.values(pending).some((p) => p.done)) setPending((cur) => Object.fromEntries(Object.entries(cur).filter(([, p]) => !p.done)));
    if (lead.stageId !== synced.stageId) setStageId(lead.stageId);
    if (lead.assignedTo?.id !== synced.assignedTo?.id) setAssignee(lead.assignedTo?.id ?? "");
  }

  const [events, setEvents] = useState<LeadEventData[] | null>(null);
  const [sent, setSent] = useState<SentData[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // a move that needs a reason (kept while its prompt fades out)
  const [move, setMove] = useState<{ to: string; hint: string; asking: boolean }>({ to: "", hint: "", asking: false });
  const [deleting, setDeleting] = useState(false);
  // details and contacts read as plain text until Edit
  const [editDetails, setEditDetails] = useState(false);
  const [editContacts, setEditContacts] = useState(false);

  // the record, and what's been sent, each time it opens
  useEffect(() => {
    if (!open) return;
    let live = true;
    getLeadDetails(id).then((r) => {
      if (!live) return;
      if (r.error) return setStatus({ error: r.error });
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
  function saveValue(fieldId: string, v: unknown) {
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
  }

  function assign(userId: string) {
    const before = assignee;
    setAssignee(userId);
    run(assignLead(id, userId || null), () => setAssignee(before));
  }

  // One stage forward moves at once; anything else asks why first
  const order = board.stages.map((s) => s.id);
  const stage = board.stages.find((s) => s.id === stageId);
  function ask(to: string) {
    const from = order.indexOf(stageId);
    const skipped = order.indexOf(to) - from - 1;
    const hint = skipped < 0 ? "This moves it back. Say why, and it stays on the lead's record." : `This skips ${skipped} ${skipped === 1 ? "stage" : "stages"}. Say why, and it stays on the lead's record.`;
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
  // "day-2" is Day 2; a stage's own key is its name
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

  // what each block says in its heading; read, it shows only what's filled
  const fieldsShown = board.fields.filter((f) => f.kind !== "contacts");
  const filledFields = fieldsShown.filter((f) => isFilled(f.kind, values[f.id]));
  const filled = filledFields.length;
  const contactField = board.fields.find((f) => f.kind === "contacts");
  const contacts = contactField && Array.isArray(values[contactField.id]) ? (values[contactField.id] as unknown[]).length : 0;

  return (
    <>
      {/* the name, as plain text like a task's title, and the History switch */}
      <div className="mb-3 flex shrink-0 items-start gap-3 px-1">
        <textarea
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
          placeholder="Podcast name"
          aria-label="Lead name"
          className="field-sizing-content block min-w-0 flex-1 resize-none bg-transparent text-lg font-medium text-foreground outline-none! placeholder:text-muted/60"
        />
        <button type="button" onClick={onHistory} className="mt-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-foreground">
          <ChevronRight size={13} className={`transition-transform duration-300 ${history ? "rotate-90" : ""}`} />
          History
        </button>
      </div>

      {/* flex-auto, not flex-1: in a dialog with no set height, Safari (the
          Dock app) gives a 0-based flex item no height at all */}
      <div className="flex min-h-0 flex-auto">
        <div className="flex w-[39rem] min-w-0 shrink flex-col gap-4 overflow-y-auto px-1 pb-1">
          {/* its stage and who has it, as chips */}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Menu
                height={340}
                width={280}
                label="Stage"
                buttonClassName={chip(true)}
                button={
                  <>
                    <span className={`size-2 shrink-0 rounded-full ${stage ? toneOf(stage.color).dot : "bg-neutral-400"}`} />
                    <span className="max-w-56 truncate">{stage?.name ?? "No stage"}</span>
                  </>
                }
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
                          {s.id === stageId ? <Check size={13} className="ml-auto shrink-0 text-accent" /> : i === order.indexOf(stageId) + 1 && <span className="ml-auto shrink-0 text-[11px] text-muted">Next</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </Menu>
              <Dropdown
                pill={{ icon: <User size={12} className="text-emerald-400" /> }}
                value={assignee}
                placeholder="Assignee"
                onChange={assign}
                options={[
                  { value: "", label: "Unassigned" },
                  ...people.map((p) => ({ value: p.id, label: p.name })),
                  ...(lead.assignedTo && !people.some((p) => p.id === lead.assignedTo!.id) ? [{ value: lead.assignedTo.id, label: lead.assignedTo.name }] : []),
                ]}
              />
            </div>
            {/* who handed it to whom; every earlier hand-off is in History */}
            {assignee && assignee === lead.assignedTo?.id && lead.assignedByName && (
              <p className="fade-in px-1 text-xs text-muted">
                Assigned to {lead.assignedTo.name} by {lead.assignedByName}
                {lead.assignedAt && <>, {formatDateTime(lead.assignedAt)}</>}
              </p>
            )}
            {missing.length > 0 && <p className="fade-in px-1 text-xs text-muted">To add: {missing.join(", ")}</p>}
          </div>

          {/* everything known about it first */}
          <Section icon={SlidersHorizontal} title="Details" summary={`${filled} of ${fieldsShown.length} filled`} editing={editDetails} onEdit={() => setEditDetails((e) => !e)}>
            {editDetails ? (
              <div key="edit" className="fade-in flex flex-col">
                {fieldsShown.map((f) => (
                  <Row key={f.id} icon={KIND_ICON[f.kind]} label={fieldName(f)}>
                    <Editor field={f} value={values[f.id]} save={(v) => saveValue(f.id, v)} />
                  </Row>
                ))}
              </div>
            ) : (
              filled > 0 && (
                <div key="view" className="fade-in flex flex-col">
                  {filledFields.map((f) => (
                    <Row key={f.id} icon={KIND_ICON[f.kind]} label={f.name}>
                      <ValueRead field={f} value={values[f.id]} />
                    </Row>
                  ))}
                </div>
              )
            )}
          </Section>

          {contactField && (
            <Section icon={Users} title={contactField.name} summary={contacts ? `${contacts} ${contacts === 1 ? "person" : "people"}` : "None yet"} editing={editContacts} onEdit={() => setEditContacts((e) => !e)}>
              {editContacts ? (
                <div key="edit" className="fade-in">
                  <ContactsEditor value={values[contactField.id]} save={(v) => saveValue(contactField.id, v)} />
                </div>
              ) : (
                contacts > 0 && (
                  <div key="view" className="fade-in">
                    <ContactsView value={values[contactField.id]} />
                  </div>
                )
              )}
            </Section>
          )}

          {/* then the messages to send */}
          <Messages lead={{ ...lead, values }} board={board} stageId={stageId} sent={sent} onMark={(c) => onTrack(id, c)} onSaved={saved} />
        </div>

        {/* beside it, the same height: every stage it has been through */}
        <div inert={!history} className={`relative shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${history ? "w-[min(21rem,40vw)] opacity-100" : "w-0 opacity-0"}`}>
          <div className="absolute inset-y-0 left-0 flex w-[min(21rem,40vw)] flex-col gap-2 pl-4">
            <p className="shrink-0 text-xs font-medium text-muted">Every stage and hand-off, in order</p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl panel-soft p-4">{events ? <LeadHistory events={events} flat /> : <p className="text-xs text-muted">Loading the record…</p>}</div>
          </div>
        </div>
      </div>

      {/* along the bottom: delete, who added it, Close */}
      <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-border pt-3">
        <button type="button" onClick={() => setDeleting(true)} aria-label="Delete lead" title="Delete lead" className="shrink-0 rounded-md p-1.5 text-muted hover:text-red-400">
          <Trash2 size={14} />
        </button>
        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {status === "saving" ? (
            "Saving…"
          ) : status === "saved" ? (
            <span className="fade-in inline-flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          ) : status && typeof status === "object" ? (
            <span role="alert" className="text-red-300">
              {status.error}
            </span>
          ) : (
            <>
              Added {dateOf(lead.createdAt)} by {lead.createdBy.name}
              {lead.editedByName && lead.editedAt && (
                <>
                  {" "}
                  · edited by {lead.editedByName}, {formatDateTime(lead.editedAt)}
                </>
              )}
            </>
          )}
        </p>
        <button type="button" onClick={close} className="btn btn-ghost shrink-0">
          Close
        </button>
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
    </>
  );
}

// One property: its name, then its value. Stacked on a phone.
function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid items-start gap-x-3 py-0.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="flex min-h-8 min-w-0 items-center gap-2 px-1 text-xs text-muted">
        <Icon size={14} className="shrink-0" />
        <span className="flex min-w-0">{label}</span>
      </div>
      <div className="flex min-h-8 min-w-0 items-center">{children}</div>
    </div>
  );
}

// A block of the lead: its name, a one-line summary, and Edit (Done while
// editing), on a bar above what's in it
function Section({
  icon: Icon,
  title,
  summary,
  editing,
  onEdit,
  children,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  summary: string;
  editing: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={SECTION}>
      <div className={SECTION_HEAD}>
        <Icon size={14} className="shrink-0 text-muted" />
        <h3 className={SECTION_TITLE}>{title}</h3>
        <span className="ml-auto min-w-0 truncate text-muted">{summary}</span>
        <button type="button" onClick={onEdit} aria-pressed={editing} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted transition-colors hover:bg-hover hover:text-foreground">
          {editing ? <Check size={12} /> : <Pencil size={12} />}
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {children && <div className={SECTION_BODY}>{children}</div>}
    </section>
  );
}

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
