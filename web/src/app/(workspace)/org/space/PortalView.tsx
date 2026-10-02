"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EyeOff, Kanban, LayoutGrid, Plus, Search, SlidersHorizontal, Table2, Trash2, Users } from "lucide-react";
import type { BoardData, Contact, LeadData, Person } from "@/lib/space";
import { renameSpace, deleteSpace } from "./actions";
import { LeadBoard, MENU_ITEM, MoreMenu } from "./LeadBoard";
import { LeadTable } from "./LeadTable";
import { LeadPeek } from "./LeadPeek";
import { TrashDialog } from "./TrashDialog";
import { BoardProperties } from "./BoardProperties";
import { NewSpaceDialog } from "./NewSpaceDialog";
import { ReasonDialog } from "./ReasonDialog";
import { EditableName } from "../../EditableName";
import { Dropdown } from "../../Dropdown";
import { setParam } from "../../urlState";

type View = "board" | "table";
type Prefs = { view: View; hideEmpty: boolean };
const DEFAULT_PREFS: Prefs = { view: "board", hideEmpty: false };
// per board, in this browser: board or table, and whether empty stages show
const prefsKey = (boardId: string) => `space:board:${boardId}`;

const SEG_ROW = "flex w-fit items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]";
const TOOL = "btn btn-sm btn-ghost gap-1.5 px-2.5";

// Everything a search can find on a lead: its name, and each contact's name,
// emails and handles
function searchText(lead: LeadData, contactFields: string[]) {
  const people = contactFields.flatMap((id) => (Array.isArray(lead.values[id]) ? (lead.values[id] as Contact[]) : []));
  return [lead.title, ...people.flatMap((p) => [p.name, p.role, ...(p.channels ?? []).map((c) => c.value)])].join(" ").toLowerCase();
}

