"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Check, Globe, Mail, Phone, Plus, Trash2, X } from "lucide-react";
import { channelsIn, columnOf, shownAs, type OutreachBoard, type SheetColumn, type SheetData, type SheetLead } from "@/lib/leadSheet";
import { CONTACT_ROLES, type Contact, type LinkValue } from "@/lib/space";
import { moveLeadTo, renameLead, setLeadDead, setLeadNotes, setLeadValue } from "./actions";
import { Menu, SECTION, SECTION_BODY, SECTION_HEAD, SECTION_TITLE, dateOf, hrefOf, useDebounced } from "./values";
import { EditableName } from "../../EditableName";
import { Dropdown } from "../../Dropdown";
import { FacebookIcon, InstagramIcon, LinkedinIcon, PlatformMark, XIcon, YoutubeIcon } from "../../PlatformIcon";
import { closeOnBackdrop } from "../../dialog";

type Status = "saving" | "saved" | { error: string } | null;

const ICON: Record<SheetColumn, React.ComponentType<{ size?: number; className?: string }>> = {
  email: Mail,
  phone: Phone,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  facebook: FacebookIcon,
  website: Globe,
  x: XIcon,
  youtube: YoutubeIcon,
};
const INPUT = "w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-foreground outline-none! transition-colors placeholder:text-muted/50 focus:border-accent/40";
const REMOVE = "grid size-6 shrink-0 place-items-center rounded-md text-muted opacity-0 transition-[opacity,color] group-hover/row:opacity-100 hover:text-rose-300 focus-visible:opacity-100";

// A Leads tab's lead, opened from its row (Sales > Leads, 3 Nov 2026): its
// name, its people (each with a designation and every link, email and number
// pasted for them, each landing in its own column), its own links and
// notes; Move to an outreach board; delete, to Dead leads. Every change
// saves as it's made. Open while `lead`
// is set; closing calls onClose.
export function SheetLeadWindow({ lead, sheet, targets, roles, onClose }: { lead: SheetLead | null; sheet: SheetData; targets: OutreachBoard[]; roles: string[]; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  // the last lead stays drawn while the window fades out
  const [shown, setShown] = useState(lead);
  if (lead && lead !== shown) setShown(lead);
  const open = !!lead;
  // saves still on their way, and the page's refresh after them
  const [saving, setSaving] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  // each opening draws it afresh, from the latest values; reopened before
  // the page's copy has what was just saved, it stays as it was
  const [opens, setOpens] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && !saving && !refreshing) setOpens((n) => n + 1);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      // only its own closing: a reason prompt inside it closing reaches here too
      onClose={(e) => e.target === e.currentTarget && open && onClose()}
      // display:flex only while open (.dialog-grow): a flex class would keep it on screen closed
      className="dialog-grow glass fixed top-1/2 left-1/2 m-0 max-h-[88vh] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-5 text-foreground"
    >
      {shown && (
        <Page
          key={`${shown.id}:${opens}`}
          lead={shown}
          sheet={sheet}
          targets={targets.filter((t) => t.id !== sheet.id)}
          roles={roles}
          open={open}
          onSaving={(n) => setSaving((s) => s + n)}
          refresh={() => startRefresh(() => router.refresh())}
          close={() => ref.current?.close()}
          onGone={onClose}
        />
      )}
    </dialog>
  );
}

