"use client";

import { useOptimistic, useState, useTransition } from "react";
import { LayoutGrid, List } from "lucide-react";
import { updateClientStatus } from "./actions";
import { ClientCard, ClientRow, type ClientCardData } from "./ClientCard";

const GROUPS: { status: string; label: string }[] = [
  { status: "current", label: "Current" },
  { status: "on_hold", label: "On hold" },
  { status: "previous", label: "Previous" },
];

// Three status zones stacked vertically, each its own panel and its own drop
// target — drag a client between them to change status. Grid or list is a
// view preference over the same three zones, not a different page.
export function ClientsBoard({ clients }: { clients: ClientCardData[] }) {
  const [, startTransition] = useTransition();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <div className="flex rounded-lg border border-border p-0.5">
          {([["grid", LayoutGrid], ["list", List]] as const).map(([key, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-label={`${key} view`}
              className={`rounded-md p-1.5 ${view === key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map((group) => {
        const groupClients = clients.filter((c) => (optimisticStatuses.get(c.id) ?? c.status) === group.status);
        return (
          <section
            key={group.status}
            className="rounded-xl bg-surface/60 p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = draggingId;
              setDraggingId(null);
              if (id) commitStatus(id, group.status);
            }}
          >
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
              {group.label} <span className="text-muted/70">({groupClients.length})</span>
            </h2>

            {groupClients.length === 0 ? (
              <p className="text-xs text-muted">Drag a client here</p>
            ) : (
              <div
                className={
                  view === "grid"
                    ? "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] items-start gap-3"
                    : "flex flex-col gap-2"
                }
              >
                {groupClients.map((client) => {
                  const props = {
                    client,
                    expanded: expandedId === client.id,
                    onToggle: () => setExpandedId((id) => (id === client.id ? null : client.id)),
                  };
                  return (
                    <div
                      key={client.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(client.id);
                        // without this Firefox won't fire onDrop for a drag
                        // that never touches a text field
                        e.dataTransfer.setData("text/plain", client.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={draggingId === client.id ? "opacity-40" : ""}
                    >
                      {view === "grid" ? <ClientCard {...props} /> : <ClientRow {...props} />}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
