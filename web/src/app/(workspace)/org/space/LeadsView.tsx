"use client";

import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Filter, Plus, Search, Table2, Trash2, Undo2, X } from "lucide-react";
import { ADDED, NO_FILTER, passesSheetFilter, REACH, hasReach, sheetText, shownAs, type OutreachBoard, type SheetData, type SheetFilter, type SheetLead } from "@/lib/leadSheet";
import { CONTACT_ROLES, hexOf, type Contact, type LinkValue, type OptionData } from "@/lib/space";
import { BoardTabs, SEG_ROW } from "./BoardTabs";
import { LeadSheet } from "./LeadSheet";
import { LeadTags, Paste, Person, SheetLeadWindow } from "./SheetLead";
import { CanBuild, Menu, SECTION, SECTION_BODY, SECTION_HEAD, SECTION_TITLE, hrefOf } from "./values";
import { chip } from "../../chip";
import { Avatar } from "../../TaskCard";
import { PlatformMark } from "../../PlatformIcon";
import { NewSpaceDialog } from "./NewSpaceDialog";
import { createLead, deleteLeadForever, setLeadDead } from "./actions";
import { ConfirmButton } from "../../ConfirmButton";
import { setParam } from "../../urlState";
import { closeOnBackdrop } from "../../dialog";

