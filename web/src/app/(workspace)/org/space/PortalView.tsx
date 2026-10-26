"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronRight, EyeOff, Filter, Kanban, Layers, Mail, MailOpen, Pencil, Plus, Reply, Rows3, Search, Send, Table2, Trash2, Users, UserCheck, X } from "lucide-react";
import { facetLabel, facets, leadingFacet, outreachStart, outreachStats, passesFacets, PLATFORM_NAME, reachOutCounts, PLATFORMS, withMark, type BoardData, type Contact, type Facet, type FacetPicks, type LeadData, type MarkChange, type Marks, type Person, type Platform } from "@/lib/space";
import { LeadBoard } from "./LeadBoard";
import { LeadList } from "./LeadList";
import { LeadTable } from "./LeadTable";
import { LeadPeek } from "./LeadPeek";
import { NewSpaceDialog } from "./NewSpaceDialog";
import { CanBuild, Menu } from "./values";
import { deleteSpace, renameSpace, setLeadMark } from "./actions";
import { ReasonDialog } from "./ReasonDialog";
import { StatTile } from "../../StatTile";
import { Reveal } from "../../Reveal";
import { EditableName } from "../../EditableName";
import { chip } from "../../chip";
import { setParam } from "../../urlState";
import { InstagramIcon, LinkedinIcon } from "../../PlatformIcon";
import { TrackerChip } from "../../TrackerChip";

type View = "board" | "list" | "table";
type Prefs = { view: View; hideEmpty: boolean; platform: Platform | "all" };
const DEFAULT_PREFS: Prefs = { view: "board", hideEmpty: false, platform: "all" };
// per board, in this browser: board or table, whether empty stages show, and
// which platform's numbers (filters saved here before are no longer read)
const prefsKey = (boardId: string) => `space:board:${boardId}`;

