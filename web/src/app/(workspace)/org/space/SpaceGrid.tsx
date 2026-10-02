"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Copy, Layers, LayoutGrid, MoreHorizontal, Trash2 } from "lucide-react";
import { CHILD_OF, KIND_LABEL, type SpaceCard } from "@/lib/space";
import { ADD_CARD, PlusBadge } from "../../AddButton";
import { EditableName } from "../../EditableName";
import { topLayer, useCloseOnScroll, usePopover } from "../../popover";
import { createSpace, deleteSpace, renameSpace } from "./actions";
import { NewSpaceDialog } from "./NewSpaceDialog";
import { ReasonDialog } from "./ReasonDialog";

type Kind = "section" | "portal";
const ICON = { section: Layers, portal: LayoutGrid };
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

// What a section or portal is, for its empty page
const ABOUT: Record<Kind, string> = {
  section: "A section groups related work, like Outreach. Each one holds portals, and each portal holds the boards your team works from.",
  portal: "A portal holds the work for one channel or offer, like Podcast. Inside it are boards, where leads move from stage to stage.",
};

// A rename that refreshes the page (and the sidebar) once it saves
function useRename(id: string) {
  const router = useRouter();
  return async (name: string) => {
    const res = await renameSpace(id, name);
    if (res.error) return res.error;
    router.refresh();
  };
}

// A section's or portal's own title, with the pencil beside it
export function SpaceTitle({ id, name }: { id: string; name: string }) {
  const rename = useRename(id);
  return (
    <h1 className="text-2xl font-semibold tracking-tight">
      <EditableName name={name} onSave={rename} />
    </h1>
  );
}

// A department's sections, or a section's portals, as cards. Anyone in the
// department can rename them; Level 1 and Level 2 can also add, copy and
// delete them.
export function SpaceGrid({
  teamId,
  parentId,
  kind,
  base,
  cards,
  canBuild,
  templates,
}: {
  teamId: string;
  parentId: string | null;
  kind: Kind;
  // this page's address; each card's page lives under it
  base: string;
  cards: SpaceCard[];
  canBuild: boolean;
  // what a new one can start as a copy of: every one of its kind in the department
  templates?: { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const label = KIND_LABEL[kind].toLowerCase();
  const Icon = ICON[kind];

  const dialog = canBuild && (
    <NewSpaceDialog open={adding} onClose={() => setAdding(false)} teamId={teamId} parentId={parentId} kind={kind} base={base} siblings={templates ?? cards.map((c) => ({ id: c.id, name: c.name }))} />
  );

  if (!cards.length)
    return (
      <>
        <div className="fade-in flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent/10 text-accent ring-1 ring-accent/15">
            <Icon size={20} strokeWidth={1.5} />
          </span>
          <p className="mt-1 text-sm font-medium">No {label}s yet</p>
          <p className="max-w-md text-xs leading-5 text-muted">{ABOUT[kind]}</p>
          {canBuild ? (
            <button type="button" onClick={() => setAdding(true)} className="btn btn-sm btn-glow mt-2">
              New {label}
            </button>
          ) : (
            <p className="mt-1 text-xs text-muted/70">A Level 1 or Level 2 can add one.</p>
          )}
        </div>
        {/* outside the box, so the dialog doesn't inherit its centred text */}
        {dialog}
      </>
    );

  return (
    <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.id} card={c} kind={kind} teamId={teamId} parentId={parentId} canBuild={canBuild} taken={cards.map((s) => s.name.toLowerCase())} />
      ))}
      {canBuild && (
        <button type="button" onClick={() => setAdding(true)} className={`${ADD_CARD} min-h-[9.5rem] rounded-2xl`}>
          <PlusBadge large />
          New {label}
        </button>
      )}
      {dialog}
    </div>
    </>
  );
}

