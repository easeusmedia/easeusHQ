"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { NewSpaceDialog } from "./NewSpaceDialog";
import { ReasonDialog } from "./ReasonDialog";
import { deleteSpace, renameSpace } from "./actions";
import { EditableName } from "../../EditableName";

export const SEG_ROW = "flex w-fit items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]";

// A portal's boards as tabs (an outreach portal's boards, Leads' tabs): pick
// which; the open one is renamed or deleted where it sits, and a new one
// starts from the +. `active` is the one lit (the one being switched to, at
// once); `loading` while it arrives. `tabs`: Leads', named as tabs.
export function BoardTabs({
  teamId,
  portalId,
  boards,
  active,
  current,
  loading,
  canBuild,
  canAdd = canBuild,
  onSwitch,
  templates,
  deleteHint,
  tabs = false,
}: {
  teamId: string;
  portalId: string;
  boards: { id: string; name: string; slug: string }[];
  active: string;
  // the board open now, to rename or delete
  current: { id: string; name: string };
  loading: boolean;
  canBuild: boolean;
  // may add one (Sales' Level 2 too: lib/scope addsPages)
  canAdd?: boolean;
  onSwitch: (slug: string) => void;
  // what a new one can start as a copy of
  templates: { id: string; name: string }[];
  deleteHint: string;
  tabs?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const noun = tabs ? "tab" : "board";
  // a board's new name, then the page (tabs, sidebar) catches up
  const rename = (id: string) => async (name: string) => {
    const res = await renameSpace(id, name);
    if (res.error) return res.error;
    router.refresh();
  };

  return (
    <>
      {(boards.length > 1 || canAdd) && (
        <div className="flex max-w-full items-center gap-2">
          <div role="tablist" aria-label={tabs ? "Tabs" : "Boards"} className={`${SEG_ROW} max-w-full overflow-x-auto`}>
            {boards.map((b) => {
              // the one picked lights at once, ahead of its board loading
              const on = active === b.slug;
              const tools = on && !loading && !renaming;
              return (
                <div key={b.id} role="tab" aria-selected={on} className="seg group/tab flex max-w-[18rem] shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-medium">
                  {on && !loading ? (
                    canBuild ? <EditableName name={b.name} onSave={rename(b.id)} pencil="none" editing={renaming} onEditingChange={setRenaming} /> : <span className="truncate">{b.name}</span>
                  ) : (
                    <button type="button" onClick={() => onSwitch(b.slug)} className="-mx-3.5 -my-1.5 truncate px-3.5 py-1.5">
                      {b.name}
                    </button>
                  )}
                  {/* rename and delete, sliding out of the open tab on hover */}
                  {canBuild && (
                    <span
                      className={`flex max-w-0 shrink-0 items-center overflow-hidden opacity-0 transition-[max-width,opacity,margin] duration-300 ease-out ${
                        tools ? "group-focus-within/tab:-mr-1.5 group-focus-within/tab:ml-1.5 group-focus-within/tab:max-w-14 group-focus-within/tab:opacity-100 group-hover/tab:-mr-1.5 group-hover/tab:ml-1.5 group-hover/tab:max-w-14 group-hover/tab:opacity-100" : ""
                      }`}
                    >
                      <button type="button" tabIndex={tools ? 0 : -1} onClick={() => setRenaming(true)} aria-label={`Rename ${b.name}`} className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-foreground">
                        <Pencil size={12} />
                      </button>
                      <button type="button" tabIndex={tools ? 0 : -1} onClick={() => setDeleting(true)} aria-label={`Delete ${b.name}`} className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-red-300">
                        <Trash2 size={12} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {canAdd && (
            <button type="button" onClick={() => setCreating(true)} aria-label={`New ${noun}`} title={`New ${noun}`} className="chip grid size-9 shrink-0 place-items-center rounded-full">
              <Plus size={15} />
            </button>
          )}
        </div>
      )}

      <NewSpaceDialog open={creating} onClose={() => setCreating(false)} teamId={teamId} parentId={portalId} kind="board" base={pathname} siblings={templates} tab={tabs} />
      <ReasonDialog
        open={deleting}
        danger
        title={`Delete ${current.name}?`}
        hint={deleteHint}
        confirm={`Delete ${noun}`}
        onCancel={() => setDeleting(false)}
        onConfirm={async (reason) => {
          const res = await deleteSpace(current.id, reason);
          if (res.error) return res.error;
          setDeleting(false);
          // on to another board, or the portal's empty page
          const next = boards.find((b) => b.id !== current.id);
          if (next) onSwitch(next.slug);
          else router.replace(pathname);
          router.refresh();
        }}
      />
    </>
  );
}
