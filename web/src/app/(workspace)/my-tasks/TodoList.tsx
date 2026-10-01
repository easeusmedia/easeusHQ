"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, Check, ChevronDown, CircleCheck, FolderOpen, Hash, Plus, Truck, User } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { StatusSelect } from "../StatusSelect";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import { WorkTaskDialog, type Project } from "./WorkTaskDialog";
import { createTask, moveTask } from "../actions";
import { createWorkTask, moveWorkTask } from "./actions";
import { addDays, dayOf, shortDay, weekday } from "@/lib/editorKpi";
import { availableStatuses, workflowOf, type Role } from "@/lib/workflow";
import type { TaskCardData } from "../TaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import type { WorkTaskCardData } from "./WorkTaskCard";

export type TodoKind = { id: string; name: string; workflow: string; clientFacing: boolean; department: string | null };
type Done = { id: string; title: string; kind: "todo" | "task"; workflow?: string; at: string; client: string | null };

// one row, from either kind of task: a to-do of your own, or client work
type Item = {
  key: string;
  id: string;
  title: string;
  notes: string | null;
  due: string | null;
  delivery: string | null;
  client: string | null;
  project: string | null;
  tag: string | null;
  person: string | null;
  todo?: WorkTaskCardData;
  task?: TaskCardData;
};

// both kinds of task as the list's rows
function itemsOf(todos: WorkTaskCardData[], tasks: TaskCardData[]): Item[] {
  return [
    ...todos.map((t) => ({
      key: `w${t.id}`,
      id: t.id,
      title: t.title,
      notes: t.notes,
      due: t.dueDate,
      delivery: null,
      client: t.project?.client.name ?? null,
      project: t.project?.name ?? null,
      tag: t.tags[0]?.name ?? null,
      person: t.assignedTo?.name ?? null,
      todo: t,
    })),
    ...tasks.map((t) => ({
      key: `t${t.id}`,
      id: t.id,
      title: t.title,
      notes: t.editingNotes,
      due: t.dueDate ? dayOf(new Date(t.dueDate)) : null,
      delivery: t.deliveryDate ? dayOf(new Date(t.deliveryDate)) : null,
      client: t.project.client.name,
      project: t.project.name || t.project.type,
      tag: t.tags[0]?.name ?? null,
      person: t.assignedTo?.name ?? null,
      task: t,
    })),
  ];
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Today", "Tomorrow", "Fri 3 Oct"
function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return `${WEEKDAY[weekday(day)]} ${shortDay(day)}`;
}

type Env = {
  today: string;
  projects: Project[];
  assignees: { id: string; name: string }[];
  editors: { id: string; name: string }[];
  taskTags: TaskTagOption[];
  actingUserId: string;
  actingRole: Role;
};

