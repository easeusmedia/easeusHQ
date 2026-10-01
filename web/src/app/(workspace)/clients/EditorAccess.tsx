"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { topLayer, useCloseOnScroll, usePopover } from "../popover";
import { setClientAccess } from "./actions";
import { Avatar } from "../TaskCard";

// Who can see this client, Level 1 aside (they always do). A Level 3 sees
// only the clients ticked for them here, and on each only their own work;
// a Level 2 sees every client unless it's unticked here. Each tick saves
// at once; the menu stays open for the next.
export function EditorAccess({ clientId, people: editors, given }: { clientId: string; people: { id: string; name: string; position: string | null }[]; given: string[] }) {
  const [picked, setPicked] = useState(given);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(Math.min(editors.length * 46 + 72, 420));
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function toggle(id: string) {
    const before = picked;
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    setError(null);
    const res = await setClientAccess(clientId, id, next.includes(id));
    if (res.error) {
      setPicked(before);
      setError(res.error);
    }
  }

  const people = editors.filter((e) => picked.includes(e.id));
  // how many faces the button stacks before "+N"
  const FACES = 4;

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) return setOpen(false);
          place(triggerRef.current, { width: 256, align: "end" });
          setOpen(true);
        }}
        aria-label={people.length ? `Can see this client: ${people.map((e) => e.name).join(", ")}` : "Give someone access to this client"}
        title={people.length ? people.map((e) => e.name).join(", ") : "Give access"}
        className="flex h-8 items-center rounded-full border border-border bg-surface-2 px-1 text-muted transition-colors hover:border-hover hover:text-foreground"
      >
        {people.length === 0 ? (
          <span className="flex items-center gap-1.5 px-1.5 text-xs">
            <UserPlus size={13} /> Give access
          </span>
        ) : (
          // who can see it, their faces overlapping
          <span className="flex items-center -space-x-1.5">
            {people.slice(0, FACES).map((e) => (
              <span key={e.id} className="flex rounded-full ring-2 ring-surface-2">
                <Avatar name={e.name} size={22} presence={false} />
              </span>
            ))}
            {people.length > FACES && (
              <span className="flex size-[22px] items-center justify-center rounded-full bg-hover text-[10px] font-medium text-foreground ring-2 ring-surface-2">
                +{people.length - FACES}
              </span>
            )}
          </span>
        )}
      </button>
      {open && position && (
        <div
          {...topLayer}
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 max-h-[420px] overflow-y-auto rounded-xl popover p-1 shadow-lg"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-muted/70">Can see this client</p>
          {editors.map((e) => (
            <button key={e.id} type="button" onClick={() => toggle(e.id)} className="menu-item px-2.5 py-1.5 text-sm">
              <Avatar name={e.name} size={24} presence={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.name}</span>
                {e.position && <span className="block truncate text-[11px] text-muted">{e.position}</span>}
              </span>
              {picked.includes(e.id) && <Check size={13} className="shrink-0 text-accent" />}
            </button>
          ))}
          {editors.length === 0 && <p className="px-2.5 py-2 text-sm text-muted">No one to give it to yet.</p>}
          {error && <p className="px-2.5 py-1.5 text-xs text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
