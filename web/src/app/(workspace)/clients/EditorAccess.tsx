"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Users } from "lucide-react";
import { topLayer, useCloseOnScroll, usePopover } from "../popover";
import { setClientEditors } from "./actions";

// Which members (everyone outside the core team) can see this client. A
// member sees only the clients given to them here, and on each only their
// own tasks and its documents. Each tick saves at once; the menu stays
// open for the next.
export function EditorAccess({ clientId, editors, given }: { clientId: string; editors: { id: string; name: string }[]; given: string[] }) {
  const [picked, setPicked] = useState(given);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(editors.length * 36 + 72);
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
    const res = await setClientEditors(clientId, next);
    if (res.error) {
      setPicked(before);
      setError(res.error);
    }
  }

  const names = editors.filter((e) => picked.includes(e.id)).map((e) => e.name.split(" ")[0]);

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
        className="btn btn-sm flex items-center gap-2 border border-border bg-surface-2 text-muted hover:text-foreground"
      >
        <Users size={13} />
        {names.length === 0 ? "Give access" : names.length <= 2 ? names.join(", ") : `${names.length} people`}
      </button>
      {open && position && (
        <div
          {...topLayer}
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 rounded-xl popover p-1 shadow-lg"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-muted/70">Can see this client</p>
          {editors.map((e) => (
            <button key={e.id} type="button" onClick={() => toggle(e.id)} className="menu-item px-2.5 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {picked.includes(e.id) && <Check size={13} className="shrink-0 text-accent" />}
            </button>
          ))}
          {editors.length === 0 && <p className="px-2.5 py-2 text-sm text-muted">No one outside the core team yet.</p>}
          {error && <p className="px-2.5 py-1.5 text-xs text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