// Your work as a to-do list, the way a to-do app lays it out: what's late,
// today, each day ahead, and what has no date, with the last week's
// finished below. A to-do (and client work that's a to-do) is ticked off;
// a video or design moves through its stages from the pill on its row.
export function TodoList({
  todos,
  tasks,
  done,
  kinds,
  ...env
}: Env & {
  todos: WorkTaskCardData[];
  tasks: TaskCardData[];
  done: Done[];
  kinds: TodoKind[];
}) {
  const router = useRouter();
  // ticked off here, gone before the refresh brings the list back
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items: Item[] = useMemo(() => itemsOf(todos, tasks).filter((i) => !gone.has(i.key)), [todos, tasks, gone]);

  const sections = useMemo(() => {
    const byDue = (a: Item, b: Item) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title);
    const overdue = items.filter((i) => i.due && i.due < env.today).sort(byDue);
    const days = [...new Set(items.filter((i) => i.due && i.due >= env.today).map((i) => i.due!))].sort();
    const none = items.filter((i) => !i.due);
    return [
      ...(overdue.length ? [{ key: "overdue", title: "Overdue", late: true, note: null, items: overdue }] : []),
      ...days.map((d) => ({ key: d, title: dayLabel(d, env.today), late: false, note: null, items: items.filter((i) => i.due === d) })),
      ...(none.length ? [{ key: "none", title: "No date", late: false, note: null, items: none }] : []),
    ];
  }, [items, env.today]);

  async function tick(item: Item) {
    setError(null);
    setGone((g) => new Set(g).add(item.key));
    const res = item.todo ? await moveWorkTask(item.id, "done", item.todo.sortOrder) : await moveTask(item.id, "delivered_and_uploaded");
    if (res.error) {
      setGone((g) => {
        const next = new Set(g);
        next.delete(item.key);
        return next;
      });
      return setError(res.error);
    }
    router.refresh();
  }

  async function reopen(d: Done) {
    setError(null);
    const res = d.kind === "todo" ? await moveWorkTask(d.id, "todo", 0) : await moveTask(d.id, "queued");
    if (res.error) return setError(res.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <CircleCheck size={14} /> {items.length} {items.length === 1 ? "task" : "tasks"}
        </p>
      </header>

      <Composer kinds={kinds} {...env} />
      {error && <p className="fade-in -mt-4 text-sm text-red-300">{error}</p>}

      {sections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing on your list. Add something above.</p>
      ) : (
        sections.map((s) => (
          <section key={s.key} className="fade-in flex flex-col">
            <h2 className="flex items-center gap-2 border-b border-border/70 pb-2 text-sm font-semibold">
              <span className={s.late ? "text-rose-300" : undefined}>{s.title}</span>
              <span className="text-xs font-normal text-muted tabular-nums">{s.items.length}</span>
              {s.note && <span className="text-xs font-normal text-rose-300">{s.note}</span>}
            </h2>
            {s.items.map((i) => (
              <Row key={i.key} item={i} onTick={() => tick(i)} {...env} />
            ))}
          </section>
        ))
      )}

      {done.length > 0 && (
        <section className="flex flex-col">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 self-start text-sm text-muted transition-colors hover:text-foreground">
            <ChevronDown size={14} className={`transition-transform duration-200 ${showDone ? "" : "-rotate-90"}`} />
            Completed <span className="tabular-nums">{done.length}</span>
          </button>
          {showDone && (
            <div className="fade-in mt-2 flex flex-col">
              {done.map((d) => {
                const reopenable = d.kind === "todo" || workflowOf(d.workflow) === "todo";
                return (
                  <div key={`${d.kind}${d.id}`} className="flex items-center gap-3 border-b border-border/50 py-2.5">
                    <button
                      type="button"
                      disabled={!reopenable}
                      onClick={() => reopen(d)}
                      aria-label="Mark not done"
                      title={reopenable ? "Mark not done" : "Finished"}
                      className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-accent/80 text-background transition-opacity enabled:hover:opacity-70"
                    >
                      <Check size={11} strokeWidth={3} />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted line-through decoration-muted/50">{d.title}</span>
                    {d.client && <span className="shrink-0 text-xs text-muted/70">{d.client}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Row({ item, onTick, today, projects, assignees, editors, taskTags, actingUserId, actingRole }: Env & { item: Item; onTick: () => void }) {
  const ref = useRef<{ open: () => void }>(null);
  const task = item.task;
  const flow = workflowOf(task?.workflow);
  // a to-do is ticked off; a video or design moves by its stages
  const tickable = !!item.todo || flow === "todo";
  const late = !!item.due && item.due < today;

  return (
    <div
      onClick={() => ref.current?.open()}
      className="group flex cursor-pointer items-start gap-3 border-b border-border/50 py-3 transition-colors hover:bg-white/[0.02]"
    >
      {tickable ? (
        <button
          type="button"
          aria-label="Mark done"
          onClick={(e) => {
            e.stopPropagation();
            onTick();
          }}
          className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted/50 text-transparent transition-colors hover:border-accent hover:text-accent"
        >
          <Check size={11} strokeWidth={3} />
        </button>
      ) : (
        <span title="Moves through its stages" className="mt-0.5 size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-muted/40" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{item.title}</p>
        {item.notes && <p className="mt-0.5 truncate text-xs text-muted">{item.notes}</p>}
        {(item.due || item.delivery || item.tag) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {item.due && (
              <span className={`flex items-center gap-1 ${late ? "text-rose-300" : "text-muted"}`}>
                <CalendarDays size={12} /> {shortDay(item.due)}
              </span>
            )}
            {item.delivery && (
              <span className="flex items-center gap-1 text-muted">
                <Truck size={12} /> Delivery {shortDay(item.delivery)}
              </span>
            )}
            {item.tag && (
              <span className="flex items-center gap-0.5 text-muted">
                <Hash size={11} />
                {item.tag}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
        {task && flow !== "todo" && (
          <div onClick={(e) => e.stopPropagation()}>
            <StatusSelect
              taskId={task.id}
              currentStatus={task.status}
              options={availableStatuses(task.status, { role: actingRole, isAssignee: true }, task.workflow)}
              links={{ frameioLink: task.frameioLink, driveLink: task.driveLink }}
              variant="pill"
              workflow={task.workflow}
            />
          </div>
        )}
        {item.client && (
          <span className="max-w-48 truncate text-xs text-muted">
            {item.client}
            {item.project && item.project !== item.client && <span className="text-muted/60"> / {item.project}</span>}
          </span>
        )}
      </div>
      <span onClick={(e) => e.stopPropagation()} className="contents">
        {item.todo && <WorkTaskDialog ref={ref} mode="edit" task={item.todo} projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} />}
        {task && (
          <TaskDetailsDialog
            ref={ref}
            task={task}
            clientName={item.client ?? ""}
            editors={editors}
            projects={projects}
            actingUserId={actingUserId}
            actingRole={actingRole}
            taskTags={taskTags}
          />
        )}
      </span>
    </div>
  );
}

// the option that clears a chip, offered only once it holds something
const NONE = "__none";
const blank = { title: "", notes: "", due: "", kindId: "", clientId: "", projectId: "", assignedToId: "" };

// "Add task", the way a to-do app does it: a title, a note, and chips you
// touch only if they apply. A kind of work from your roles decides the
// rest: a video or a design needs its client and goes through its stages;
// anything with a client is client work (on the client's page, in
// History); anything else is a to-do of your own.
export function Composer({
  kinds,
  projects,
  assignees,
  actingUserId,
  startOpen = false,
  onClose,
}: {
  kinds: TodoKind[];
  projects: Project[];
  assignees: { id: string; name: string }[];
  actingUserId: string;
  // Home opens it from its New task button, and hides it again on Cancel
  startOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpenState] = useState(startOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) onClose?.();
  };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof blank>) => setF((cur) => ({ ...cur, ...patch }));

  const kind = kinds.find((k) => k.id === f.kindId);
  const needsClient = !!kind && kind.workflow !== "todo";
  const clients = useMemo(() => [...new Map(projects.map((p) => [p.client.id, p.client])).values()], [projects]);
  const clientProjects = projects.filter((p) => p.client.id === f.clientId);

  async function add() {
    if (!f.title.trim()) return;
    if (needsClient && !f.clientId) return setError(`Pick the client this ${kind!.name.toLowerCase()} is for.`);
    setBusy(true);
    setError(null);
    const assignedToId = f.assignedToId || actingUserId;
    let res: { error?: string };
    if (f.clientId) {
      const data = new FormData();
      data.set("title", f.title);
      data.set("clientId", f.clientId);
      data.set("projectId", f.projectId);
      data.set("assignedToId", assignedToId);
      data.set("dueDate", f.due);
      data.set("editingNotes", f.notes);
      data.set("tagsPresent", "1");
      if (kind?.id.startsWith("role:")) data.set("roleId", kind.id.slice(5));
      else if (kind) data.append("tagIds", kind.id);
      data.set("workflow", kind?.workflow ?? "todo");
      // work done for the client that they never receive as a file
      if ((kind?.workflow ?? "todo") === "todo" && !kind?.clientFacing) data.set("internal", "on");
      res = await createTask({}, data);
    } else {
      const role = kind?.id.startsWith("role:") ? kind.id.slice(5) : undefined;
      res = await createWorkTask({ title: f.title, notes: f.notes, dueDate: f.due, tagIds: kind && !role ? [kind.id] : [], roleId: role, projectId: "", links: [], attachments: [], assignedToId });
    }
    setBusy(false);
    if (res.error) return setError(res.error);
    // stays open for the next one, keeping the chips that usually repeat
    setF((cur) => ({ ...blank, due: cur.due, kindId: cur.kindId, clientId: cur.clientId, projectId: cur.projectId, assignedToId: cur.assignedToId }));
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2.5 self-start text-sm text-muted transition-colors hover:text-foreground"
      >
        <span className="flex size-[18px] items-center justify-center rounded-full text-accent transition-colors group-hover:bg-accent group-hover:text-background">
          <Plus size={15} />
        </span>
        Add task
      </button>
    );
  }

  return (
    <div className="fade-in rounded-2xl border border-border bg-surface-2/40 p-4">
      <input
        autoFocus
        value={f.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Task name"
        className="w-full bg-transparent text-sm font-medium outline-none! placeholder:text-muted/60"
      />
      <input
        value={f.notes}
        onChange={(e) => set({ notes: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        placeholder="Description"
        className="mt-1 w-full bg-transparent text-xs text-muted outline-none! placeholder:text-muted/50"
      />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <DatePicker value={f.due} onChange={(v) => set({ due: v })} placeholder="Date" pill={{ icon: <CalendarDays size={12} className="text-emerald-400" /> }} />
        {kinds.length > 0 && (
          <Dropdown
            pill={{ icon: <Hash size={12} className="text-amber-400" /> }}
            value={f.kindId}
            placeholder="Kind of work"
            onChange={(v) => set({ kindId: v === NONE ? "" : v })}
            options={[...(f.kindId ? [{ value: NONE, label: "No kind" }] : []), ...kinds.map((k) => ({ value: k.id, label: k.name, group: k.department ?? undefined }))]}
          />
        )}
        <Dropdown
          pill={{ icon: <Building2 size={12} className="text-sky-400" /> }}
          value={f.clientId}
          placeholder={needsClient ? "Client (needed)" : "Client"}
          search={{ recent: 6, placeholder: "Find a client…" }}
          onChange={(v) => set({ clientId: v === NONE ? "" : v, projectId: "" })}
          options={[...(f.clientId ? [{ value: NONE, label: "No client" }] : []), ...clients.map((c) => ({ value: c.id, label: c.name }))]}
        />
        {f.clientId && clientProjects.length > 1 && (
          <Dropdown
            pill={{ icon: <FolderOpen size={12} className="text-violet-400" /> }}
            value={f.projectId}
            placeholder="Project"
            onChange={(v) => set({ projectId: v })}
            options={clientProjects.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
        {assignees.length > 1 && (
          <Dropdown
            pill={{ icon: <User size={12} className="text-rose-300" /> }}
            value={f.assignedToId || actingUserId}
            onChange={(v) => set({ assignedToId: v })}
            options={assignees.map((a) => ({ value: a.id, label: a.id === actingUserId ? "Me" : a.name }))}
          />
        )}
      </div>
      {error && <p className="fade-in mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="text-xs text-muted">
          {kind ? (kind.workflow === "todo" ? (f.clientId ? "Client work, ticked off when done" : "A to-do") : `Moves through the ${kind.workflow === "design" ? "Design" : "Video"} stages`) : f.clientId ? "Client work, ticked off when done" : "A to-do"}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={add} disabled={busy || !f.title.trim()} className="btn btn-sm btn-glow disabled:opacity-50">
            {busy ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}
