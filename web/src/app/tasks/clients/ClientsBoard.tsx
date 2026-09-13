"use client";

import { useOptimistic, useState, useTransition } from "react";
import { LayoutGrid, List } from "lucide-react";
import { updateClientStatus } from "./actions";
import { AddClientCard } from "./AddClientCard";
import { ClientCard, ClientRow, type ClientCardData } from "./ClientCard";

const GROUPS: { status: string; label: string }[] = [
  { status: "current", label: "Current" },
  { status: "on_hold", label: "On hold" },
  { status: "previous", label: "Previous" },
];

// Only one status is ever on screen at once — Current by default, since
// that's what ops actually works out of day to day; On hold/Previous are a
// click away, not permanent dead weight taking up half the page. The tab
// buttons double as drop targets, so dragging a card still moves it between
// statuses even though the other lists aren't rendered right now.
export function ClientsBoard({ clients }: { clients: ClientCardData[] }) {
  const [, startTransition] = useTransition();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeGroup, setActiveGroup] = useState("current");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
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

  const counts = Object.fromEntries(
    GROUPS.map((g) => [g.status, clients.filter((c) => (optimisticStatuses.get(c.id) ?? c.status) === g.status).length])
  );
  const visible = clients.filter((c) => (optimisticStatuses.get(c.id) ?? c.status) === activeGroup);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-xl border border-border bg-surface/60 p-1">
          {GROUPS.map((g) => (
            <button
              key={g.status}
              onClick={() => setActiveGroup(g.status)}
              // a card dragged over a tab that isn't the active one can drop
              // right onto it — the only way to move a client to a status
              // whose list isn't the one currently on screen
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverGroup(g.status);
              }}
              onDragLeave={() => setDragOverGroup((cur) => (cur === g.status ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverGroup(null);
                const id = draggingId;
                setDraggingId(null);
                if (id) commitStatus(id, g.status);
              }}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium ${
                activeGroup === g.status ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
              } ${dragOverGroup === g.status && activeGroup !== g.status ? "ring-2 ring-blue-400/50" : ""}`}
            >
              {g.label} <span className="text-muted/70">({counts[g.status]})</span>
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-xl border border-border bg-surface/60 p-1">
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
        className={
          view === "grid"
            ? "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] items-stretch gap-4"
            : "flex flex-col gap-2"
        }
      >
        {visible.map((client) => (
          <div
            key={client.id}
            draggable
            onDragStart={(e) => {
              setDraggingId(client.id);
              // without this Firefox won't fire onDrop for a drag that
              // never touches a text field
              e.dataTransfer.setData("text/plain", client.id);
            }}
            onDragEnd={() => setDraggingId(null)}
            className={draggingId === client.id ? "opacity-40" : ""}
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
          <p className="text-xs text-muted">Drag a client here, or drop one on this tab.</p>
        )}
      </div>
    </div>
  );
}
