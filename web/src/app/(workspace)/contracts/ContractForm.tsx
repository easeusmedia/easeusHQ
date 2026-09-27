"use client";

import { useState } from "react";
import { ArrowUp, Check, Loader2, PenLine } from "lucide-react";
import { CONTENT_UNITS, CURRENCIES, PLATFORMS, conditions, longDate, money, values, type ContractDetails, type Deliverable } from "@/lib/contract";

// Every question the contract needs, in one place. Each has answers to
// click — saved at once — and its own box for anything else, which Claude
// reads and turns into the right change. Plain amounts and term lengths
// typed there are saved straight away, without waiting for Claude.

type Option = { label: string; patch: Partial<ContractDetails>; on: boolean };

const PACKAGES: { label: string; list: Deliverable[] }[] = [
  {
    label: "2 long-form + 8 reels a month",
    list: [
      { name: "Long-form episode edit", detail: "2 per month" },
      { name: "Short-form reels", detail: "4 per episode (8 per month)" },
    ],
  },
  {
    label: "4 long-form + 16 reels a month",
    list: [
      { name: "Long-form episode edit", detail: "4 per month" },
      { name: "Short-form reels", detail: "4 per episode (16 per month)" },
    ],
  },
  {
    label: "4 long-form + 16 reels + thumbnails",
    list: [
      { name: "Long-form episode edit", detail: "4 per month" },
      { name: "Short-form reels", detail: "4 per episode (16 per month)" },
      { name: "Thumbnail design", detail: "1 per episode (4 per month)" },
    ],
  },
];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// "£2,500", "2500 usd", "3k" — an amount and maybe a currency; anything
// more than that goes to Claude
const SIGNS: Record<string, string> = { "£": "GBP", $: "USD", "€": "EUR" };
function plainMoney(text: string): { monthlyFee: number; currency?: string } | null {
  const m = text.trim().match(/^([£$€]|[a-z]{3})?\s*([\d,]+(?:\.\d+)?)\s*(k)?\s*([a-z]{3})?(?:\s*(?:\/|a|per)\s*(?:month|mo))?$/i);
  if (!m) return null;
  const code = (m[4] ?? m[1] ?? "").toUpperCase();
  const currency = SIGNS[m[1] ?? ""] ?? (CURRENCIES.includes(code) ? code : undefined);
  if (code && !currency && !SIGNS[m[1] ?? ""]) return null;
  const amount = Number(m[2].replace(/,/g, "")) * (m[3] ? 1000 : 1);
  return amount > 0 ? { monthlyFee: amount, ...(currency ? { currency } : {}) } : null;
}

function Chip({ on, children, onClick, disabled }: { on: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[12.5px] transition-colors duration-150 disabled:opacity-50 ${
        on ? "border-accent/50 bg-accent/15 text-accent" : "border-white/[0.09] text-foreground/75 hover:border-white/20 hover:text-foreground"
      }`}
    >
      {on && <Check size={12} strokeWidth={2.5} />}
      {children}
    </button>
  );
}

// The box for anything else: grows from a small chip when it's used
function Custom({ placeholder, busy, disabled, onSubmit }: { placeholder: string; busy: boolean; disabled: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        onSubmit(text.trim());
        setText("");
      }}
      className="flex min-w-[9rem] flex-1 items-center gap-1.5 rounded-full border border-dashed border-white/[0.12] py-0.5 pl-3 pr-0.5 transition-colors focus-within:border-solid focus-within:border-accent/50 focus-within:bg-surface-2/60"
    >
      {busy ? <Loader2 size={12} className="shrink-0 animate-spin text-accent" /> : <PenLine size={12} className="shrink-0 text-muted" />}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder={busy ? "Claude's on it…" : placeholder}
        className="min-w-0 flex-1 bg-transparent py-1 text-[12.5px] outline-none! placeholder:text-muted/60"
      />
      {text.trim() && !busy && (
        <button type="submit" aria-label="Send" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[#0b1215]">
          <ArrowUp size={12} />
        </button>
      )}
    </form>
  );
}

function Row({ label, needed = false, note, children }: { label: string; needed?: boolean; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-white/[0.05] py-3.5 first:border-t-0 first:pt-1">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${needed ? "bg-accent shadow-[0_0_8px_rgba(111,179,189,0.8)]" : "bg-white/15"}`} title={needed ? "Needed" : undefined} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className={`text-[13px] ${needed ? "text-foreground" : "text-foreground/85"}`}>
          {label}
          {needed && <span className="ml-1.5 text-[11px] text-accent">needed</span>}
        </p>
        {note && <p className="-mt-1 text-xs leading-relaxed text-muted">{note}</p>}
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      </div>
    </div>
  );
}

