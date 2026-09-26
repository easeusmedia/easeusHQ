"use client";

import { useRef } from "react";
import { NotesButton } from "./NotesButton";
import { useOnline, usePhoto } from "./photos";
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import { StatusSelect } from "./StatusSelect";
import { availableStatuses, type Role, type TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { colorFor, initials } from "@/lib/avatar";
import { CalendarClock, RotateCcw, EyeOff } from "lucide-react";
import { TaskTagChip, type TaskTagOption } from "./TaskTagPicker";
import { dueState } from "@/lib/due";

// kept as re-exports so the existing call sites don't all have to change —
// STAGE in @/lib/stages is the single definition
export const STATUS_LABEL = Object.fromEntries(
  Object.entries(STAGE).map(([k, v]) => [k, v.label])
) as Record<TaskStatus, string>;
export const STATUS_STYLE = Object.fromEntries(
  Object.entries(STAGE).map(([k, v]) => [k, v.pill])
) as Record<TaskStatus, string>;

// columns/actions that need one extra piece of info before landing there —
// collected inline (button click reveals the field) rather than shown
// up front on every card
export const EXTRA_FIELD: Partial<Record<TaskStatus, { field: "frameioLink" | "driveLink" | "reviewNotes"; label: string; placeholder: string }>> = {
  sent_for_approval: { field: "frameioLink", label: "Frame.io link", placeholder: "https://f.io/…" },
  // the client reviews on Frame.io too — prefilled with the cut already on
  // file, so this is usually just a confirm, but never skipped
  sent_for_client_approval: { field: "frameioLink", label: "Frame.io link", placeholder: "https://f.io/…" },
  // no extra prompt for revision_requested — the change notes already live
  // on the Frame.io comment thread, no need to duplicate them here
  delivered_and_uploaded: { field: "driveLink", label: "Final Drive link", placeholder: "https://drive.google.com/…" },
};

// which single link matters most on the card depends on where the task is
// in the workflow — the raw footage while it's being cut, the Frame.io
// thread while it's under review, the final export once it's ready to hand
// off — showing all of them at once regardless of stage was just noise
export const STATUS_LINK = Object.fromEntries(Object.entries(STAGE).map(([k, v]) => [k, v.link])) as Record<
  TaskStatus,
  { field: "rawLink" | "frameioLink" | "driveLink"; label: string }
>;

// Shifted to IST (UTC+5:30, fixed — India has no DST) with fixed-offset math
// rather than Intl/toLocaleString, so this stays deterministic regardless of
// the server's or browser's own timezone/locale — using either of those
// would risk a server-render vs client-hydration mismatch. Everyone on the
// team is in India, so IST (not UTC) is what "today" and "9am" should mean;
// showing raw UTC put dates a day behind whenever it was evening in India.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(d: Date | string): Date {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS);
}

