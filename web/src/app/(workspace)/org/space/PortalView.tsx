"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, EyeOff, Filter, Kanban, Layers, Mail, MailOpen, MapPin, Pencil, Plus, Quote, Reply, Rows3, Search, Send, Table2, Trash2, Users, UserCheck, X } from "lucide-react";
import { CHANNELS, keptRules, outreachStart, outreachStats, passesRules, PLATFORM_NAME, reachOutCounts, PLATFORMS, withMark, type BoardData, type Contact, type FieldData, type LeadData, type LeadRule, type MarkChange, type Marks, type Person, type Platform } from "@/lib/space";
import { LeadBoard } from "./LeadBoard";
import { LeadList } from "./LeadList";
import { LeadTable } from "./LeadTable";
import { LeadPeek } from "./LeadPeek";
import { NewSpaceDialog } from "./NewSpaceDialog";
import { CanBuild, Menu } from "./values";
import { deleteSpace, renameSpace, setLeadMark } from "./actions";
import { ReasonDialog } from "./ReasonDialog";
import { StatTile } from "../../StatTile";
import { EditableName } from "../../EditableName";
import { Dropdown } from "../../Dropdown";
import { chip } from "../../chip";
import { setParam } from "../../urlState";
import { InstagramIcon, LinkedinIcon } from "../../PlatformIcon";
import { TrackerChip } from "../../TrackerChip";

type View = "board" | "list" | "table";
type SavedFilter = { name: string; rules: LeadRule[] };
type Prefs = { view: View; hideEmpty: boolean; platform: Platform | "all"; filters: SavedFilter[] };
const DEFAULT_PREFS: Prefs = { view: "board", hideEmpty: false, platform: "all", filters: [] };
// per board, in this browser: board or table, whether empty stages show, and
// the filters saved by name
const prefsKey = (boardId: string) => `space:board:${boardId}`;

