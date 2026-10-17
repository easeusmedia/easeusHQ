"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { dayOf, isFilled, leadContacts, type BoardData, type FieldData, type LeadData } from "@/lib/space";
import { Dropdown } from "../../Dropdown";
import { StagePill, TagPill } from "./pills";
import { EmailStatus } from "./LeadCard";

const PER_PAGE = 60;
const BAR = "flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]";

// The leads as the Dream 300 sequence pages list them (Abhishek, 17 Oct
// 2026): tabs along the top by the board's first tag on the card (YouTube:
// its opener, Instagram: its version), each with its count, and a filter by
// the stage it's on; then a row per lead: its name and people, its numbers,
// and its stage, tags and email as chips. A row opens the lead.
export function LeadList({ board, leads, filtered, onOpen }: { board: BoardData; leads: LeadData[]; filtered: boolean; onOpen: (id: string) => void }) {
  // the tabs: the first tag shown on the card, else none
  const group = board.fields.find((f) => f.onCard && f.kind === "select" && f.options.length);
  const [tab, setTab] = useState<string>("all");
  const [stageId, setStageId] = useState("");
  const [shown, setShown] = useState(PER_PAGE);
  const contactsField = board.fields.find((f) => f.kind === "contacts");
  // the numbers on a row: the card's other properties that aren't tags
  const facts = board.fields.filter((f) => f.onCard && f.kind !== "select" && f.kind !== "multi" && f.kind !== "contacts");
  const tags = board.fields.filter((f) => f.kind === "multi" || (f.kind === "select" && f !== group && f.onCard));

  const stageAt = new Map(board.stages.map((s, i) => [s.id, i]));
  const tabOf = (l: LeadData) => (group ? ((l.values[group.id] as string[] | undefined)?.[0] ?? "") : "");
  const inTab = leads.filter((l) => tab === "all" || tabOf(l) === tab);
  const rows = inTab.filter((l) => !stageId || l.stageId === stageId).sort((a, b) => (stageAt.get(a.stageId) ?? 0) - (stageAt.get(b.stageId) ?? 0) || a.sortOrder - b.sortOrder);
  const count = (id: string) => leads.filter((l) => tabOf(l) === id).length;

  return (
    <div className="fade-in flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {group && (
          <div role="tablist" aria-label={group.name} className={BAR}>
            {[{ id: "all", name: "All" }, ...group.options].map((o) => (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={tab === o.id}
                onClick={() => {
                  setTab(o.id);
                  setShown(PER_PAGE);
                }}
                className="seg flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              >
                {o.name}
                <span className="text-muted tabular-nums">{o.id === "all" ? leads.length : count(o.id)}</span>
              </button>
            ))}
          </div>
        )}
        <Dropdown
          size="sm"
          value={stageId}
          onChange={(v) => {
            setStageId(v);
            setShown(PER_PAGE);
          }}
          options={[{ value: "", label: "Any stage" }, ...board.stages.map((s) => ({ value: s.id, label: s.name }))]}
        />
      </div>

      {!rows.length ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted">{filtered || tab !== "all" || stageId ? "No leads match these filters." : "No leads yet."}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.slice(0, shown).map((l) => (
            <Row key={l.id} lead={l} board={board} contactsField={contactsField} facts={facts} tags={tags} group={group} onOpen={onOpen} />
          ))}
          {rows.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PER_PAGE)} className="btn btn-sm btn-glow mx-auto mt-1">
              Show {Math.min(PER_PAGE, rows.length - shown)} more of {rows.length - shown}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  lead,
  board,
  contactsField,
  facts,
  tags,
  group,
  onOpen,
}: {
  lead: LeadData;
  board: BoardData;
  contactsField: FieldData | undefined;
  facts: FieldData[];
  tags: FieldData[];
  group: FieldData | undefined;
  onOpen: (id: string) => void;
}) {
  const stage = board.stages.find((s) => s.id === lead.stageId);
  const people = contactsField ? leadContacts(lead.values, [contactsField]).map((c) => c.name.trim()).filter(Boolean) : [];
  // under the name, the people when they're not just the name again
  const sub = people.filter((n) => !lead.title.includes(n)).join(" · ");
  const pills = (f: FieldData) => ((lead.values[f.id] as string[] | undefined) ?? []).flatMap((id) => f.options.filter((o) => o.id === id));
  const day = stage ? dayOf(stage.name) : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(lead.id)}
      className="group card-surface card-interactive flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-[1_1_16rem]">
        <span className="block truncate text-sm font-medium">{lead.title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {facts.some((f) => isFilled(f.kind, lead.values[f.id])) && (
        <span className="flex shrink-0 flex-wrap gap-x-3 text-xs text-muted tabular-nums">
          {facts.map((f) => {
            const v = lead.values[f.id];
            if (!isFilled(f.kind, v)) return null;
            const text = f.kind === "count" ? String((v as { n: number | null }).n ?? "") : typeof v === "string" ? v : "";
            return text ? (
              <span key={f.id}>
                <span className="text-foreground/85">{text}</span> {f.name.toLowerCase()}
              </span>
            ) : null;
          })}
        </span>
      )}
      <span className="flex min-w-0 flex-[1_1_14rem] flex-wrap items-center justify-end gap-1.5">
        {stage && <StagePill name={day != null ? `Day ${day}` : stage.name} color={stage.color} />}
        {group && pills(group).map((o) => <TagPill key={o.id} name={o.name} color={o.color} />)}
        {tags.flatMap((f) => pills(f).map((o) => <TagPill key={`${f.id}:${o.id}`} name={o.name} color={o.color} />))}
        <EmailStatus email={lead.email} />
        <ChevronRight size={14} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