// DD/MM/YYYY — the team's own convention, not the US MM/DD/YYYY one.
export function formatDate(d: Date | string) {
  const date = toIST(d);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

// yyyy-mm-dd of a stored date, in India — what a date field holds
export function istDay(d: Date | string) {
  return toIST(d).toISOString().slice(0, 10);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "20 Sep" (plus the year when it isn't this one), red once it has passed
// on anything not yet finished.
// The editor's deadline: the day it has to reach the client (lib/due.ts).
// Muted while it's still to come, amber on the day, red once the day has
// gone and it still isn't with the client — and gone altogether once it has
// reached them, because from then on the deadline has done its job and the
// wait is the client's, not the editor's.
export function DueDate({
  date,
  handedOffAt = null,
  done = false,
}: {
  date: Date | string;
  // when it first reached the client — client tasks
  handedOffAt?: Date | string | null;
  // finished, for work that never goes to a client (a work task at "done")
  done?: boolean;
}) {
  const state = done ? "met" : dueState(date, handedOffAt);
  if (!state || state === "met" || state === "late") return null;
  const due = istDay(date);
  const today = istDay(new Date());
  const [y, m, d] = due.split("-").map(Number);
  const tone =
    state === "overdue" ? "font-medium text-red-300" : state === "today" ? "font-medium text-amber-300" : "text-muted";
  const title =
    state === "overdue"
      ? `Overdue — was due to reach the client by ${formatDate(date)}`
      : state === "today"
        ? "Due today — needs to reach the client today"
        : `Due ${formatDate(date)} — to reach the client by then`;
  return (
    <span title={title} className={`flex shrink-0 items-center gap-1 whitespace-nowrap text-xs ${tone}`}>
      <CalendarClock size={12} className="shrink-0" />
      {d} {MONTH_SHORT[m - 1]}
      {y !== Number(today.slice(0, 4)) && ` ${y}`}
    </span>
  );
}

// plus time-of-day — the activity trail logs every status change with a
// full timestamp already (ActivityLog.createdAt always had the time, just
// nothing displayed it), which matters once a task moves through several
// stages in the same day.
export function formatDateTime(d: Date | string) {
  const date = toIST(d);
  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${formatDate(d)}, ${hours}:${minutes} ${ampm} IST`;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status-pop shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export type TaskCardData = {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  assignedTo: { id: string; name: string } | null;
  rawLink: string | null;
  referenceLink: string | null;
  assetLink: string | null;
  frameioLink: string | null;
  driveLink: string | null;
  reviewNotes: string | null;
  editingNotes: string | null;
  revisionCount: number;
  dueDate: Date | null;
  // first reached the client — what the due date is judged against
  handedOffAt: Date | null;
  scheduledFor: Date | null;
  createdAt: Date;
  sortOrder: number;
  tags: { id: string; name: string }[];
  internal: boolean;
  project: { name: string; type: string; client: { name: string } };
};

// `presence`: whether to show the green online dot. On everywhere a person
// appears, except where the avatar is your own account button.
// `size`: pixels, or "fill" for as big as the box it's in (ProfileHead).
export function Avatar({ name, size = 24, presence = true }: { name: string; size?: number | "fill"; presence?: boolean }) {
  const photo = usePhoto(name);
  const online = useOnline(name) && presence;
  const fill = size === "fill";
  const face = photo ? (
    // eslint-disable-next-line @next/next/no-img-element -- a small, already-resized photo behind sign-in
    <img src={photo} alt={name} title={name} className="photo" style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }} />
  ) : (
    <Initials name={name} size={size} />
  );
  if (!online) return face;
  // subtle but findable: a pinpoint on small avatars, a touch more on big ones
  const dot = fill || size >= 40 ? 8 : size >= 24 ? 6 : 5;
  // on the circle's edge (bottom-right, 45°), not the square's far corner
  const inset = fill ? `calc(14.6% - ${dot / 2}px)` : Math.max(0, Math.round(size * 0.146 - dot / 2));
  return (
    <span className={`relative inline-flex shrink-0 ${fill ? "size-full" : ""}`}>
      {face}
      <span
        title={`${name} is online`}
        className="absolute rounded-full bg-green-500 ring-[1.5px] ring-background"
        style={{ width: dot, height: dot, right: inset, bottom: inset }}
      />
    </span>
  );
}

function Initials({ name, size }: { name: string; size: number | "fill" }) {
  const face = (
    <span
      // `photo` for the same hairline edge a picture gets, so every avatar matches
      className="photo flex items-center justify-center font-semibold leading-none text-black"
      style={{
        backgroundColor: colorFor(name),
        ...(size === "fill" ? { width: "100%", height: "100%", fontSize: "42cqi" } : { width: size, height: size, fontSize: size * 0.42 }),
      }}
      title={name}
    >
      {initials(name)}
    </span>
  );
  // filling a box: the letters scale with it (cqi = % of the box's width)
  return size === "fill" ? <span className="block size-full [container-type:inline-size]">{face}</span> : face;
}

// A list row's "who" and "where" columns. Both are fixed width on wider
// screens so names and stage pills line up down the list instead of shifting
// with each pill's label length; on a phone the name drops to the avatar.
export function AssigneeLabel({ name }: { name: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs sm:w-36" title={name}>
      <Avatar name={name} size={22} />
      <span className="hidden truncate text-foreground sm:inline">{name}</span>
    </span>
  );
}

export function StageColumn({ children }: { children: React.ReactNode }) {
  return <span className="flex shrink-0 justify-end sm:w-48">{children}</span>;
}

function Link({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" className="text-xs text-blue-400 underline underline-offset-2">
      {label} ↗
    </a>
  );
}

export function TaskCard({
  task,
  clientName,
  editors,
  projects,
  actingUserId,
  actingRole,
  taskTags = [],
}: {
  task: TaskCardData;
  clientName: string;
  editors: { id: string; name: string }[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags?: TaskTagOption[];
}) {
  const isAssignee = task.assignedTo?.id === actingUserId;
  const canManage = actingRole === "admin" || actingRole === "core";
  const options = availableStatuses(task.status, { role: actingRole, isAssignee });

  const cardLinkSpec = STATUS_LINK[task.status];
  const cardLinkHref = cardLinkSpec ? task[cardLinkSpec.field] : null;
  const detailsRef = useRef<{ open: () => void }>(null);

  // every interactive element inside the card below stops the click from
  // bubbling here — the card itself is now one big "open the details
  // dialog" click target (replacing the old separate info icon), so
  // anything that has its own click behavior needs to opt out or you'd
  // get a details dialog AND, say, a notes dialog stacked on top of it.
  return (
    <div
      onClick={() => detailsRef.current?.open()}
      className="card-surface card-interactive group relative flex cursor-pointer flex-col gap-2 rounded-xl p-3 shadow-sm"
    >
      {/* No Edit/Delete on hover any more. The whole card already opens the
          details dialog on click, so "Edit" was a second button for what a
          click already did, and Delete — the one destructive action here —
          sat one stray click away on every card. Both live in that dialog
          now, which keeps the card to just the task. */}
      <p className="min-w-0 truncate text-xs text-muted">{clientName}</p>

      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">{task.title}</p>
        <div onClick={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-2">
          {task.revisionCount > 0 && (
            <span className="group/rev relative flex items-center gap-1 rounded-full bg-orange-400/15 px-1.5 py-0.5 text-xs font-medium text-orange-300">
              <RotateCcw size={10} />
              {task.revisionCount}
              {/* below the badge, not above (top-full, not bottom-full) —
                  a card near the top of its scrolling column had nowhere
                  for an upward tooltip to go, so the column's own overflow
                  clipped it instead of letting it show */}
              <span className="pointer-events-none absolute top-full right-0 z-10 mt-1 w-max max-w-[12rem] rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-normal text-foreground opacity-0 shadow-lg transition-opacity group-hover/rev:opacity-100">
                Sent back for revision {task.revisionCount} time{task.revisionCount === 1 ? "" : "s"}
              </span>
            </span>
          )}
          {task.editingNotes && <NotesButton notes={task.editingNotes} />}
        </div>
      </div>

      {(task.tags.length > 0 || task.internal) && (
        <div className="flex flex-wrap items-center gap-1">
          {/* internal work is marked once, here, rather than colouring the
              whole card — it's a property of the task, not an alarm */}
          {task.internal && (
            <span
              title="Internal work — not delivered to the client"
              className="flex items-center gap-1 whitespace-nowrap rounded border border-border/60 bg-surface-2/60 px-1.5 text-[10.5px] leading-4 text-muted"
            >
              <EyeOff size={9} /> Internal
            </span>
          )}
          {task.tags.map((t) => (
            <TaskTagChip key={t.id} name={t.name} />
          ))}
        </div>
      )}

      {(task.assignedTo || task.dueDate) && (
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          {task.assignedTo && (
            <>
              <Avatar name={task.assignedTo.name} />
              <span className="truncate">{task.assignedTo.name}</span>
            </>
          )}
          {task.dueDate && (
            <span className="ml-auto">
              <DueDate date={task.dueDate} handedOffAt={task.handedOffAt} />
            </span>
          )}
        </div>
      )}

      {/* only ops sees this — the assigned editor doesn't get the task at
          all until this date (filtered out server-side in tasks/page.tsx) */}
      {canManage && task.scheduledFor && task.scheduledFor > new Date() && (
        <p className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
          Scheduled for {formatDate(task.scheduledFor)}, hidden from {task.assignedTo?.name ?? "the editor"} until then
        </p>
      )}

      {task.status === "revision_requested" && canManage && (
        <p className="rounded-md bg-orange-400/10 px-2 py-1 text-xs text-orange-300">
          Waiting on the editor to pick this back up.
        </p>
      )}
      {task.status === "revision_requested" && actingRole === "employee" && (
        <p className="rounded-md bg-orange-400/10 px-2 py-1 text-xs text-orange-300">
          Revision requested. Check the notes and resume editing.
        </p>
      )}

      {task.status === "sent_for_approval" && actingRole === "employee" && (
        <p className="rounded-md bg-purple-400/10 px-2 py-1 text-xs text-purple-300">
          Sent. Waiting on ops to review it.
        </p>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        <StatusSelect
          taskId={task.id}
          currentStatus={task.status}
          options={options}
                    links={{ frameioLink: task.frameioLink, driveLink: task.driveLink }}
        />
      </div>

      {cardLinkHref && (
        <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-2">
          <Link href={cardLinkHref} label={cardLinkSpec!.label} />
        </div>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        <TaskDetailsDialog
          ref={detailsRef}
          task={task}
          clientName={clientName}
          editors={editors}
          projects={projects}
          actingUserId={actingUserId}
          actingRole={actingRole}
          taskTags={taskTags}
        />
      </div>
    </div>
  );
}