export function ContractForm({
  d,
  today,
  missing,
  locked,
  busy,
  onSet,
  onAsk,
}: {
  d: ContractDetails;
  today: string;
  missing: Set<string>;
  locked: boolean;
  // the field whose box Claude is working on
  busy: string | null;
  onSet: (patch: Partial<ContractDetails>) => void;
  onAsk: (field: string, text: string) => void;
}) {
  const c = conditions(d);
  const v = values(d, today);
  const byCountry = values({ ...d, governingLaw: "", jurisdiction: "" }, today);
  const chips = (options: Option[]) =>
    options.map((o) => (
      <Chip key={o.label} on={o.on} disabled={locked} onClick={() => onSet(o.patch)}>
        {o.label}
      </Chip>
    ));
  const custom = (field: string, placeholder: string, local?: (text: string) => Partial<ContractDetails> | null) => (
    <Custom
      placeholder={placeholder}
      busy={busy === field}
      disabled={locked || (busy !== null && busy !== field)}
      onSubmit={(text) => {
        const quick = local?.(text);
        if (quick) onSet(quick);
        else onAsk(field, text);
      }}
    />
  );
  const needs = (...keys: string[]) => keys.some((k) => missing.has(k));
  const packaged = PACKAGES.some((p) => same(p.list, d.deliverables));

  return (
    <section className="rounded-3xl border border-white/[0.07] bg-surface/50 px-5 pb-3 pt-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Contract details</h2>
        <span className="text-xs text-muted">Pick an answer, or type your own</span>
      </div>

      <Row label="How long is the contract?" needed={needs("TERM_LENGTH")}>
        {chips([
          { label: "1-month trial", patch: { termMonths: 1 }, on: d.termMonths === 1 },
          ...[3, 6, 12].map((n) => ({ label: `${n} months`, patch: { termMonths: n, extensionMonths: null }, on: d.termMonths === n })),
        ])}
        {d.termMonths && ![1, 3, 6, 12].includes(d.termMonths) && <Chip on onClick={() => {}}>{d.termMonths} months</Chip>}
        {custom("Term", "Other length…", (t) => {
          const m = t.match(/^\s*(\d{1,2})\s*(months?|mo|m)?\s*$/i);
          return m && Number(m[1]) > 0 ? { termMonths: Number(m[1]), ...(Number(m[1]) !== 1 ? { extensionMonths: null } : {}) } : null;
        })}
      </Row>

      {d.termMonths === 1 && (
        <Row label="When the trial ends" needed={needs("EXTENSION_MONTHS")}>
          {chips([
            { label: "It ends", patch: { extensionMonths: null }, on: !d.extensionMonths },
            { label: "Rolls on 2 more months", patch: { extensionMonths: 2 }, on: d.extensionMonths === 2 },
            { label: "Rolls on 3 more months", patch: { extensionMonths: 3 }, on: d.extensionMonths === 3 },
          ])}
          {custom("After the trial", "Something else…")}
        </Row>
      )}

      <Row label="Monthly fee" needed={needs("MONTHLY_FEE")}>
        {chips(["GBP", "USD", "EUR", "AED"].map((cur) => ({ label: cur, patch: { currency: cur }, on: d.currency === cur })))}
        {d.monthlyFee ? <Chip on onClick={() => {}}>{money(d.monthlyFee, d.currency)}</Chip> : null}
        {custom("Monthly fee", d.monthlyFee ? "Change amount…" : "Amount, e.g. 2,500", plainMoney)}
      </Row>

      <Row label="Payment">
        {chips([
          { label: "Upfront each month", patch: { payment: "upfront" }, on: d.payment === "upfront" },
          { label: "50/50 split", patch: { payment: "split" }, on: d.payment === "split" },
        ])}
      </Row>

      <Row label="Discount or note on the fee" note={d.feeNote ? `“${d.feeNote}”` : undefined}>
        {chips([{ label: "None", patch: { feeNote: "" }, on: !d.feeNote }])}
        {custom("Fee note", "e.g. 20% off the first month…")}
      </Row>

      <Row
        label="What we deliver each month"
        needed={needs("DELIVERABLES")}
        note={
          d.deliverables.length > 0 && !packaged
            ? d.deliverables.map((x) => `${x.name} — ${x.detail}`).join(" · ")
            : undefined
        }
      >
        {chips(PACKAGES.map((p) => ({ label: p.label, patch: { deliverables: p.list }, on: same(p.list, d.deliverables) })))}
        {custom("Deliverables", "Describe your own…")}
      </Row>

      <Row label="Podcast or brand name to show">
        {chips([
          { label: "None", patch: { podcastName: "" }, on: !d.podcastName },
          ...[d.tradingName, d.entity]
            .filter((x, i, all) => x && all.indexOf(x) === i)
            .map((x) => ({ label: x, patch: { podcastName: x }, on: d.podcastName === x })),
        ])}
        {d.podcastName && d.podcastName !== d.entity && d.podcastName !== d.tradingName && <Chip on onClick={() => {}}>{d.podcastName}</Chip>}
        {custom("Podcast or brand name", "Another name…")}
      </Row>

      <Row label="Platforms we'll need access to" needed={needs("PLATFORM_LIST")}>
        {PLATFORMS.map((p) => (
          <Chip key={p} on={d.platforms.includes(p)} disabled={locked} onClick={() => onSet({ platforms: d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] })}>
            {p}
          </Chip>
        ))}
      </Row>

      <Row label="The term starts when the first … goes live" needed={needs("CONTENT_UNIT")}>
        {chips(CONTENT_UNITS.map((u) => ({ label: u, patch: { contentUnit: u }, on: d.contentUnit === u })))}
        {custom("Content unit", "Something else…")}
      </Row>

      <Row
        label="The client"
        needed={needs("CLIENT_ENTITY", "CLIENT_ADDRESS", "CLIENT_COUNTRY", "CLIENT_SIGNATORY_1", "CLIENT_EMAIL_1", "CLIENT_SIGNATORY_2", "CLIENT_EMAIL_2")}
        note={[
          [v.CLIENT_ENTITY || "No legal name yet", v.CLIENT_TRADING_NAME_LINE].filter(Boolean).join(" "),
          v.CLIENT_ADDRESS || "no address",
          v.CLIENT_COUNTRY || "no country",
          d.signatories.filter((s) => s.name || s.email).map((s) => `signs: ${s.name || "?"} (${s.email || "no email"})`).join(", ") || "no one to sign yet",
        ].join(" · ")}
      >
        {custom("Client", "Correct anything, add a trading name or second signatory…")}
      </Row>

      <Row label="Dated">
        {chips([{ label: "The day it's sent", patch: { signingDate: "" }, on: !d.signingDate }])}
        {d.signingDate && <Chip on onClick={() => {}}>{longDate(d.signingDate)}</Chip>}
        {custom("Signing date", "A set date…")}
      </Row>

      <Row label="Termination — four weeks' notice">
        {chips([
          { label: `As the rules have it (${(d.termMonths ?? 0) >= 3 ? "in" : "out"})`, patch: { termination: null }, on: d.termination === null },
          { label: "Include", patch: { termination: true }, on: d.termination === true },
          { label: "Leave out", patch: { termination: false }, on: d.termination === false },
        ])}
      </Row>

      {d.termMonths !== 1 && (
        <Row label="Governing law & courts" needed={needs("GOVERNING_LAW", "JURISDICTION_CLAUSE")} note={c.disputes && v.GOVERNING_LAW ? `${v.GOVERNING_LAW}; ${v.JURISDICTION_CLAUSE}` : undefined}>
          {chips([
            {
              label: byCountry.GOVERNING_LAW ? `By the client's country` : "UK — England & Wales",
              patch: byCountry.GOVERNING_LAW
                ? { governingLaw: "", jurisdiction: "", disputes: null }
                : { governingLaw: "UK contract law", jurisdiction: "exclusive jurisdiction of the courts of England and Wales", disputes: null },
              on: c.disputes && (byCountry.GOVERNING_LAW ? !d.governingLaw : d.governingLaw === "UK contract law"),
            },
            { label: "No dispute clause", patch: { disputes: false }, on: !c.disputes },
          ])}
          {custom("Governing law", "Another law or courts…")}
        </Row>
      )}

      <Row label="Replaces an earlier agreement?" note={d.priorAgreement ? `Yes — ${d.priorAgreement}` : undefined}>
        {chips([{ label: "No", patch: { priorAgreement: "" }, on: !d.priorAgreement }])}
        {custom("Earlier agreement", "e.g. the trial agreement dated 1 May 2026…")}
      </Row>
    </section>
  );
}