function Card({ card, kind, teamId, parentId, canBuild, taken }: { card: SpaceCard; kind: Kind; teamId: string; parentId: string | null; canBuild: boolean; taken: string[] }) {
  const router = useRouter();
  const rename = useRename(card.id);
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = ICON[kind];
  const label = KIND_LABEL[kind].toLowerCase();
  const inside = KIND_LABEL[CHILD_OF[kind]].toLowerCase();

  // a copy beside it: "Podcast copy", or "Podcast copy 2" if that's taken
  async function copy() {
    let name = `${card.name} copy`;
    for (let i = 2; taken.includes(name.toLowerCase()); i++) name = `${card.name} copy ${i}`;
    setCopying(true);
    setError(null);
    const res = await createSpace({ teamId, parentId, name, copyFromId: card.id });
    setCopying(false);
    if (res.error) return setError(res.error);
    router.refresh();
  }

  return (
    <div className="group relative flex min-h-[9.5rem] min-w-0 flex-col gap-4 rounded-2xl panel panel-hover p-5 hover:-translate-y-0.5">
      {/* the whole card opens the page; the name and menu sit above it */}
      <Link href={card.href} aria-label={`Open ${card.name}`} className="absolute inset-0 rounded-2xl" />

      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/15">
          <Icon size={18} strokeWidth={1.5} />
        </span>
        {canBuild ? (
          <CardMenu copying={copying} onCopy={copy} onDelete={() => setDeleting(true)} />
        ) : (
          <ArrowUpRight size={15} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      <div className="mt-auto min-w-0">
        <div className="relative z-10 flex w-fit max-w-full text-[15px] font-medium tracking-tight">
          <EditableName name={card.name} onSave={rename} />
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {card.children ? plural(card.children, inside) : `No ${inside}s yet`}
          {kind === "portal" && card.children > 0 && ` · ${plural(card.leads, "lead")}`}
        </p>
        {(error || copying) && (
          <p role={error ? "alert" : undefined} className={`fade-in mt-1.5 text-xs ${error ? "text-red-300" : "text-muted"}`}>
            {error ?? "Making a copy…"}
          </p>
        )}
      </div>

      <ReasonDialog
        open={deleting}
        danger
        title={`Delete ${card.name}?`}
        hint={card.children ? `It still holds ${plural(card.children, inside)}. Only an empty ${label} can be deleted.` : "It's kept in the bin with your reason."}
        confirm="Delete"
        onCancel={() => setDeleting(false)}
        onConfirm={async (reason) => {
          const res = await deleteSpace(card.id, reason);
          if (res.error) return res.error;
          setDeleting(false);
          router.refresh();
        }}
      />
    </div>
  );
}

// The builders' "⋯" on a card: make a copy, or delete
function CardMenu({ copying, onCopy, onDelete }: { copying: boolean; onCopy: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(88);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const item = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative z-10 -mt-1 -mr-1">
      <button
        ref={trigger}
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) return setOpen(false);
          place(trigger.current, { width: 176, align: "end" });
          setOpen(true);
        }}
        className={`flex size-7 items-center justify-center rounded-lg text-muted transition-[opacity,background-color,color] hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100 ${open ? "bg-white/[0.06] text-foreground opacity-100" : "opacity-60 group-hover:opacity-100"}`}
      >
        <MoreHorizontal size={16} strokeWidth={1.5} />
      </button>
      {open && position && (
        <div
          {...topLayer}
          role="menu"
          style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }}
          className="pop-in fixed z-50 rounded-xl popover p-1 shadow-lg"
        >
          <button type="button" role="menuitem" disabled={copying} onClick={item(onCopy)} className="menu-item px-2.5 py-1.5 text-sm disabled:opacity-50">
            <Copy size={14} strokeWidth={1.5} className="text-muted" /> Make a copy
          </button>
          <button type="button" role="menuitem" onClick={item(onDelete)} className="menu-item px-2.5 py-1.5 text-sm text-rose-300 hover:text-rose-200">
            <Trash2 size={14} strokeWidth={1.5} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