const PLATFORM_ICON: Record<Platform | "all", React.ReactNode> = {
  all: <Layers size={13} />,
  email: <Mail size={13} className="text-sky-400" />,
  instagram: <InstagramIcon size={13} className="text-pink-400" />,
  linkedin: <LinkedinIcon size={13} className="text-blue-400" />,
};
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
  boardTemplates,
}: {
  teamId: string;
  portal: { id: string; name: string };
  boards: { id: string; name: string; slug: string }[];
  board: BoardData | null;
  people: Person[];
  canBuild: boolean;
  initialLeadId: string | null;
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
  // the Filter menu's ticked values, by property
  const [picks, setPicks] = useState<FacetPicks>({});
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // the board being switched to, until it arrives
  const [going, setGoing] = useState<string | null>(null);
  if (going && (board?.slug === going || !switching)) setGoing(null);
  // Instagram and LinkedIn marks tapped here show at once, ahead of the board's refresh
  const [tracked, setTracked] = useState<Record<string, Marks>>({});
  const [trackError, setTrackError] = useState<string | null>(null);
  async function track(id: string, change: MarkChange) {
    const before = tracked[id];
    setTrackError(null);
    setTracked((t) => ({ ...t, [id]: withMark(t[id] ?? board?.leads.find((l) => l.id === id)?.marks ?? {}, change) }));
    const res = await setLeadMark(id, change).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    if (res.error) {
      setTracked((t) => {
        const next = { ...t };
        if (before) next[id] = before;
        else delete next[id];
        return next;
      });
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
      const platform = PLATFORMS.find((p) => p === saved?.platform) ?? "all";
      setPrefs({ view: saved?.view === "table" || saved?.view === "list" ? saved.view : "board", hideEmpty: saved?.hideEmpty === true, platform }); // eslint-disable-line react-hooks/set-state-in-effect
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
    setPicks({});
    setGoing(slug);
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
  const leads = board.leads.map((l) => (tracked[l.id] ? { ...l, marks: tracked[l.id] } : l));
  // what the board's leads can be filtered on, and the values ticked (only
  // those some lead still has)
  const groups = facets(leads, board.fields);
  const picked = groups.flatMap((g) => g.values.filter((v) => picks[g.field]?.includes(v.key)).map((v) => ({ g, v })));
  const on: FacetPicks = {};
  for (const { g, v } of picked) (on[g.field] ??= []).push(v.key);
  const toggle = (field: string, key: string) => setPicks((p) => ({ ...p, [field]: p[field]?.includes(key) ? p[field].filter((k) => k !== key) : [...(p[field] ?? []), key] }));
  const shown = leads.filter((l) => passesFacets(l.values, on, groups) && (!q || searchText(l, contactFields).includes(q)));
  // the views show 10 leads at a time; a new search, filter or board starts them at 10 again
  const filterKey = JSON.stringify([board.id, q, on]);
  // reaching out, in numbers: every lead on the board, whatever is filtered
  // or searched, on one platform or all
  const stats = outreachStart(board.stages) >= 0 ? outreachStats(leads, prefs.platform === "all" ? null : prefs.platform) : null;
  const reach = stats && reachOutCounts(board, leads, prefs.platform === "all" ? null : prefs.platform);
  const manualOnly = prefs.platform === "instagram" || prefs.platform === "linkedin";
  const filtered = shown.length !== board.leads.length;
  const lead = openId ? (leads.find((l) => l.id === openId) ?? null) : null;

  return (
    // who may rename and delete the board's tags and message templates, for
    // the views deep inside (values.tsx, Messages.tsx)
    <CanBuild.Provider value={canBuild}>
    <div className="flex min-w-0 flex-col gap-4">
      {/* the boards: pick which; the open one is renamed or deleted where
          it sits, and a new one starts from the + */}
      {(boards.length > 1 || canBuild) && (
        <div className="flex max-w-full items-center gap-2">
        <div role="tablist" aria-label="Boards" className={`${SEG_ROW} max-w-full overflow-x-auto`}>
          {boards.map((b) => {
            // the one picked lights at once, ahead of its board loading
            const on = (going ?? board.slug) === b.slug;
            const tools = on && !going && !renaming;
            return (
              <div key={b.id} role="tab" aria-selected={on} className="seg group/tab flex max-w-[18rem] shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-medium">
                {on && !going ? (
                  canBuild ? <EditableName name={b.name} onSave={rename(b.id)} pencil="none" editing={renaming} onEditingChange={setRenaming} /> : <span className="truncate">{b.name}</span>
                ) : (
                  <button type="button" onClick={() => switchTo(b.slug)} className="-mx-3.5 -my-1.5 truncate px-3.5 py-1.5">
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
        {canBuild && (
          <button type="button" onClick={() => setCreating(true)} aria-label="New board" title="New board" className="chip grid size-9 shrink-0 place-items-center rounded-full">
            <Plus size={15} />
          </button>
        )}
        </div>
      )}

      {/* reaching out, in numbers: one panel, its platform tabs on top and
          the three numbers under them for whichever is picked (all, or one);
          and whether this browser's mail tracker is counting email opens */}
      {stats && (
        <section className="panel overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-2.5">
            <div className={SEG_ROW}>
              {(["all", ...PLATFORMS] as const).map((p) => (
                <button key={p} type="button" aria-pressed={prefs.platform === p} onClick={() => savePrefs({ platform: p })} className="seg flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
                  {PLATFORM_ICON[p]} {p === "all" ? "All" : PLATFORM_NAME[p]}
                </button>
              ))}
            </div>
            <div className="ml-auto">
              <TrackerChip />
            </div>
          </div>
          {/* Instagram and LinkedIn are tapped, Replied only: no open rate to
              show. LinkedIn shows how many took the connection request. */}
          <div className={`grid grid-cols-1 divide-y divide-white/[0.06] sm:divide-x sm:divide-y-0 ${prefs.platform === "instagram" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
            <StatTile bare label="Unique reach outs" value={reach?.unique ?? 0} Icon={Users} />
            <StatTile bare label="Total reach outs" value={reach?.total ?? 0} Icon={Send} />
            {prefs.platform === "linkedin" && (
              <StatTile
                bare
                label="Accepted"
                value={`${stats.acceptRate}%`}
                lit={stats.accepted > 0}
                Icon={UserCheck}
                note={stats.reached > 0 && <p className="text-xs text-muted">{stats.accepted} {stats.accepted === 1 ? "request taken" : "requests taken"}</p>}
              />
            )}
            {!manualOnly && (
              <StatTile
                bare
                label="Open rate"
                value={`${stats.openRate}%`}
                lit={stats.opened > 0}
                Icon={MailOpen}
                note={stats.reached > 0 && <p className="text-xs text-muted">{stats.opened} opened</p>}
              />
            )}
            <StatTile
              bare
              label="Reply rate"
              value={`${stats.replyRate}%`}
              lit={stats.replied > 0}
              tone="emerald"
              Icon={Reply}
              note={stats.reached > 0 && <p className="text-xs text-muted">{stats.replied} {stats.replied === 1 ? "reply" : "replies"}</p>}
            />
          </div>
        </section>
      )}

      {/* how to see it, and what */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={SEG_ROW}>
          {(
            [
              ["board", Kanban, "Board"],
              ["list", Rows3, "List"],
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
        {groups.length > 0 && (
          <Menu
            height={460}
            width={340}
            buttonClassName={chip(picked.length > 0)}
            button={
              <>
                <Filter size={13} className="text-accent" /> {picked.length ? `${picked.length} ${picked.length === 1 ? "filter" : "filters"}` : "Filter"}
              </>
            }
          >
            {() => <FilterPanel groups={groups} picks={on} onToggle={toggle} onClear={() => setPicks({})} />}
          </Menu>
        )}
        {picked.map(({ g, v }) => {
          // contacts read on their own ("Has email"), the rest with their property
          const label = g.kind === "contact" ? v.label : `${g.name}: ${facetLabel(v.label)}`;
          return (
            <span key={`${g.field}:${v.key}`} title={label} className={`fade-in ${chip(true)} max-w-72 pr-1.5`}>
              <span className="min-w-0 truncate">{label}</span>
              <button type="button" onClick={() => toggle(g.field, v.key)} aria-label={`Remove ${label}`} title="Remove" className="grid size-5 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground">
                <X size={11} />
              </button>
            </span>
          );
        })}
        {picked.length > 0 && (
          <button type="button" onClick={() => setPicks({})} className={`fade-in ${chip(false)}`}>
            Clear
          </button>
        )}
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
          <LeadBoard board={board} leads={shown} filterKey={filterKey} canBuild={canBuild} hideEmpty={prefs.hideEmpty} onShowEmpty={() => savePrefs({ hideEmpty: false })} onOpen={open} onTrack={track} />
        ) : prefs.view === "list" ? (
          <LeadList board={board} leads={shown} filtered={filtered} filterKey={filterKey} onOpen={open} />
        ) : (
          <LeadTable board={board} leads={shown} filtered={filtered} filterKey={filterKey} onOpen={open} />
        )}
      </div>

      <LeadPeek lead={lead} board={board} people={people} canBuild={canBuild} onClose={() => open(null)} onTrack={track} />
      <NewSpaceDialog open={creating} onClose={() => setCreating(false)} teamId={teamId} parentId={portal.id} kind="board" base={pathname} siblings={boardTemplates ?? boards} />
      <ReasonDialog
        open={deleting}
        danger
        title={`Delete ${board.name}?`}
        hint="Its stages, properties and messages go with it, kept with what was deleted. A board still holding leads can't be deleted."
        confirm="Delete board"
        onCancel={() => setDeleting(false)}
        onConfirm={async (reason) => {
          const res = await deleteSpace(board.id, reason);
          if (res.error) return res.error;
          setDeleting(false);
          // on to another board, or the portal's empty page
          const next = boards.find((b) => b.id !== board.id);
          if (next) switchTo(next.slug);
          else router.replace(pathname);
          router.refresh();
        }}
      />
    </div>
    </CanBuild.Provider>
  );
}

// The Filter menu (Abhishek, 23 Oct 2026). Up top, the two that lead, the
// kind of opener and the country, as chips to tap, every choice there even
// before a lead has it; underneath, "More filters": each other property
// folded, its values to tick with how many leads have each
function FilterPanel({ groups, picks, onToggle, onClear }: { groups: Facet[]; picks: FacetPicks; onToggle: (field: string, key: string) => void; onClear: () => void }) {
  const leading = groups.filter(leadingFacet);
  // the others only where some lead has a value (or one is ticked)
  const rest = groups.filter((g) => !leadingFacet(g) && g.values.some((v) => v.count || picks[g.field]?.includes(v.key)));
  // a property with something ticked starts open
  const [open, setOpen] = useState<Set<string>>(() => new Set(rest.filter((g) => picks[g.field]?.length).map((g) => g.field)));
  const [more, setMore] = useState(() => open.size > 0 || !leading.length);
  const any = Object.values(picks).some((v) => v.length);
  const fold = (field: string) => setOpen((o) => (o.has(field) ? new Set([...o].filter((f) => f !== field)) : new Set([...o, field])));
  return (
    // no taller than the menu's 460 with its padding and edge, so it's never cut off
    <div className="flex max-h-[min(28rem,70vh)] flex-col overflow-y-auto p-1.5">
      {leading.map((g) => (
        <div key={g.field} role="group" aria-label={g.name} className="flex flex-col gap-2 px-1.5 pt-1.5 pb-3">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{g.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.values.map((v) => {
              const on = !!picks[g.field]?.includes(v.key);
              return (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={on}
                  disabled={!v.count && !on}
                  title={v.label}
                  onClick={() => onToggle(g.field, v.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 disabled:opacity-40 ${
                    on ? "border-accent/50 bg-accent/15 text-foreground" : "border-white/[0.09] bg-white/[0.03] text-foreground/85 enabled:hover:border-white/20 enabled:hover:bg-white/[0.06]"
                  }`}
                >
                  {on && <Check size={11} strokeWidth={3} className="pop-in text-accent" />}
                  {facetLabel(v.label)}
                  <span className={`tabular-nums ${on ? "text-accent" : "text-muted"}`}>{v.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {rest.length > 0 && (
        <div className={leading.length ? "border-t border-white/[0.06] pt-1.5" : ""}>
          {leading.length > 0 && (
            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="menu-item px-1.5 py-1.5 text-xs text-muted">
              <ChevronRight size={13} className={`shrink-0 transition-transform duration-200 ${more ? "rotate-90" : ""}`} />
              More filters
            </button>
          )}
          <Reveal open={more}>
            <div className="flex flex-col">
              {rest.map((g) => {
                const ticked = picks[g.field]?.length ?? 0;
                const isOpen = open.has(g.field);
                return (
                  <div key={g.field} role="group" aria-label={g.name}>
                    <button type="button" aria-expanded={isOpen} onClick={() => fold(g.field)} className="menu-item px-1.5 py-1.5 text-xs">
                      <ChevronRight size={13} className={`shrink-0 text-muted transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                      <span className="min-w-0 flex-1 truncate text-foreground/90">{g.name}</span>
                      {ticked > 0 && <span className="fade-in rounded-full bg-accent/15 px-1.5 text-[11px] text-accent tabular-nums">{ticked}</span>}
                    </button>
                    <Reveal open={isOpen}>
                      <div className="flex flex-col pb-1 pl-5">
                        {g.values
                          .filter((v) => v.count || picks[g.field]?.includes(v.key))
                          .map((v) => {
                            const on = !!picks[g.field]?.includes(v.key);
                            return (
                              <button key={v.key} type="button" aria-pressed={on} onClick={() => onToggle(g.field, v.key)} className="menu-item px-1.5 py-1.5 text-xs">
                                <span className={`grid size-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors duration-150 ${on ? "border-accent/60 bg-accent/20 text-accent" : "border-white/[0.18]"}`}>
                                  {on && <Check size={10} strokeWidth={3} className="pop-in" />}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{facetLabel(v.label)}</span>
                                <span className="shrink-0 text-muted tabular-nums">{v.count}</span>
                              </button>
                            );
                          })}
                      </div>
                    </Reveal>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      )}

      {any && (
        <div className="fade-in mt-1 flex justify-end border-t border-white/[0.06] px-1.5 pt-2 pb-0.5">
          <button type="button" onClick={onClear} className="btn btn-xs btn-ghost">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