function Page({
  lead,
  sheet,
  targets,
  roles,
  open,
  onSaving,
  refresh,
  close,
  onGone,
}: {
  lead: SheetLead;
  sheet: SheetData;
  targets: OutreachBoard[];
  roles: string[];
  open: boolean;
  onSaving: (n: number) => void;
  refresh: () => void;
  close: () => void;
  onGone: () => void;
}) {
  const id = lead.id;
  const [people, setPeople] = useState<Contact[]>(lead.contacts);
  const [links, setLinks] = useState<LinkValue[]>(lead.links);
  const [notes, setNotes] = useState(lead.notes);
  const [status, setStatus] = useState<Status>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function run<T extends { error?: string }>(work: Promise<T>): Promise<T> {
    clearTimeout(statusTimer.current);
    setStatus("saving");
    onSaving(1);
    // a dropped connection, or a deploy since this page loaded
    const res = await work.catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }) as T);
    onSaving(-1);
    if (res.error) setStatus({ error: res.error });
    else {
      setStatus("saved");
      statusTimer.current = setTimeout(() => setStatus((s) => (s === "saved" ? null : s)), 2000);
      refresh();
    }
    return res;
  }

  // typing saves a moment after it stops; anything picked or removed at once
  const contacts = useDebounced((next: Contact[]) => sheet.contactsField && run(setLeadValue(id, sheet.contactsField, next.length ? next : null)));
  const pages = useDebounced((next: LinkValue[]) => sheet.linksField && run(setLeadValue(id, sheet.linksField, next.length ? next : null)));
  const writeUp = useDebounced((text: string) => run(setLeadNotes(id, text)), 800);
  function changePeople(next: Contact[], now = false) {
    setPeople(next);
    contacts.schedule(next);
    if (now) contacts.flush();
  }
  const patch = (pid: string, change: (p: Contact) => Contact, now = false) => changePeople(people.map((p) => (p.id === pid ? change(p) : p)), now);
  function changeLinks(next: LinkValue[]) {
    setLinks(next);
    pages.schedule(next);
    pages.flush();
  }
  // closing sends whatever is still being typed, so a reopen waits for it
  useEffect(() => {
    if (open) return;
    contacts.flush();
    pages.flush();
    writeUp.flush();
  }, [open, contacts, pages, writeUp]);

  const allRoles = [...new Set([...CONTACT_ROLES, "CTO", ...roles, ...people.map((p) => p.role).filter(Boolean)])];
  // every outreach board under its portal (Podcast: Amplifier, Dream (Core
  // Offer); Doctors: …), then the other Leads tabs (Abhishek, 3 Nov 2026: all
  // of them, each said with where it is)
  const boards = targets;
  const portals = [...new Set(boards.map((b) => b.portal))];
  // off the tab (moved on, or to Dead leads), once everything typed has saved
  // (server actions run one at a time)
  async function leave(work: Promise<{ error?: string }>) {
    contacts.flush();
    pages.flush();
    writeUp.flush();
    const res = await run(work);
    if (!res.error) onGone();
  }

  return (
    <>
      <div className="mb-4 flex shrink-0 items-start gap-2 px-1 text-lg font-semibold tracking-tight">
        <EditableName
          name={lead.title}
          pencil="hover"
          wrap
          onSave={async (name) => {
            const res = await run(renameLead(id, name));
            return res.error;
          }}
        />
      </div>

      <div className="-mx-1 flex min-h-0 flex-auto flex-col gap-3 overflow-y-auto px-1 pb-1">
        <section className={SECTION}>
          <div className={SECTION_HEAD}>
            <span className={SECTION_TITLE}>People</span>
            <button type="button" onClick={() => changePeople([...people, { id: crypto.randomUUID(), name: "", role: "", channels: [] }], true)} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-foreground">
              <Plus size={13} /> Add person
            </button>
          </div>
          {people.length > 0 && (
            <div className={`${SECTION_BODY} flex flex-col gap-2.5`}>
              {people.map((p) => (
                <Person key={p.id} person={p} roles={allRoles} onChange={(change, now) => patch(p.id, change, now)} onBlur={contacts.flush} onRemove={() => changePeople(people.filter((x) => x.id !== p.id), true)} />
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
              <div key={`${l.url}:${i}`} className="group/row flex min-w-0 items-center gap-2 text-sm">
                <PlatformMark url={l.url} size={13} className="text-muted" />
                <a href={hrefOf("other", l.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-foreground/90 hover:text-accent">
                  {shownAs({ kind: "other", value: l.url })}
                </a>
                <button type="button" onClick={() => changeLinks(links.filter((_, j) => j !== i))} aria-label="Remove this link" title="Remove" className={REMOVE}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <Paste
              placeholder="Paste a link"
              onAdd={(found) => {
                // emails and numbers belong to a person: left in the box
                const urls = found.flatMap((c) => (c.kind === "email" || c.kind === "phone" ? [] : [hrefOf(c.kind, c.value) ?? c.value]));
                const fresh = urls.filter((u) => !links.some((l) => l.url.toLowerCase() === u.toLowerCase()));
                if (fresh.length) changeLinks([...links, ...fresh.map((url) => ({ label: "", url }))]);
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
              onChange={(e) => {
                setNotes(e.target.value);
                writeUp.schedule(e.target.value);
              }}
              onBlur={writeUp.flush}
              rows={3}
              aria-label="Notes"
              className={`${INPUT} field-sizing-content max-h-72 min-h-20 resize-none leading-relaxed`}
            />
          </div>
        </section>
      </div>

      {/* along the bottom: delete, who added it, Move to, Close */}
      <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-border pt-3">
        <button type="button" onClick={() => leave(setLeadDead(id, true))} aria-label="Delete lead" title="Delete lead (to Dead leads)" className="shrink-0 rounded-md p-1.5 text-muted hover:text-red-400">
          <Trash2 size={14} />
        </button>
        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {status === "saving" ? (
            "Saving…"
          ) : status === "saved" ? (
            <span className="fade-in inline-flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          ) : status && typeof status === "object" ? (
            <span role="alert" className="text-red-300">
              {status.error}
            </span>
          ) : (
            <>
              Added {dateOf(lead.createdAt)} by {lead.createdBy.name}
            </>
          )}
        </p>
        {boards.length > 0 && (
          <Menu
            height={300}
            width={260}
            align="end"
            popup="menu"
            buttonClassName="btn btn-glow shrink-0"
            button={
              <>
                <ArrowRight size={14} /> Move to
              </>
            }
          >
            {(closeMenu) => (
              <div className="max-h-72 overflow-y-auto">
                {portals.map((portal) => (
                  <div key={portal} role="group" aria-label={portal}>
                    <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{portal}</p>
                    {boards
                      .filter((b) => b.portal === portal)
                      .map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            closeMenu();
                            leave(moveLeadTo(id, b.id));
                          }}
                          className="menu-item px-2.5 py-1.5 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{b.name}</span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </Menu>
        )}
        <button type="button" onClick={close} className="btn btn-ghost shrink-0">
          Close
        </button>
      </div>

    </>
  );
}

// One person on the lead: their name and designation, then each detail
// pasted for them, marked with what it is
// (a new one starts in its name box, unless `focus` says otherwise)
export function Person({ person, roles, focus, onChange, onBlur, onRemove }: { person: Contact; roles: string[]; focus?: boolean; onChange: (change: (p: Contact) => Contact, now?: boolean) => void; onBlur: () => void; onRemove: () => void }) {
  // removing someone filled in takes a second click
  const [sure, setSure] = useState(false);
  const filled = !!person.name.trim() || person.channels.some((c) => c.value.trim());
  return (
    <div className="panel-soft fade-in flex min-w-0 flex-col gap-2 rounded-xl px-3.5 py-3">
      <div className="flex items-center gap-2">
        <input
          autoFocus={focus ?? !filled}
          value={person.name}
          onChange={(e) => onChange((p) => ({ ...p, name: e.target.value }))}
          onBlur={onBlur}
          placeholder="Name"
          aria-label="Name"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm font-medium text-foreground outline-none! placeholder:font-normal placeholder:text-muted/50 hover:bg-white/[0.03] focus:bg-white/[0.04]"
        />
        <Dropdown
          size="sm"
          pill={{ icon: <BriefcaseBusiness size={12} className="text-muted" /> }}
          value={person.role}
          placeholder="Designation"
          create
          search={{ recent: 30, placeholder: "Search or add a designation" }}
          options={roles.map((r) => ({ value: r, label: r }))}
          onChange={(role) => onChange((p) => ({ ...p, role: role.trim() }), true)}
        />
        {sure ? (
          <button type="button" onClick={onRemove} onBlur={() => setSure(false)} onMouseLeave={() => setSure(false)} className="fade-in btn btn-xs btn-danger shrink-0">
            Remove
          </button>
        ) : (
          <button
            type="button"
            title="Remove this person"
            aria-label="Remove this person"
            onClick={() => (filled ? setSure(true) : onRemove())}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-rose-300"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {person.channels.length > 0 && (
        <div className="flex flex-col gap-1 pl-1.5">
          {person.channels.map((c, i) => {
            const Icon = ICON[columnOf(c)];
            const href = hrefOf(c.kind, c.value);
            return (
              <div key={`${c.value}:${i}`} className="group/row flex min-w-0 items-center gap-2 text-sm">
                <Icon size={13} className="shrink-0 text-muted" />
                {href && !/^(mailto|tel):/i.test(href) ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-foreground/90 hover:text-accent">
                    {shownAs(c)}
                  </a>
                ) : (
                  <span className="min-w-0 truncate text-foreground/90 select-text">{c.value}</span>
                )}
                <button type="button" onClick={() => onChange((p) => ({ ...p, channels: p.channels.filter((_, j) => j !== i) }), true)} aria-label={`Remove ${c.value}`} title="Remove" className={REMOVE}>
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Paste
        placeholder="Paste links, emails or phone numbers"
        onAdd={(found) => {
          const fresh = found.filter((c) => !person.channels.some((x) => x.kind === c.kind && x.value.toLowerCase() === c.value.toLowerCase()));
          if (fresh.length) onChange((p) => ({ ...p, channels: [...p.channels, ...fresh] }), true);
          return [];
        }}
      />
    </div>
  );
}

// A box to paste or type into: each link, email or number lands as it's
// pasted (or on Enter, or leaving the box), marked with what it is. Anything
// it can't tell, or `onAdd` doesn't take (it returns those), stays in the box.
export function Paste({ placeholder, onAdd }: { placeholder: string; onAdd: (found: ReturnType<typeof channelsIn>["found"]) => string[] }) {
  const [text, setText] = useState("");
  const [stuck, setStuck] = useState<string | null>(null);
  function take(value: string) {
    const { found, left } = channelsIn(value);
    const kept = found.length ? onAdd(found) : [];
    setText([...left, ...kept].join(" "));
    setStuck(left.length ? "That isn't a link, email or phone number. Paste the full link." : kept.length ? "Add emails and phone numbers to a person." : null);
  }
  return (
    <div className="flex flex-col gap-1">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStuck(null);
        }}
        onPaste={(e) => {
          e.preventDefault();
          // in place of what's selected, as a paste would
          const { selectionStart: from, selectionEnd: to } = e.currentTarget;
          take(`${text.slice(0, from ?? text.length)} ${e.clipboardData.getData("text")} ${text.slice(to ?? text.length)}`);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          take(text);
        }}
        onBlur={() => text.trim() && take(text)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-paste
        className={INPUT}
      />
      {stuck && <p className="fade-in px-1 text-xs text-amber-300">{stuck}</p>}
    </div>
  );
}