// Sales > Leads (Abhishek, 3 Nov 2026): one tab per type of lead (Podcast,
// Doctors), each a spreadsheet anyone in Sales adds to. A lead opens in its
// window (?lead=); one deleted goes to Dead leads, to restore or delete for good.
export function LeadsView({
  teamId,
  portal,
  boards,
  counts,
  sheet,
  targets,
  canBuild,
  canAdd = canBuild,
  initialLeadId,
}: {
  teamId: string;
  portal: { id: string; name: string };
  boards: { id: string; name: string; slug: string }[];
  // how many leads each tab has collected, by its id
  counts?: Record<string, number>;
  sheet: SheetData | null;
  // the outreach boards a lead can move to
  targets: OutreachBoard[];
  canBuild: boolean;
  // may add a tab (Sales' Level 2 too)
  canAdd?: boolean;
  initialLeadId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [switching, startSwitch] = useTransition();
  const [openId, setOpenId] = useState<string | null>(initialLeadId);
  const [query, setQuery] = useState("");
  const [dead, setDead] = useState(false);
  // the Filter menu's picks (lib/leadSheet passesSheetFilter)
  const [filter, setFilter] = useState<SheetFilter>(NO_FILTER);
  // a restore or a delete that didn't go through
  const [failed, setFailed] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // the tab being switched to, until it arrives
  const [going, setGoing] = useState<string | null>(null);
  if (going && (sheet?.slug === going || !switching)) setGoing(null);

  function open(id: string | null) {
    setOpenId(id);
    setParam("lead", id);
  }
  // another tab: a step you can go Back to, staying where you are on the page
  function switchTo(slug: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("board", slug);
    url.searchParams.delete("lead");
    setOpenId(null);
    setQuery("");
    setDead(false);
    setFilter(NO_FILTER);
    setGoing(slug);
    startSwitch(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
  }

  if (!sheet) {
    return (
      <>
        <div className="fade-in flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Table2 size={18} />
          </span>
          <p className="text-sm font-medium">No tabs yet</p>
          {canAdd && (
            <button type="button" onClick={() => setCreating(true)} className="btn btn-sm btn-glow">
              <Plus size={14} /> New tab
            </button>
          )}
        </div>
        <NewSpaceDialog open={creating} onClose={() => setCreating(false)} teamId={teamId} parentId={portal.id} kind="board" base={pathname} siblings={[]} tab />
      </>
    );
  }

  const q = query.trim().toLowerCase();
  const deadCount = sheet.leads.filter((l) => l.dead).length;
  // the tab's leads (or dead ones) the search finds, then the ones the filter keeps
  const found = sheet.leads.filter((l) => l.dead === dead && (!q || sheetText(l).includes(q)));
  const shown = found.filter((l) => passesSheetFilter(l, filter));
  // what's picked, each to take off on its own
  const picked = [
    ...ADDED.filter((a) => a.key === filter.added).map((a) => ({ key: `added:${a.key}`, label: a.label, off: () => setFilter((f) => ({ ...f, added: null })) })),
    ...filter.by.map((id) => ({ key: `by:${id}`, label: `Added by ${sheet.leads.find((l) => l.createdBy.id === id)?.createdBy.name ?? "someone"}`, off: () => setFilter((f) => ({ ...f, by: f.by.filter((x) => x !== id) })) })),
    ...REACH.filter((r) => filter.has.includes(r.key)).map((r) => ({ key: `has:${r.key}`, label: `Has ${r.label === "Email" || r.label === "Phone" ? r.label.toLowerCase() : r.label}`, off: () => setFilter((f) => ({ ...f, has: f.has.filter((x) => x !== r.key) })) })),
    ...(sheet.tagsField?.options ?? []).filter((o) => filter.tags.includes(o.id)).map((o) => ({ key: `tag:${o.id}`, label: `Tag: ${o.name}`, off: () => setFilter((f) => ({ ...f, tags: f.tags.filter((x) => x !== o.id) })) })),
  ];
  const lead = openId ? (sheet.leads.find((l) => l.id === openId && !l.dead) ?? null) : null;
  async function act(work: Promise<{ error?: string }>) {
    setFailed(null);
    const res = await work.catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    if (res.error) setFailed(res.error);
    else router.refresh();
  }
  // round and quiet at the row's end, as the list's links are
  const ROUND = "grid size-8 place-items-center rounded-full bg-white/[0.04] text-muted ring-1 ring-white/[0.07] transition-colors hover:bg-white/[0.08]";
  const deadActions = (l: SheetLead) => (
    <>
      <button type="button" onClick={() => act(setLeadDead(l.id, false))} title="Restore" aria-label={`Restore ${l.title}`} className={`${ROUND} hover:text-foreground`}>
        <Undo2 size={14} />
      </button>
      <span title="Delete for good" className="flex">
        <ConfirmButton message={`Delete “${l.title}” for good? This can't be undone.`} onConfirm={() => act(deleteLeadForever(l.id))} className={`${ROUND} hover:text-red-400`}>
          <Trash2 size={14} />
          <span className="sr-only">Delete {l.title} for good</span>
        </ConfirmButton>
      </span>
    </>
  );
  const roles = [...new Set(sheet.leads.flatMap((l) => l.contacts.map((p) => p.role).filter(Boolean)))];

  return (
    // whoever builds renames and deletes the tags too (TagEditor)
    <CanBuild.Provider value={canBuild}>
    <div className="flex min-w-0 flex-col gap-4">
      <BoardTabs
        teamId={teamId}
        portalId={portal.id}
        boards={boards}
        counts={counts}
        active={going ?? sheet.slug}
        current={{ id: sheet.id, name: sheet.name }}
        loading={!!going}
        canBuild={canBuild}
        canAdd={canAdd}
        onSwitch={switchTo}
        templates={[]}
        deleteHint="It's kept with what was deleted. A tab still holding leads can't be deleted."
        tabs
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-8 w-full items-center gap-2 rounded-full bg-white/[0.04] px-3 ring-1 ring-white/[0.07] transition-shadow focus-within:ring-accent/40 sm:w-72">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
            placeholder="Search leads, people and links"
            aria-label="Search leads, people and links"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none! placeholder:text-muted/60"
          />
        </label>
        {found.length > 0 || picked.length ? (
          <Menu
            height={440}
            width={340}
            buttonClassName={chip(picked.length > 0)}
            button={
              <>
                <Filter size={13} className="text-accent" /> {picked.length ? `${picked.length} ${picked.length === 1 ? "filter" : "filters"}` : "Filter"}
              </>
            }
          >
            {() => <LeadsFilter leads={found} tags={sheet.tagsField?.options ?? []} filter={filter} onChange={setFilter} />}
          </Menu>
        ) : null}
        {picked.map((p) => (
          <span key={p.key} className={`fade-in ${chip(true)} pr-1.5`}>
            <span className="min-w-0 truncate">{p.label}</span>
            <button type="button" onClick={p.off} aria-label={`Remove ${p.label}`} title="Remove" className="grid size-5 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground">
              <X size={11} />
            </button>
          </span>
        ))}
        {/* the tab's leads, or the ones deleted */}
        {(deadCount > 0 || dead) && (
          <div className={SEG_ROW}>
            {(
              [
                [false, "Leads", sheet.leads.length - deadCount],
                [true, "Dead leads", deadCount],
              ] as const
            ).map(([key, label, n]) => (
              <button key={label} type="button" aria-pressed={dead === key} onClick={() => setDead(key)} className="seg rounded-full px-3 py-1 text-xs font-medium">
                {label}
                {/* the count, quietly beside it */}
                <span className="ml-1.5 text-[11px] font-normal text-muted tabular-nums">{n}</span>
              </button>
            ))}
          </div>
        )}
        <AddLead boardId={sheet.id} roles={roles} tagsField={sheet.tagsField} onAdded={() => setDead(false)} />
      </div>
      {failed && (
        <p role="alert" className="fade-in text-xs text-red-300">
          {failed}
        </p>
      )}

      <div className={`min-w-0 transition-opacity duration-200 ${switching ? "opacity-50" : ""}`}>
        {shown.length ? (
          dead ? (
            <LeadSheet key="dead" tab={sheet.id} leads={shown} tagsField={sheet.tagsField} filterKey={JSON.stringify([sheet.id, q, "dead"])} actions={deadActions} />
          ) : (
            <LeadSheet key="leads" tab={sheet.id} leads={shown} tagsField={sheet.tagsField} filterKey={JSON.stringify([sheet.id, q])} onOpen={(l) => open(l.id)} />
          )
        ) : (
          <p className="fade-in rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted">{picked.length ? "No leads match these filters." : q ? "No leads match this search." : dead ? "No dead leads." : "No leads yet."}</p>
        )}
      </div>

      <SheetLeadWindow lead={lead} sheet={sheet} targets={targets} roles={roles} onClose={() => open(null)} />
    </div>
    </CanBuild.Provider>
  );
}

// Leadwell's Filter menu (Abhishek, 20 Nov 2026), in the look of the
// outreach boards' own: when it was added, who added it, and what it can be
// reached on, each a row of chips with how many leads have it
function LeadsFilter({ leads, tags, filter, onChange }: { leads: SheetLead[]; tags: OptionData[]; filter: SheetFilter; onChange: (f: SheetFilter) => void }) {
  // the menu's moment: it's drawn afresh each time it opens
  const [now] = useState(() => Date.now());
  const people = [...Map.groupBy(leads, (l) => l.createdBy.id).values()].map((ls) => ({ ...ls[0].createdBy, count: ls.length })).sort((a, b) => b.count - a.count);
  const any = filter.added || filter.by.length || filter.has.length || filter.tags.length;
  // only the tags some lead here has (or one ticked)
  const tagCounts = tags.map((o) => ({ ...o, count: leads.filter((l) => l.tags.includes(o.id)).length })).filter((o) => o.count || filter.tags.includes(o.id));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="flex max-h-[min(26rem,70vh)] flex-col overflow-y-auto p-1.5">
      <Group label="Added">
        {ADDED.map((a) => (
          <Pick key={a.key} on={filter.added === a.key} count={leads.filter((l) => now - Date.parse(l.createdAt) <= a.ms).length} onClick={() => onChange({ ...filter, added: filter.added === a.key ? null : a.key })}>
            {a.label}
          </Pick>
        ))}
      </Group>
      {people.length > 1 && (
        <Group label="Added by">
          {people.map((p) => (
            <Pick key={p.id} on={filter.by.includes(p.id)} count={p.count} onClick={() => onChange({ ...filter, by: toggle(filter.by, p.id) })}>
              <Avatar name={p.name} size={16} presence={false} />
              {p.name}
            </Pick>
          ))}
        </Group>
      )}
      {tagCounts.length > 0 && (
        <Group label="Tags">
          {tagCounts.map((o) => (
            <Pick key={o.id} on={filter.tags.includes(o.id)} count={o.count} onClick={() => onChange({ ...filter, tags: toggle(filter.tags, o.id) })}>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: hexOf(o.color) }} />
              {o.name}
            </Pick>
          ))}
        </Group>
      )}
      <Group label="Has">
        {REACH.map((r) => (
          <Pick key={r.key} on={filter.has.includes(r.key)} count={leads.filter((l) => hasReach(l, r.key)).length} onClick={() => onChange({ ...filter, has: toggle(filter.has, r.key) })}>
            {r.label}
          </Pick>
        ))}
      </Group>
      {any ? (
        <div className="fade-in mt-1 flex justify-end border-t border-white/[0.06] px-1.5 pt-2 pb-0.5">
          <button type="button" onClick={() => onChange(NO_FILTER)} className="btn btn-xs btn-ghost">
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2 px-1.5 pt-1.5 pb-3">
      <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
function Pick({ on, count, onClick, children }: { on: boolean; count: number; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!count && !on}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 disabled:opacity-40 ${
        on ? "border-accent/50 bg-accent/15 text-foreground" : "border-white/[0.09] bg-white/[0.03] text-foreground/85 enabled:hover:border-white/20 enabled:hover:bg-white/[0.06]"
      }`}
    >
      {on && <Check size={11} strokeWidth={3} className="pop-in text-accent" />}
      {children}
      <span className={`tabular-nums ${on ? "text-accent" : "text-muted"}`}>{count}</span>
    </button>
  );
}

// Add lead (Abhishek, 3 Nov 2026): everything at once, its name, its people
// (each with a designation and the links, emails and numbers pasted for
// them), its own links and notes. A lead needs a name and at least one way
// to reach it. Added from Dead leads, it shows the leads, where it went.
const blankPerson = (): Contact => ({ id: crypto.randomUUID(), name: "", role: "", channels: [] });
function AddLead({ boardId, roles, tagsField, onAdded }: { boardId: string; roles: string[]; tagsField: SheetData["tagsField"]; onAdded: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState<Contact[]>([]);
  const [links, setLinks] = useState<LinkValue[]>([]);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  // the person it opens with: typing starts in the lead's own name, not theirs
  const [firstId, setFirstId] = useState("");
  // the form drawn afresh each time it opens (the paste boxes empty too)
  const [opens, setOpens] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allRoles = [...new Set([...CONTACT_ROLES, "CTO", ...roles, ...people.map((p) => p.role).filter(Boolean)])];

  function open() {
    const first = blankPerson();
    setTitle("");
    setFirstId(first.id);
    setPeople([first]);
    setLinks([]);
    setNotes("");
    setTags([]);
    setError(null);
    setOpens((n) => n + 1);
    ref.current?.showModal();
  }
  async function submit(form: HTMLFormElement) {
    const kept = people.filter((p) => p.name.trim() || p.role.trim() || p.channels.some((c) => c.value.trim()));
    if (!title.trim()) return setError("Give the lead a name.");
    // nothing left behind in a paste box (an email in the lead's links, say)
    if ([...form.querySelectorAll<HTMLInputElement>("input[data-paste]")].some((i) => i.value.trim())) return setError("Add or clear the pasted text first.");
    if (!links.length && !kept.some((p) => p.channels.some((c) => c.value.trim()))) return setError("Add at least one link, email or phone number.");
    setBusy(true);
    setError(null);
    const res = await createLead(boardId, title, links, { contacts: kept.map((p) => ({ ...p, name: p.name.trim() })), notes, tags }).catch(() => ({ error: "That couldn't be saved. Check your connection and try again.", id: undefined }));
    setBusy(false);
    if (res.error || !res.id) return setError(res.error ?? "That couldn't be saved.");
    ref.current?.close();
    onAdded();
    router.refresh();
  }
  const patch = (pid: string, change: (p: Contact) => Contact) => setPeople((ps) => ps.map((p) => (p.id === pid ? change(p) : p)));

  return (
    <>
      <button type="button" onClick={open} className="btn btn-sm btn-glow ml-auto">
        <Plus size={14} /> Add lead
      </button>
      <dialog ref={ref} {...closeOnBackdrop} className="dialog-grow glass fixed top-1/2 left-1/2 m-0 max-h-[88vh] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-0 text-foreground">
        <form
          key={opens}
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
          className="flex max-h-[88vh] flex-col"
        >
          <div className="flex shrink-0 items-center justify-between px-5 pt-4">
            <p className="text-xs font-medium text-muted">New lead</p>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="-mr-1.5 flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
              <X size={15} />
            </button>
          </div>
          <div className="shrink-0 px-5 pt-2 pb-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name" aria-label="Name" autoFocus className="w-full bg-transparent text-lg font-medium text-foreground outline-none! placeholder:text-muted/60" />
            {/* its tags, right under its name (a tab's own tag comes on its own) */}
            {tagsField && (
              <div className="mt-2">
                <LeadTags field={tagsField} value={tags} save={setTags} />
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-auto flex-col gap-3 overflow-y-auto px-5 pb-5">
            <section className={SECTION}>
              <div className={SECTION_HEAD}>
                <span className={SECTION_TITLE}>People</span>
                <button type="button" onClick={() => setPeople((ps) => [...ps, blankPerson()])} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground">
                  <Plus size={13} /> Add person
                </button>
              </div>
              {people.length > 0 && (
                <div className={`${SECTION_BODY} flex flex-col gap-2.5`}>
                  {people.map((p) => (
                    <Person key={p.id} person={p} roles={allRoles} focus={p.id !== firstId} onChange={(change) => patch(p.id, change)} onBlur={() => {}} onRemove={() => setPeople((ps) => ps.filter((x) => x.id !== p.id))} />
                  ))}
                </div>
              )}
            </section>

            <section className={SECTION}>
              <div className={SECTION_HEAD}>
                <span className={SECTION_TITLE}>Links</span>
              </div>
              <div className={`${SECTION_BODY} flex flex-col gap-1.5`}>
                {links.map((l, i) => (
                  <div key={`${l.url}:${i}`} className="flex min-w-0 items-center gap-2 text-sm">
                    <PlatformMark url={l.url} size={13} className="text-muted" />
                    <span className="min-w-0 flex-1 truncate text-foreground/90">{shownAs({ kind: "other", value: l.url })}</span>
                    <button type="button" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove this link" title="Remove" className="grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:text-rose-300">
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <Paste
                  placeholder="Paste a link"
                  onAdd={(found) => {
                    // emails and numbers belong to a person: left in the box
                    const urls = found.flatMap((c) => (c.kind === "email" || c.kind === "phone" ? [] : [hrefOf(c.kind, c.value) ?? c.value]));
                    setLinks((ls) => [...ls, ...urls.filter((u) => !ls.some((l) => l.url.toLowerCase() === u.toLowerCase())).map((url) => ({ label: "", url }))]);
                    return found.filter((c) => c.kind === "email" || c.kind === "phone").map((c) => c.value);
                  }}
                />
              </div>
            </section>

            <section className={SECTION}>
              <div className={SECTION_HEAD}>
                <span className={SECTION_TITLE}>Notes</span>
              </div>
              <div className={SECTION_BODY}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  aria-label="Notes"
                  className="field-sizing-content max-h-72 min-h-20 w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm leading-relaxed text-foreground outline-none! transition-colors focus:border-accent/40"
                />
              </div>
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
            <p role="alert" className="min-w-0 truncate text-xs text-red-300">
              {error}
            </p>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost">
                Cancel
              </button>
              <button disabled={busy} className="btn btn-glow disabled:opacity-60">
                {busy ? "Adding…" : "Add lead"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
