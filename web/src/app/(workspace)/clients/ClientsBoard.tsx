"use client";

import { useOptimistic, useState, useTransition } from "react";
import { LayoutGrid, List } from "lucide-react";
import { reorderClient, updateClientStatus } from "./actions";
import { moveTo, sortBetween } from "@/lib/reorder";
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
// Onto another card: puts it there in the order — the cards make room as
// you drag, and the order is shared by the whole team (it's the agency's
// queue). Both are ops-only; for everyone else the cards just don't drag.
export function ClientsBoard({ clients, canArrange }: { clients: ClientCardData[]; canArrange: boolean }) {
  const [, startTransition] = useTransition();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeGroup, setActiveGroup] = useState("current");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // the order while a drag is in flight, so cards shift under the cursor
  const [preview, setPreview] = useState<string[] | null>(null);
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
  const inGroup = clients.filter((c) => statusOf(c) === activeGroup).sort((a, b) => sortOf(a) - sortOf(b));
  const visible = preview ? preview.map((id) => byId.get(id)!).filter((c) => c && statusOf(c) === activeGroup) : inGroup;

  // Hovering another card in the same list: slot the dragged one in before
  // or after it — by which half the cursor is over, left/right in the grid
  // (it reads across) and top/bottom in the list.
  function hoverCard(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    const dragged = draggingId ? byId.get(draggingId) : undefined;
    if (!dragged || dragged.id === targetId || statusOf(dragged) !== activeGroup) return;
    const r = e.currentTarget.getBoundingClientRect();
    const after = view === "grid" ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    const next = moveTo(visible.map((c) => c.id), dragged.id, targetId, after);
    if (next.join() !== visible.map((c) => c.id).join()) setPreview(next);
  }

  function drop() {
    const id = draggingId;
    const order = preview;
    setDraggingId(null);
    setPreview(null);
    const dragged = id ? byId.get(id) : undefined;
    if (!dragged) return;
    // dragged in from another status's tab: that's a status change
    if (statusOf(dragged) !== activeGroup) return commitStatus(dragged.id, activeGroup);
    if (!order) return;
    const i = order.indexOf(dragged.id);
    const unchanged = order.join() === inGroup.map((c) => c.id).join();
    if (i === -1 || unchanged) return;
    const before = order[i - 1] ? sortOf(byId.get(order[i - 1])!) : undefined;
    const after = order[i + 1] ? sortOf(byId.get(order[i + 1])!) : undefined;
    commitSort(dragged.id, sortBetween(before, after));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="segmented">
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
                if (draggingId && activeGroup !== g.status) {
                  setActiveGroup(g.status);
                  setPreview(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = draggingId;
                setDraggingId(null);
                setPreview(null);
                if (id) commitStatus(id, g.status);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium ${
                activeGroup === g.status ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {g.label} <span className="text-muted/70">({counts[g.status]})</span>
            </button>
          ))}
        </div>

        <div className="segmented">
          {([["grid", LayoutGrid, "Grid"], ["list", List, "List"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-label={`${key} view`}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                view === key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          // the tab hover above already switched activeGroup to wherever
          // this card is hovering, so dropping anywhere in the now-open
          // section — not just back on the tab button — lands it there
          drop();
        }}
        className={
          view === "grid"
            ? "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] items-stretch gap-4"
            : "flex flex-col gap-2"
        }
      >
        {visible.map((client) => (
          <div
            key={client.id}
            draggable={canArrange}
            onDragStart={(e) => {
              setDraggingId(client.id);
              e.dataTransfer.effectAllowed = "move";
              // without this Firefox won't fire onDrop for a drag that
              // never touches a text field
              e.dataTransfer.setData("text/plain", client.id);
            }}
            onDragOver={(e) => hoverCard(e, client.id)}
            // a drag that's cancelled (Esc, dropped outside) puts everything back
            onDragEnd={() => {
              setDraggingId(null);
              setPreview(null);
            }}
            className={`transition-opacity ${canArrange ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === client.id ? "opacity-40" : ""}`}
          >
            {view === "grid" ? (
              <ClientCard client={client} onStatusChange={commitStatus} />
            ) : (
              <ClientRow client={client} onStatusChange={commitStatus} />
            )}
          </div>
        ))}
        {/* adding a client only makes sense into the live group */}
        {activeGroup === "current" && <AddClientCard variant={view === "grid" ? "card" : "row"} />}
        {visible.length === 0 && activeGroup !== "current" && (
          <p className="text-xs text-muted">Drag a client onto this tab to move it here.</p>
        )}
      </div>
    </div>
  );
}