const PLATFORM_ICON: Record<Platform | "all", React.ReactNode> = {
  all: <Layers size={13} />,
  email: <Mail size={13} className="text-sky-400" />,
  instagram: <InstagramIcon size={13} className="text-pink-400" />,
  linkedin: <LinkedinIcon size={13} className="text-blue-400" />,
};
const SEG_ROW = "flex w-fit items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]";
const SMALL_INPUT = "w-full min-w-0 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground outline-none! transition-colors placeholder:text-muted focus:border-accent/40";

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
  // the Opener and Country picks, by field, and the Filter menu's rules
  const [quick, setQuick] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<LeadRule[]>([]);
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
      const filters = Array.isArray(saved?.filters) ? saved.filters : [];
      setPrefs({ view: saved?.view === "table" || saved?.view === "list" ? saved.view : "board", hideEmpty: saved?.hideEmpty === true, platform, filters }); // eslint-disable-line react-hooks/set-state-in-effect
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
    setQuick({});
    setRules([]);
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
  const whose = leads.filter((l) => who === "all" || [l.createdBy.id, l.assignedTo?.id].includes(who === "mine" ? viewerId : who));
  // the Opener and Country filters, on a board that has them, then the Filter
  // menu's own (only those whose property and tags the board still has)
  const quickFields = [/^opener$/i, /^country$/i].flatMap((re) => board.fields.find((f) => f.kind === "select" && re.test(f.name)) ?? []);
  const active = keptRules(rules, board.fields);
  const allRules = keptRules([...quickFields.flatMap((f) => (quick[f.id] ? [{ field: f.id, op: "is", values: [quick[f.id]] }] : [])), ...rules], board.fields);
  const shown = whose.filter((l) => passesRules(l.values, allRules, board.fields) && (!q || searchText(l, contactFields).includes(q)));
  const savedFilters = prefs.filters.flatMap((s) => {
    const kept = keptRules(s?.rules, board.fields);
    return typeof s?.name === "string" && kept.length ? [{ name: s.name, rules: kept }] : [];
  });
  // reaching out, in numbers: for whoever is picked, whatever is searched
  // on one platform or all
  const stats = outreachStart(board.stages) >= 0 ? outreachStats(whose, prefs.platform === "all" ? null : prefs.platform) : null;
  const reach = stats && reachOutCounts(board, whose, prefs.platform === "all" ? null : prefs.platform);
  const manualOnly = prefs.platform === "instagram" || prefs.platform === "linkedin";
  const filtered = shown.length !== board.leads.length;
  const lead = openId ? (leads.find((l) => l.id === openId) ?? null) : null;
  const whoOptions = [
    { value: "all", label: "Everyone" },
    ...(viewerId ? [{ value: "mine", label: "Mine" }] : []),
    ...people.map((p) => ({ value: p.id, label: p.name, group: "People" })),
  ];

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
        <Dropdown size="sm" pill={{ icon: <Users size={13} className="text-accent" /> }} value={who} options={whoOptions} onChange={setWho} />
        {quickFields.map((f) => (
          <Dropdown
            key={f.id}
            size="sm"
            pill={{ icon: /country/i.test(f.name) ? <MapPin size={13} className="text-emerald-300" /> : <Quote size={13} className="text-violet-300" /> }}
            value={quick[f.id] ?? ""}
            options={[{ value: "", label: `Any ${f.name.toLowerCase()}` }, ...f.options.map((o) => ({ value: o.id, label: o.name }))]}
            onChange={(v) => setQuick((x) => ({ ...x, [f.id]: v }))}
          />
        ))}
        <Menu
          height={380}
          width={300}
          buttonClassName={chip(active.length > 0)}
          button={
            <>
              <Filter size={13} className="text-accent" /> {active.length ? `${active.length} ${active.length === 1 ? "filter" : "filters"}` : "Filter"}
            </>
          }
        >
          {(close) => <FilterPanel fields={board.fields} rules={active} saved={savedFilters} onRules={setRules} onSaved={(filters) => savePrefs({ filters })} close={close} />}
        </Menu>
        {active.map((r, i) => {
          const label = ruleLabel(r, board.fields);
          return (
            <span key={i} title={label} className={`fade-in ${chip(true)} max-w-72 pr-1.5`}>
              <span className="min-w-0 truncate">{label}</span>
              <button type="button" onClick={() => setRules(active.filter((_, j) => j !== i))} aria-label={`Remove ${label}`} title="Remove" className="grid size-5 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground">
                <X size={11} />
              </button>
            </span>
          );
        })}
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
        ) : prefs.view === "list" ? (
          <LeadList board={board} leads={shown} filtered={filtered} onOpen={open} />
        ) : (
          <LeadTable board={board} leads={shown} filtered={filtered} onOpen={open} />
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

// a filter as its chip reads: "Country: USA, UK", "Bio contains “cooking”",
// "Contacts: has Instagram"
function ruleLabel(r: LeadRule, fields: FieldData[]) {
  const f = fields.find((x) => x.id === r.field);
  if (!f) return "";
  if (r.op === "is") return `${f.name}: ${f.options.filter((o) => r.values.includes(o.id)).map((o) => o.name).join(", ")}`;
  if (r.op === "contains") return `${f.name} contains “${r.values[0]}”`;
  if (f.kind === "checkbox") return `${f.name}: ${r.op === "has" ? "checked" : "not checked"}`;
  return `${f.name}: ${r.op === "has" ? "has" : "doesn't have"} ${CHANNELS.find((c) => c.kind === r.values[0])?.label ?? "any"}`;
}

// The Filter menu: a rule on any property, added to the ones on (each must
// hold); what's on, saved by name for this board; and the saved ones, to put
// back on or delete
function FilterPanel({
  fields,
  rules,
  saved,
  onRules,
  onSaved,
  close,
}: {
  fields: FieldData[];
  rules: LeadRule[];
  saved: SavedFilter[];
  onRules: (rules: LeadRule[]) => void;
  onSaved: (saved: SavedFilter[]) => void;
  close: () => void;
}) {
  const [fieldId, setFieldId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [has, setHas] = useState(true);
  const [channel, setChannel] = useState("");
  const [name, setName] = useState("");
  const field = fields.find((f) => f.id === fieldId);
  // tags are picked, words are typed, and the rest are had or not
  const op = field?.kind === "select" || field?.kind === "multi" ? "is" : field?.kind === "text" || field?.kind === "count" || field?.kind === "date" ? "contains" : has ? "has" : "lacks";
  const values = op === "is" ? picked : op === "contains" ? [text.trim()].filter(Boolean) : channel ? [channel] : [];
  const ready = !!field && (values.length > 0 || op === "has" || op === "lacks");
  function pickField(id: string) {
    setFieldId(id);
    setPicked([]);
    setText("");
    setHas(true);
    setChannel("");
  }
  function add() {
    if (!field || !ready) return;
    onRules([...rules, { field: field.id, op, values }]);
    pickField("");
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    onSaved([...saved.filter((s) => s.name !== n), { name: n, rules }]);
    setName("");
  }
  // no taller than the Filter menu's 380 with its padding and edge, so it's never cut off
  return (
    <div className="flex max-h-[min(23rem,70vh)] flex-col gap-2.5 overflow-y-auto p-1.5">
      <Dropdown size="sm" value={fieldId} placeholder="Property" options={fields.map((f) => ({ value: f.id, label: f.name }))} onChange={pickField} />
      {field && (
        <div key={field.id} className="fade-in flex flex-col gap-2">
          {op === "is" ? (
            <div className="flex flex-wrap gap-1.5">
              {field.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={picked.includes(o.id)}
                  onClick={() => setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : [...p, o.id]))}
                  className="chip rounded-full px-3 py-1 text-xs"
                >
                  {o.name}
                </button>
              ))}
            </div>
          ) : op === "contains" ? (
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Contains" aria-label="Contains" className={SMALL_INPUT} />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <div className={SEG_ROW}>
                {[true, false].map((h) => (
                  <button key={String(h)} type="button" aria-pressed={has === h} onClick={() => setHas(h)} className="seg rounded-full px-3 py-1 text-xs font-medium">
                    {field.kind === "checkbox" ? (h ? "Checked" : "Not checked") : h ? "Has" : "Doesn't have"}
                  </button>
                ))}
              </div>
              {field.kind === "contacts" && (
                <div className="min-w-28 flex-1">
                  <Dropdown size="sm" value={channel} options={[{ value: "", label: "Any" }, ...CHANNELS.map((c) => ({ value: c.kind, label: c.label }))]} onChange={setChannel} />
                </div>
              )}
            </div>
          )}
          <button type="button" onClick={add} disabled={!ready} className="btn btn-sm btn-glow w-fit">
            Add filter
          </button>
        </div>
      )}
      {rules.length > 0 && (
        <form onSubmit={save} className="flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this filter" aria-label="Filter name" className={SMALL_INPUT} />
          <button type="submit" disabled={!name.trim()} className="btn btn-sm btn-ghost shrink-0">
            Save
          </button>
        </form>
      )}
      {saved.length > 0 && (
        <div className="flex flex-col border-t border-white/[0.06] pt-1.5">
          {saved.map((s) => (
            <div key={s.name} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onRules(s.rules);
                  close();
                }}
                className="menu-item px-2 py-1.5 text-xs"
              >
                <Bookmark size={13} className="shrink-0 text-accent" />
                <span className="min-w-0 truncate">{s.name}</span>
              </button>
              <button type="button" onClick={() => onSaved(saved.filter((x) => x !== s))} aria-label={`Delete ${s.name}`} title={`Delete ${s.name}`} className="grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-red-300">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