// A portal's page under its heading: the boards as tabs, the toolbar
// (view, search, filters, properties, bin), the board or table, and the
// open lead. The open lead is in the address (?lead=), so a link opens it.
export function PortalView({
  teamId,
  portal,
  boards,
  board,
  people,
  canBuild,
  initialLeadId,
  viewerId,
  boardTemplates,
}: {
  teamId: string;
  portal: { id: string; name: string };
  boards: { id: string; name: string; slug: string }[];
  board: BoardData | null;
  people: Person[];
  canBuild: boolean;
  initialLeadId: string | null;
  // the signed-in person, for the "Mine" filter (left out, it isn't offered)
  viewerId?: string;
  // every board in the department, for "Start from a copy of"
  boardTemplates?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [switching, startSwitch] = useTransition();
  const [openId, setOpenId] = useState<string | null>(initialLeadId);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [query, setQuery] = useState("");
  const [who, setWho] = useState("all");
  const [creating, setCreating] = useState(false);
  const [showProps, setShowProps] = useState(false);
  const [showBin, setShowBin] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const boardId = board?.id;
  // this board's saved view, once in the browser (localStorage only exists after mount)
  useEffect(() => {
    if (!boardId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(prefsKey(boardId)) ?? "null") as Partial<Prefs> | null;
      setPrefs({ view: saved?.view === "table" ? "table" : "board", hideEmpty: saved?.hideEmpty === true }); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  }, [boardId]);
  function savePrefs(change: Partial<Prefs>) {
    const next = { ...prefs, ...change };
    setPrefs(next);
    try {
      if (boardId) localStorage.setItem(prefsKey(boardId), JSON.stringify(next));
    } catch {}
  }

  function open(id: string | null) {
    setOpenId(id);
    setParam("lead", id);
  }

  // another board: a step you can go Back to, staying where you are on the page
  function switchTo(slug: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("board", slug);
    url.searchParams.delete("lead");
    setOpenId(null);
    setQuery("");
    setWho("all");
    startSwitch(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
  }

  if (!board) {
    return (
      <>
        <div className="fade-in flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Kanban size={18} />
          </span>
          <div>
            <p className="text-sm font-medium">{portal.name} has no boards yet</p>
            <p className="mt-1 text-xs text-muted">
              {canBuild ? "Start one blank, or as a copy of a board you already have." : "A Level 1 or Level 2 lead in this department can add the first one."}
            </p>
          </div>
          {canBuild && (
            <button type="button" onClick={() => setCreating(true)} className="btn btn-sm btn-glow">
              <Plus size={14} /> New board
            </button>
          )}
        </div>
        <NewSpaceDialog open={creating} onClose={() => setCreating(false)} teamId={teamId} parentId={portal.id} kind="board" base={pathname} siblings={boardTemplates ?? boards} />
      </>
    );
  }

  const contactFields = board.fields.filter((f) => f.kind === "contacts").map((f) => f.id);
  const q = query.trim().toLowerCase();
  const shown = board.leads.filter(
    (l) =>
      (who === "all" || l.createdBy.id === (who === "mine" ? viewerId : who)) &&
      (!q || searchText(l, contactFields).includes(q))
  );
  const filtered = shown.length !== board.leads.length;
  const lead = openId ? (board.leads.find((l) => l.id === openId) ?? null) : null;
  const whoOptions = [
    { value: "all", label: "Everyone" },
    ...(viewerId ? [{ value: "mine", label: "Added by me" }] : []),
    ...people.map((p) => ({ value: p.id, label: p.name, group: "People" })),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* the boards */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Boards" className={`${SEG_ROW} max-w-full overflow-x-auto`}>
          {boards.map((b) =>
            b.id === board.id ? (
              <div key={b.id} role="tab" aria-selected="true" className="seg flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium">
                <LayoutGrid size={14} className="shrink-0 text-accent" />
                <EditableName
                  name={board.name}
                  className="max-w-[18rem]"
                  onSave={async (name) => {
                    const res = await renameSpace(board.id, name);
                    if (res.error) return res.error;
                    router.refresh();
                  }}
                />
              </div>
            ) : (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected="false"
                onClick={() => switchTo(b.slug)}
                className="seg flex max-w-[16rem] shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium"
              >
                <LayoutGrid size={14} className="shrink-0" />
                <span className="truncate">{b.name}</span>
              </button>
            )
          )}
        </div>
        {canBuild && (
          <>
            <button type="button" onClick={() => setCreating(true)} className={TOOL}>
              <Plus size={14} /> New board
            </button>
            <MoreMenu label="Board options" height={140}>
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM}
                    onClick={() => {
                      close();
                      setShowProps(true);
                    }}
                  >
                    <SlidersHorizontal size={14} className="text-muted" /> Properties…
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={MENU_ITEM}
                    onClick={() => {
                      close();
                      setShowBin(true);
                    }}
                  >
                    <Trash2 size={14} className="text-muted" /> Bin…
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    role="menuitem"
                    className={`${MENU_ITEM} text-red-300! hover:text-red-200!`}
                    onClick={() => {
                      close();
                      setDeleting(true);
                    }}
                  >
                    <Trash2 size={14} /> Delete board
                  </button>
                </>
              )}
            </MoreMenu>
          </>
        )}
      </div>

      {/* how to see it, and what */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={SEG_ROW}>
          {(
            [
              ["board", Kanban, "Board"],
              ["table", Table2, "Table"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={prefs.view === key}
              onClick={() => savePrefs({ view: key })}
              className="seg flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <label className="flex h-8 w-full items-center gap-2 rounded-full bg-white/[0.04] px-3 ring-1 ring-white/[0.07] transition-shadow focus-within:ring-accent/40 sm:w-60">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
            placeholder="Search leads and contacts"
            aria-label="Search leads and contacts"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none! placeholder:text-muted/60"
          />
        </label>
        <Dropdown size="sm" pill={{ icon: <Users size={13} className="text-accent" /> }} value={who} options={whoOptions} onChange={setWho} />
        {prefs.view === "board" && (
          <button
            type="button"
            aria-pressed={prefs.hideEmpty}
            onClick={() => savePrefs({ hideEmpty: !prefs.hideEmpty })}
            className="chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs"
          >
            <EyeOff size={13} /> Hide empty stages
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-xs text-muted tabular-nums">
            {filtered ? `${shown.length} of ${board.leads.length}` : board.leads.length} {board.leads.length === 1 ? "lead" : "leads"}
          </span>
          {canBuild && (
            <button type="button" onClick={() => setShowProps(true)} className={TOOL}>
              <SlidersHorizontal size={14} /> Properties
            </button>
          )}
          <button type="button" onClick={() => setShowBin(true)} className={TOOL}>
            <Trash2 size={14} /> Bin
          </button>
        </div>
      </div>

      {/* keyed by view so a switch eases in; dimmed while another board loads */}
      <div key={prefs.view} className={`fade-in min-w-0 transition-opacity duration-200 ${switching ? "opacity-50" : ""}`}>
        {prefs.view === "board" ? (
          <LeadBoard board={board} leads={shown} canBuild={canBuild} hideEmpty={prefs.hideEmpty} onShowEmpty={() => savePrefs({ hideEmpty: false })} onOpen={open} />
        ) : (
          <LeadTable board={board} leads={shown} filtered={filtered} onOpen={open} />
        )}
      </div>

      <LeadPeek lead={lead} board={board} canBuild={canBuild} onClose={() => open(null)} />
      <TrashDialog open={showBin} spaceId={board.id} title={`Deleted from ${board.name}`} onClose={() => setShowBin(false)} />
      {canBuild && <BoardProperties open={showProps} board={board} onClose={() => setShowProps(false)} />}
      {canBuild && (
        <>
          <NewSpaceDialog open={creating} onClose={() => setCreating(false)} teamId={teamId} parentId={portal.id} kind="board" base={pathname} siblings={boardTemplates ?? boards} />
          <ReasonDialog
            open={deleting}
            danger
            title={`Delete the ${board.name} board?`}
            hint="Only a board without leads can be deleted. Its stages and properties go with it, and the bin keeps your reason."
            confirm="Delete board"
            onCancel={() => setDeleting(false)}
            onConfirm={async (reason) => {
              const res = await deleteSpace(board.id, reason);
              if (res.error) return res.error;
              setDeleting(false);
              // the portal opens on its first remaining board
              router.push(pathname, { scroll: false });
              router.refresh();
            }}
          />
        </>
      )}
    </div>
  );
}
