"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EyeOff, Kanban, MailOpen, Plus, Reply, Search, Send, Table2, Users } from "lucide-react";
import { outreachStart, outreachStats, type BoardData, type Contact, type LeadData, type Person } from "@/lib/space";
import { LeadBoard } from "./LeadBoard";
import { LeadTable } from "./LeadTable";
import { LeadPeek } from "./LeadPeek";
import { NewSpaceDialog } from "./NewSpaceDialog";
import { renameSpace, setLeadOutreach } from "./actions";
import type { Outreach } from "./LeadCard";
import { StatTile } from "../../StatTile";
import { EditableName } from "../../EditableName";
import { Dropdown } from "../../Dropdown";
import { setParam } from "../../urlState";

type View = "board" | "table";
type Prefs = { view: View; hideEmpty: boolean };
const DEFAULT_PREFS: Prefs = { view: "board", hideEmpty: false };
// per board, in this browser: board or table, and whether empty stages show
const prefsKey = (boardId: string) => `space:board:${boardId}`;

const SEG_ROW = "flex w-fit items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]";

// Everything a search can find on a lead: its name, and each contact's name,
// emails and handles
function searchText(lead: LeadData, contactFields: string[]) {
  const people = contactFields.flatMap((id) => (Array.isArray(lead.values[id]) ? (lead.values[id] as Contact[]) : []));
  return [lead.title, ...people.flatMap((p) => [p.name, p.role, ...(p.channels ?? []).map((c) => c.value)])].join(" ").toLowerCase();
}

// A portal's page under its heading: the boards as tabs, the board's
// reaching-out numbers, the toolbar (view, search, filters), the board or
// table, and the open lead. The open lead is in the address (?lead=), so a
// link opens it.
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
  // a board's new name, then the page (tabs, sidebar) catches up
  const rename = (id: string) => async (name: string) => {
    const res = await renameSpace(id, name);
    if (res.error) return res.error;
    router.refresh();
  };
  const pathname = usePathname();
  const [switching, startSwitch] = useTransition();
  const [openId, setOpenId] = useState<string | null>(initialLeadId);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [query, setQuery] = useState("");
  const [who, setWho] = useState("all");
  const [creating, setCreating] = useState(false);
  // opens and replies tapped here show at once, ahead of the board's refresh
  const [tracked, setTracked] = useState<Record<string, Outreach>>({});
  const [trackError, setTrackError] = useState<string | null>(null);
  async function track(id: string, change: Outreach) {
    const before = tracked[id];
    setTrackError(null);
    setTracked((t) => ({ ...t, [id]: { ...t[id], ...change } }));
    const res = await setLeadOutreach(id, change).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    if (res.error) {
      setTracked((t) => ({ ...t, [id]: before ?? {} }));
      return setTrackError(res.error);
    }
    router.refresh();
  }

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
  const leads = board.leads.map((l) => (tracked[l.id] ? { ...l, ...tracked[l.id] } : l));
  const whose = leads.filter((l) => who === "all" || [l.createdBy.id, l.assignedTo?.id].includes(who === "mine" ? viewerId : who));
  const shown = whose.filter((l) => !q || searchText(l, contactFields).includes(q));
  // reaching out, in numbers: for whoever is picked, whatever is searched
  const stats = outreachStart(board.stages) >= 0 ? outreachStats(board.stages, whose) : null;
  const filtered = shown.length !== board.leads.length;
  const lead = openId ? (leads.find((l) => l.id === openId) ?? null) : null;
  const whoOptions = [
    { value: "all", label: "Everyone" },
    ...(viewerId ? [{ value: "mine", label: "Mine" }] : []),
    ...people.map((p) => ({ value: p.id, label: p.name, group: "People" })),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* the boards */}
      {/* more than one board in this portal: pick which */}
      {boards.length > 1 && (
        <div role="tablist" aria-label="Boards" className={`${SEG_ROW} max-w-full overflow-x-auto`}>
          {boards.map((b) =>
            // the open board's name can be changed where it sits
            b.id === board.id ? (
              <span key={b.id} role="tab" aria-selected className="seg flex max-w-[18rem] shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-medium">
                <EditableName name={b.name} onSave={rename(b.id)} pencil="hover" />
              </span>
            ) : (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={false}
                onClick={() => switchTo(b.slug)}
                className="seg flex max-w-[16rem] shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-medium"
              >
                <span className="truncate">{b.name}</span>
              </button>
            ),
          )}
        </div>
      )}

      {/* reaching out, in numbers */}
      {stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Reached out" value={stats.reached} Icon={Send} />
          <StatTile
            label="Emails opened"
            value={stats.opened}
            Icon={MailOpen}
            note={stats.reached > 0 && <p className="text-xs text-muted">{stats.openRate}% of reached out · {stats.opens} {stats.opens === 1 ? "open" : "opens"}</p>}
          />
          <StatTile
            label="Reply rate"
            value={`${stats.replyRate}%`}
            lit={stats.replied > 0}
            tone="emerald"
            Icon={Reply}
            note={stats.reached > 0 && <p className="text-xs text-muted">{stats.replied} {stats.replied === 1 ? "reply" : "replies"}</p>}
          />
        </div>
      )}

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
      </div>
      {trackError && (
        <p role="alert" className="fade-in text-xs text-red-300">
          {trackError}
        </p>
      )}

      {/* keyed by view so a switch eases in; dimmed while another board loads */}
      <div key={prefs.view} className={`fade-in min-w-0 transition-opacity duration-200 ${switching ? "opacity-50" : ""}`}>
        {prefs.view === "board" ? (
          <LeadBoard board={board} leads={shown} canBuild={canBuild} hideEmpty={prefs.hideEmpty} onShowEmpty={() => savePrefs({ hideEmpty: false })} onOpen={open} onTrack={track} />
        ) : (
          <LeadTable board={board} leads={shown} filtered={filtered} onOpen={open} />
        )}
      </div>

      <LeadPeek lead={lead} board={board} people={people} canBuild={canBuild} onClose={() => open(null)} onTrack={track} />
    </div>
  );
}
