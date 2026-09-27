"use client";

import { Plus, X } from "lucide-react";
import { CONTENT_UNITS, CURRENCIES, FIELD_LABEL, PLATFORMS, extraKey, labelOf, type ContractDetails } from "@/lib/contract";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";

// Everything the contract is filled in from, grouped the way it's decided:
// who the client is (mostly from their form), the terms, the money, the
// scope, the legal switches, and anything extra a clause asks for.

const input =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none! transition-colors placeholder:text-muted/60 focus:border-hover";

function Row({ id, label, hint, missing, children }: { id?: string; label: string; hint?: string; missing?: boolean; children: React.ReactNode }) {
  return (
    <div id={id ? `f-${id}` : undefined} className="flex scroll-mt-24 flex-col gap-1.5">
      <span className={`text-xs ${missing ? "text-amber-300" : "text-muted"}`}>
        {label}
        {missing && " — needed"}
      </span>
      {children}
      {hint && <span className="text-[11.5px] leading-snug text-muted/80">{hint}</span>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs transition-colors ${value === o.value ? "bg-hover text-foreground" : "text-muted hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// null = the SOP's rule decides; shown as "Auto (…what the rule says)"
function Switch({ value, auto, onChange }: { value: boolean | null; auto: boolean; onChange: (v: boolean | null) => void }) {
  const key = value === null ? "auto" : value ? "on" : "off";
  return (
    <Choice
      value={key}
      options={[
        { value: "auto", label: `Auto · ${auto ? "in" : "out"}` },
        { value: "on", label: "Include" },
        { value: "off", label: "Leave out" },
      ]}
      onChange={(k) => onChange(k === "auto" ? null : k === "on")}
    />
  );
}

export function DetailsPanel({
  d,
  set,
  missing,
  rules,
  readOnly,
}: {
  d: ContractDetails;
  set: (patch: Partial<ContractDetails>) => void;
  missing: { key: string; label: string }[];
  // what the SOP's rules make of the terms, for the Auto switches
  rules: { termination: boolean; disputes: boolean; law: string; courts: string };
  readOnly: boolean;
}) {
  const needs = new Set(missing.map((m) => m.key));
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(/[^\d.]/g, ""))) || null);
  const signatory = (i: number, patch: Partial<{ name: string; email: string }>) =>
    set({ signatories: d.signatories.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  // a clause asking for something the details don't have: a row for it, ready to fill
  const known = new Set([...Object.keys(FIELD_LABEL), ...d.extra.map((e) => extraKey(e.key))]);
  const asked = missing.filter((m) => !known.has(m.key) && !FIELD_LABEL[m.key]);

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-6">
      {(d.contactName || d.contactEmail) && (
        <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs leading-relaxed text-muted">
          Filled in by <span className="text-foreground">{d.contactName}</span>
          {d.contactEmail && <> · {d.contactEmail}</>}
          {d.whatsapp && <> · WhatsApp {d.whatsapp}</>}
        </p>
      )}

      <Group title="Client">
        <Row id="CLIENT_ENTITY" label="Legal name" missing={needs.has("CLIENT_ENTITY")}>
          <input className={input} value={d.entity} onChange={(e) => set({ entity: e.target.value })} placeholder="Registered name" />
        </Row>
        <Row label="Trading name">
          <input className={input} value={d.tradingName} onChange={(e) => set({ tradingName: e.target.value })} placeholder="Optional — shows as t/a …" />
        </Row>
        <Row id="CLIENT_ADDRESS" label="Address" missing={needs.has("CLIENT_ADDRESS")}>
          <textarea className={`${input} field-sizing-content min-h-16 resize-none`} value={d.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street, city, postcode" />
        </Row>
        <Row id="CLIENT_COUNTRY" label="Country" missing={needs.has("CLIENT_COUNTRY")} hint="Decides the governing law.">
          <input className={input} value={d.country} onChange={(e) => set({ country: e.target.value })} placeholder="e.g. United Kingdom" />
        </Row>
        <Row id="PODCAST_NAME" label="Podcast or brand">
          <input className={input} value={d.podcastName} onChange={(e) => set({ podcastName: e.target.value })} placeholder="Optional" />
        </Row>
        <Row id="PLATFORM_LIST" label="Platforms" missing={needs.has("PLATFORM_LIST")}>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => {
              const on = d.platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => set({ platforms: on ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] })}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on ? "border-sky-400/40 bg-sky-400/10 text-sky-200" : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </Row>
        {d.signatories.map((s, i) => (
          <Row
            key={i}
            id={i ? "CLIENT_SIGNATORY_2" : "CLIENT_SIGNATORY_1"}
            label={i ? "Second signatory" : "Signs for the client"}
            missing={needs.has(i ? "CLIENT_SIGNATORY_2" : "CLIENT_SIGNATORY_1") || needs.has(i ? "CLIENT_EMAIL_2" : "CLIENT_EMAIL_1")}
          >
            <div className="flex gap-2">
              <input className={input} value={s.name} onChange={(e) => signatory(i, { name: e.target.value })} placeholder="Name" />
              <input className={input} value={s.email} onChange={(e) => signatory(i, { email: e.target.value })} placeholder="Email" type="email" />
              {i > 0 && (
                <button type="button" onClick={() => set({ signatories: d.signatories.slice(0, 1) })} aria-label="Remove second signatory" className="shrink-0 rounded-md px-1.5 text-muted hover:text-foreground">
                  <X size={14} />
                </button>
              )}
            </div>
          </Row>
        ))}
        {d.signatories.length < 2 && (
          <button type="button" onClick={() => set({ signatories: [...d.signatories, { name: "", email: "" }] })} className="-mt-1 flex items-center gap-1 self-start text-xs text-muted hover:text-foreground">
            <Plus size={12} /> Second signatory
          </button>
        )}
      </Group>

      <Group title="Terms">
        <Row id="TERM_LENGTH" label="Term" missing={needs.has("TERM_LENGTH")}>
          <Dropdown
            value={d.termMonths ? String(d.termMonths) : ""}
            placeholder="How long"
            options={Array.from({ length: 12 }, (_, i) => ({
              value: String(i + 1),
              label: i === 0 ? "1 month — trial" : `${i + 1} months`,
            }))}
            onChange={(v) => set({ termMonths: Number(v) || null, ...(Number(v) !== 1 ? { extensionMonths: null } : {}) })}
          />
        </Row>
        {d.termMonths === 1 && (
          <Row id="EXTENSION_MONTHS" label="After the trial" missing={needs.has("EXTENSION_MONTHS")}>
            <Dropdown
              value={d.extensionMonths ? String(d.extensionMonths) : ""}
              placeholder="It ends — a new agreement if we continue"
              options={[
                { value: "", label: "It ends — a new agreement if we continue" },
                ...Array.from({ length: 6 }, (_, i) => ({ value: String(i + 1), label: `Extends ${i + 1} month${i ? "s" : ""} unless stopped` })),
              ]}
              onChange={(v) => set({ extensionMonths: Number(v) || null })}
            />
          </Row>
        )}
        <Row id="CONTENT_UNIT" label="The term starts when the first … goes live" missing={needs.has("CONTENT_UNIT")}>
          <Dropdown value={d.contentUnit} create options={CONTENT_UNITS.map((u) => ({ value: u, label: u }))} onChange={(v) => set({ contentUnit: v })} />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row id="SIGNING_DATE" label="Dated">
            <DatePicker value={d.signingDate} onChange={(v) => set({ signingDate: v })} placeholder="The day it's sent" />
          </Row>
          <Row label="Commencing from">
            <DatePicker value={d.commencementDate} onChange={(v) => set({ commencementDate: v })} placeholder="Optional" />
          </Row>
        </div>
      </Group>

      <Group title="Fees">
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Row label="Currency">
            <Dropdown value={d.currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={(v) => set({ currency: v })} />
          </Row>
          <Row id="MONTHLY_FEE" label="Monthly fee" missing={needs.has("MONTHLY_FEE")}>
            <input
              className={input}
              inputMode="decimal"
              value={d.monthlyFee ?? ""}
              onChange={(e) => set({ monthlyFee: num(e.target.value) })}
              placeholder="e.g. 2500"
            />
          </Row>
        </div>
        <Row label="Payment">
          <Choice
            value={d.payment}
            options={[
              { value: "upfront", label: "Monthly, upfront" },
              { value: "split", label: "50 / 50 split" },
            ]}
            onChange={(v) => set({ payment: v })}
          />
        </Row>
        <Row label="Fee note" hint="Optional — e.g. a discounted first month, and the standard rate.">
          <textarea className={`${input} field-sizing-content min-h-10 resize-none`} value={d.feeNote} onChange={(e) => set({ feeNote: e.target.value })} />
        </Row>
      </Group>

      <Group title="Scope">
        <Row id="DELIVERABLES" label="Deliverables" missing={needs.has("DELIVERABLES")} hint="Always give the quantity — per episode and per month where they differ.">
          <div className="flex flex-col gap-2">
            {d.deliverables.map((x, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={`${input} w-[42%] shrink-0`}
                  value={x.name}
                  onChange={(e) => set({ deliverables: d.deliverables.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })}
                  placeholder="e.g. Short-form reels"
                />
                <input
                  className={input}
                  value={x.detail}
                  onChange={(e) => set({ deliverables: d.deliverables.map((y, j) => (j === i ? { ...y, detail: e.target.value } : y)) })}
                  placeholder="e.g. 4 per episode (16 per month)"
                />
                <button type="button" onClick={() => set({ deliverables: d.deliverables.filter((_, j) => j !== i) })} aria-label="Remove" className="shrink-0 rounded-md px-1.5 text-muted hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => set({ deliverables: [...d.deliverables, { name: "", detail: "" }] })} className="flex items-center gap-1 self-start text-xs text-muted hover:text-foreground">
              <Plus size={12} /> Deliverable
            </button>
          </div>
        </Row>
        <Row label="Raw content they provide">
          <input className={input} value={d.rawContent} onChange={(e) => set({ rawContent: e.target.value })} placeholder={`${d.contentUnit || "episode"} raw content ready for editing`} />
        </Row>
        <Row label="Another obligation" hint="Optional — added to what the client agrees to.">
          <input className={input} value={d.additionalObligation} onChange={(e) => set({ additionalObligation: e.target.value })} />
        </Row>
      </Group>

      <Group title="Legal">
        <Row label="Termination (4 weeks' notice)" hint="By the rule: from three months up.">
          <Switch value={d.termination} auto={rules.termination} onChange={(v) => set({ termination: v })} />
        </Row>
        <Row label="Dispute resolution" hint="By the rule: never on a one-month trial.">
          <Switch value={d.disputes} auto={rules.disputes} onChange={(v) => set({ disputes: v })} />
        </Row>
        {rules.disputes && (
          <>
            <Row id="GOVERNING_LAW" label="Governing law" missing={needs.has("GOVERNING_LAW")}>
              <input className={input} value={d.governingLaw} onChange={(e) => set({ governingLaw: e.target.value })} placeholder={rules.law || "e.g. the laws of the State of New York"} />
            </Row>
            <Row id="JURISDICTION_CLAUSE" label="Courts" missing={needs.has("JURISDICTION_CLAUSE")}>
              <input className={input} value={d.jurisdiction} onChange={(e) => set({ jurisdiction: e.target.value })} placeholder={rules.courts || "e.g. exclusive jurisdiction of the courts of New York"} />
            </Row>
          </>
        )}
        <Row label="Replaces an earlier agreement" hint="Optional — e.g. the trial agreement dated 1 April 2026.">
          <input className={input} value={d.priorAgreement} onChange={(e) => set({ priorAgreement: e.target.value })} />
        </Row>
      </Group>

      <Group title="More details">
        {[...d.extra, ...asked.map((m) => ({ key: labelOf(m.key), value: "" }))].map((e, i) => {
          const own = i < d.extra.length;
          const k = extraKey(e.key);
          return (
            <Row key={i} id={k} label={own ? `{{${k || "…"}}}` : `${e.key} — a clause asks for this`} missing={!own || needs.has(k)}>
              <div className="flex gap-2">
                {/* there even when a clause named it, so typing the value
                    into a row that then becomes this one keeps its focus */}
                <input
                  className={`${input} w-[40%] shrink-0`}
                  value={e.key}
                  readOnly={!own}
                  onChange={(ev) => set({ extra: d.extra.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)) })}
                  placeholder="Name"
                />
                <input
                  className={input}
                  value={e.value}
                  onChange={(ev) =>
                    set({ extra: own ? d.extra.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)) : [...d.extra, { key: e.key, value: ev.target.value }] })
                  }
                  placeholder="Value"
                />
                {own && (
                  <button type="button" onClick={() => set({ extra: d.extra.filter((_, j) => j !== i) })} aria-label="Remove" className="shrink-0 rounded-md px-1.5 text-muted hover:text-foreground">
                    <X size={14} />
                  </button>
                )}
              </div>
            </Row>
          );
        })}
        <button type="button" onClick={() => set({ extra: [...d.extra, { key: "", value: "" }] })} className="-mt-1 flex items-center gap-1 self-start text-xs text-muted hover:text-foreground">
          <Plus size={12} /> Detail — use it in a clause as {"{{NAME}}"}
        </button>
      </Group>
    </fieldset>
  );
}
