"use client";

import { useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { money, values, type ContractDetails, type Deliverable } from "@/lib/contract";
import { AttachButton, FileChips, useAttachments } from "./Attach";

// The few things every contract needs, one row each: click an answer and
// it's saved at once, or type (or attach) anything else for Claude to work
// out. Rows never appear or vanish, and a picked answer keeps its size, so
// nothing moves under the next click. Everything rarer — a discount, a
// brand name, dates, termination — is a word to Claude below.

const PACKAGES: { label: string; list: Deliverable[] }[] = [
  {
    label: "2 long-form + 8 reels",
    list: [
      { name: "Long-form episode edit", detail: "2 per month" },
      { name: "Short-form reels", detail: "4 per episode (8 per month)" },
    ],
  },
  {
    label: "4 long-form + 16 reels",
    list: [
      { name: "Long-form episode edit", detail: "4 per month" },
      { name: "Short-form reels", detail: "4 per episode (16 per month)" },
    ],
  },
];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// "£2,500", "2500 usd", "3k" — an amount and maybe a currency; anything
// more than that goes to Claude
const SIGNS: Record<string, string> = { "£": "GBP", $: "USD", "€": "EUR" };
const CODES = ["GBP", "USD", "EUR", "AUD", "CAD", "AED", "SAR", "INR"];
function plainMoney(text: string): Partial<ContractDetails> | null {
  const m = text.trim().match(/^([£$€]|[a-z]{3})?\s*([\d,]+(?:\.\d+)?)\s*(k)?\s*([a-z]{3})?(?:\s*(?:\/|a|per)\s*(?:month|mo))?$/i);
  if (!m) return null;
  const code = (m[4] ?? m[1] ?? "").toUpperCase();
  const currency = SIGNS[m[1] ?? ""] ?? (CODES.includes(code) ? code : undefined);
  if (code && !currency) return null;
  const amount = Number(m[2].replace(/,/g, "")) * (m[3] ? 1000 : 1);
  return amount > 0 ? { monthlyFee: amount, ...(currency ? { currency } : {}) } : null;
}
function plainTerm(text: string): Partial<ContractDetails> | null {
  const m = text.match(/^\s*(\d{1,2})\s*(months?|mo|m)?\s*$/i);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? { termMonths: n, ...(n !== 1 ? { extensionMonths: null } : {}) } : null;
}

function Chip({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-xs transition-colors duration-150 disabled:opacity-50 ${
        on ? "border-accent/60 bg-accent/15 text-accent" : "border-white/[0.08] text-foreground/70 hover:border-white/20 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

// "Other…" — words, a file, or both, for Claude (plain amounts and lengths save at once)
function Other({ placeholder = "Other…", busy, disabled, onSubmit }: { placeholder?: string; busy: boolean; disabled: boolean; onSubmit: (text: string, files: File[]) => void }) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const att = useAttachments();
  const ready = !busy && (!!text.trim() || att.files.length > 0);
  return (
    <div className="flex min-w-[7rem] flex-1 flex-col gap-1">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          onSubmit(text.trim(), att.files);
          setText("");
          att.clear();
        }}
        onFocus={() => setFocus(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocus(false)}
        className={`flex h-[26px] items-center gap-1 rounded-full border pl-3 pr-0.5 transition-colors ${
          focus || text || att.files.length ? "border-accent/40 bg-surface-2/70" : "border-transparent bg-white/[0.03] hover:bg-white/[0.05]"
        }`}
      >
        {busy && <Loader2 size={12} className="shrink-0 animate-spin text-accent" />}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder={busy ? "Claude's on it…" : placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none! placeholder:text-muted/60"
        />
        {(focus || att.files.length > 0) && <AttachButton onPick={att.add} disabled={disabled || busy} size={12} />}
        {ready && (
          <button type="submit" aria-label="Send" className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[#0b1220]">
            <ArrowUp size={12} />
          </button>
        )}
      </form>
      {(att.files.length > 0 || att.problem) && (
        <div className="flex flex-wrap items-center gap-1 pl-2">
          <FileChips names={att.files.map((f) => f.name)} onRemove={att.remove} />
          {att.problem && <span className="text-[11px] text-accent">{att.problem}</span>}
        </div>
      )}
    </div>
  );
}

function Row({ label, needed, sub, children }: { label: string; needed: boolean; sub?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-t border-white/[0.05] py-3 first:border-t-0 first:pt-0.5">
      <span className="flex items-center gap-1.5 self-start pt-1 text-xs text-muted">
        {label}
        {needed && <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Needed" />}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        {sub !== undefined && (
          <p className={`truncate text-xs ${sub === "Not set" ? "text-muted/70" : "text-foreground/80"}`} title={sub}>
            {sub}
          </p>
        )}
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
  // the row whose box Claude is working on
  busy: string | null;
  onSet: (patch: Partial<ContractDetails>) => void;
  onAsk: (field: string, text: string, files: File[]) => void;
}) {
  const v = values(d, today);
  const needs = (...keys: string[]) => keys.some((k) => missing.has(k));
  const chip = (label: string, patch: Partial<ContractDetails>, on: boolean) => (
    <Chip key={label} label={label} on={on} disabled={locked} onClick={() => onSet(patch)} />
  );
  const other = (field: string, placeholder?: string, quick?: (t: string) => Partial<ContractDetails> | null) => (
    <Other
      placeholder={placeholder}
      busy={busy === field}
      disabled={locked || (busy !== null && busy !== field)}
      onSubmit={(text, files) => {
        const q = files.length ? null : quick?.(text);
        if (q) onSet(q);
        else onAsk(field, text, files);
      }}
    />
  );
  const platforms = ["YouTube", "Instagram", "TikTok", "LinkedIn"];

  return (
    <section className="panel rounded-3xl px-5 pb-2 pt-4">
      <h2 className="mb-3 text-sm font-medium">Details</h2>

      <Row label="Term" needed={needs("TERM_LENGTH")}>
        {chip("1-month trial", { termMonths: 1 }, d.termMonths === 1)}
        {[3, 6, 12].map((n) => chip(`${n} months`, { termMonths: n, extensionMonths: null }, d.termMonths === n))}
        {other("Term", d.termMonths && ![1, 3, 6, 12].includes(d.termMonths) ? `${d.termMonths} months` : "Other…", plainTerm)}
      </Row>

      <Row label="Monthly fee" needed={needs("MONTHLY_FEE")} sub={d.monthlyFee ? money(d.monthlyFee, d.currency) : "Not set"}>
        {other("Monthly fee", d.monthlyFee ? "Change…" : "e.g. £2,500", plainMoney)}
      </Row>

      <Row label="Payment" needed={false}>
        {chip("Upfront monthly", { payment: "upfront" }, d.payment === "upfront")}
        {chip("50/50 split", { payment: "split" }, d.payment === "split")}
      </Row>

      <Row
        label="Deliverables"
        needed={needs("DELIVERABLES")}
        sub={d.deliverables.length ? d.deliverables.map((x) => `${x.name} (${x.detail})`).join(" · ") : "Not set"}
      >
        {PACKAGES.map((p) => chip(p.label, { deliverables: p.list }, same(p.list, d.deliverables)))}
        {other("Deliverables", "Describe…")}
      </Row>

      <Row label="Platforms" needed={needs("PLATFORM_LIST")} sub={d.platforms.some((p) => !platforms.includes(p)) ? d.platforms.join(", ") : undefined}>
        {platforms.map((p) =>
          chip(p, { platforms: d.platforms.includes(p) ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] }, d.platforms.includes(p))
        )}
        {other("Platforms")}
      </Row>

      <Row
        label="Client"
        needed={needs("CLIENT_ENTITY", "CLIENT_ADDRESS", "CLIENT_COUNTRY", "CLIENT_SIGNATORY_1", "CLIENT_EMAIL_1", "CLIENT_SIGNATORY_2", "CLIENT_EMAIL_2")}
        sub={[v.CLIENT_ENTITY || "No name yet", v.CLIENT_COUNTRY, d.signatories[0]?.email, d.whatsapp && `WhatsApp ${d.whatsapp}`].filter(Boolean).join(" · ")}
      >
        {other("Client", "Correct or add…")}
      </Row>

      <Row label="Governing law" needed={needs("GOVERNING_LAW", "JURISDICTION_CLAUSE")} sub={d.termMonths === 1 ? "None on a trial" : v.GOVERNING_LAW || "Not set"}>
        {other("Governing law", "e.g. UAE law, Dubai courts")}
      </Row>
    </section>
  );
}
