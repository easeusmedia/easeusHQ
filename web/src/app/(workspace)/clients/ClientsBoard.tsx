"use client";

import { Fragment, useOptimistic, useRef, useState, useTransition } from "react";
import { LayoutGrid, List } from "lucide-react";
import { reorderClient, updateClientStatus } from "./actions";
import { sortBetween } from "@/lib/reorder";
import { landingIndex, useEaseAside } from "../DropSlot";
import { AddClientCard } from "./AddClientCard";
import { ClientCard, ClientRow, type ClientCardData } from "./ClientCard";

const GROUPS: { status: string; label: string }[] = [
  { status: "current", label: "Current" },
  { status: "on_hold", label: "On hold" },
  { status: "previous", label: "Previous" },
];

// Only one status is ever on screen at once — Current by default, since
// that's what ops actually works out of day to day; On hold/Previous are a
// click away, not permanent dead weight taking up half the page.
//
// Dragging does two things. Onto a tab: moves the client to that status.
// Onto another card: puts it there in the order (a slot of its size shows
// where it will land, as on the boards), and the order is shared by the
// whole team (it's the agency's queue). Both are ops-only; for everyone else
// the cards just don't drag.
export function ClientsBoard({ clients, canArrange }: { clients: ClientCardData[]; canArrange: boolean }) {
  const [, startTransition] = useTransition();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeGroup, setActiveGroup] = useState("current");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // where the dragged card will land among the others (null: it's outside the list)
  const [over, setOver] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  const endDrag = () => {
    setDraggingId(null);
    setOver(null);
  };
  const listRef = useRef<HTMLDivElement>(null);
  const [sortOverrides, applySort] = useOptimistic(
    new Map<string, number>(),
    (state, update: { id: string; sortOrder: number }) => new Map(state).set(update.id, update.sortOrder)
  );
  const [optimisticStatuses, applyStatus] = useOptimistic(
    new Map(clients.map((c) => [c.id, c.status])),
    (state, update: { id: string; status: string }) => new Map(state).set(update.id, update.status)
  );

  function commitStatus(id: string, status: string) {
    startTransition(async () => {
      applyStatus({ id, status });
      await updateClientStatus(id, status);
    });
  }

  function commitSort(id: string, sortOrder: number) {
    startTransition(async () => {
      applySort({ id, sortOrder });
      await reorderClient(id, sortOrder);
    });
  }

  const statusOf = (c: ClientCardData) => optimisticStatuses.get(c.id) ?? c.status;
  const sortOf = (c: ClientCardData) => sortOverrides.get(c.id) ?? c.sortOrder;
  const byId = new Map(clients.map((c) => [c.id, c]));

  const counts = Object.fromEntries(
    GROUPS.map((g) => [g.status, clients.filter((c) => (optimisticStatuses.get(c.id) ?? c.status) === g.status).length])
  );
  const bySort = (a: ClientCardData, b: ClientCardData) => sortOf(a) - sortOf(b);
  const inGroup = clients.filter((c) => statusOf(c) === activeGroup).sort(bySort);
  const dragged = draggingId ? byId.get(draggingId) : undefined;
  const rest = inGroup.filter((c) => c.id !== draggingId);
  const from = inGroup.findIndex((c) => c.id === draggingId);
  // The slot: where the pointer is among the others, unless that leaves the
  // card where it is. From another status's tab it's only a status change,
  // so it keeps its place in the order, and the slot shows that place (found
  // the way the list sorts, so it sits right among clients with the same order).
  const at =
    !dragged || over === null ? -1 : statusOf(dragged) !== activeGroup ? clients.filter((c) => c === dragged || statusOf(c) === activeGroup).sort(bySort).indexOf(dragged) : over;
  const slotAt = at !== from ? at : -1;
  const slot = <div key="slot" aria-hidden style={{ height: dragHeight || 56 }} className={`fade-in shrink-0 border border-dashed border-white/15 bg-white/[0.03] ${view === "grid" ? "rounded-3xl" : "rounded-2xl"}`} />;
  // the cards ease aside for the slot, and into their new places
  useEaseAside(listRef, `${slotAt} ${inGroup.map((c) => c.id).join()}`);
  // where among the others a card dragged to (x, y) lands
  const indexAt = (box: HTMLElement, x: number, y: number, id: string) =>
    landingIndex(box, [...box.querySelectorAll<HTMLElement>(":scope > [data-drag-id]")].filter((el) => el.dataset.dragId !== id), x, y, view === "grid");

  // Dropped in the open list: a status change when it came from another
  // tab, else its new place among the others, by where the pointer is
  function drop(e: React.DragEvent<HTMLDivElement>) {
    const id = draggingId;
    endDrag();
    const card = id ? byId.get(id) : undefined;
    if (!card) return;
    // dragged in from another status's tab: that's a status change
    if (statusOf(card) !== activeGroup) return commitStatus(card.id, activeGroup);
    const others = inGroup.filter((c) => c.id !== card.id);
    const i = indexAt(e.currentTarget, e.clientX, e.clientY, card.id);
    if (i === inGroup.indexOf(card)) return;
    commitSort(card.id, sortBetween(others[i - 1] && sortOf(others[i - 1]), others[i] && sortOf(others[i])));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-xl panel-soft p-1">
          {GROUPS.map((g) => (
            <button
              key={g.status}
              onClick={() => setActiveGroup(g.status)}
              // dragging a card over a tab that isn't open switches to it
              // immediately, same as a Kanban auto-tab-switch — dropping
              // used to require landing exactly on this small button with
              // its destination list never shown; now you see the section
              // you're dropping into and can release anywhere in it
              onDragOver={(e) => {
                e.preventDefault();
                if (draggingId && activeGroup !== g.status) setActiveGroup(g.status);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = draggingId;
                endDrag();
                if (id) commitStatus(id, g.status);
              }}
              aria-pressed={activeGroup === g.status}
              className="seg flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium"
            >
              {g.label} <span className="text-muted/70">({counts[g.status]})</span>
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-xl panel-soft p-1">
          {([["grid", LayoutGrid, "Grid"], ["list", List, "List"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-label={`${key} view`}
              aria-pressed={view === key}
              className="seg flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={listRef}
        onDragOver={(e) => {
          e.preventDefault();
          if (!draggingId) return;
          const i = indexAt(e.currentTarget, e.clientX, e.clientY, draggingId);
          if (i !== over) setOver(i);
        }}
        // out of the list (onto a tab, or away): no slot. Measured, as
        // WebKit doesn't always say where a drag went.
        onDragLeave={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX <= r.left || e.clientX >= r.right || e.clientY <= r.top || e.clientY >= r.bottom) setOver(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          // the tab hover above already switched activeGroup to wherever
          // this card is hovering, so dropping anywhere in the now-open
          // section — not just back on the tab button — lands it there
          drop(e);
        }}
        className={
          view === "grid"
            ? "relative grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] items-stretch gap-4"
            : "relative flex flex-col gap-2"
        }
      >
        {inGroup.map((client) => (
          <Fragment key={client.id}>
          {slotAt >= 0 && rest[slotAt]?.id === client.id && slot}
          <div
            data-drag-id={client.id}
            draggable={canArrange}
            onDragStart={(e) => {
              // a client's logo drags on its own; only ops rearrange
              if (!canArrange) return;
              setDragHeight(e.currentTarget.offsetHeight);
              setDraggingId(client.id);
              e.dataTransfer.effectAllowed = "move";
              // without this Firefox won't fire onDrop for a drag that
              // never touches a text field
              e.dataTransfer.setData("text/plain", client.id);
              // a drag that's cancelled (Esc, dropped outside) puts everything
              // back. Heard on the card itself: switching tabs mid-drag takes
              // it off the page, out of React's reach.
              e.currentTarget.addEventListener("dragend", endDrag, { once: true });
            }}
            className={`transition-opacity ${view === "grid" ? "h-full" : ""} ${canArrange ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === client.id ? "opacity-40" : ""}`}
          >
            {view === "grid" ? (
              <ClientCard client={client} onStatusChange={canArrange ? commitStatus : undefined} />
            ) : (
              <ClientRow client={client} onStatusChange={canArrange ? commitStatus : undefined} />
            )}
          </div>
          </Fragment>
        ))}
        {slotAt >= 0 && slotAt >= rest.length && slot}
        {/* adding a client only makes sense into the live group */}
        {canArrange && activeGroup === "current" && <AddClientCard variant={view === "grid" ? "card" : "row"} />}
        {!canArrange && inGroup.length === 0 && <p className="text-sm text-muted">No clients have been shared with you yet.</p>}
        {canArrange && inGroup.length === 0 && activeGroup !== "current" && (
          <p className="text-xs text-muted">Drag a client onto this tab to move it here.</p>
        )}
      </div>
    </div>
  );
}
