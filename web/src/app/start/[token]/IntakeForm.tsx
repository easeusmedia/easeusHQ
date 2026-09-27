"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { EMAIL } from "@/lib/contract";
import { submitIntake } from "../actions";

// The first thing a new client fills in — one short page, only what the
// contract can't be written without: who they are, their business, and who
// signs. Everything else is ours to fill in. A half-filled form survives a
// reload (kept in this browser only).

const BLANK = {
  contactName: "",
  contactEmail: "",
  entity: "",
  country: "",
  address: "",
  signsSelf: true,
  signatory: { name: "", email: "" },
};
type Form = typeof BLANK;
type Errors = Partial<Record<string, string>>;

function check(f: Form): Errors {
  const e: Errors = {};
  const email = (v: string) => (!v.trim() ? "Add an email." : !EMAIL.test(v.trim()) ? "That email doesn't look right." : undefined);
  if (!f.contactName.trim()) e.contactName = "Add your name.";
  e.contactEmail = email(f.contactEmail);
  if (!f.entity.trim()) e.entity = "Add your business name.";
  if (!f.country.trim()) e.country = "Choose your country.";
  if (!f.address.trim()) e.address = "Add your address.";
  if (!f.signsSelf) {
    if (!f.signatory.name.trim()) e.signatoryName = "Add their name.";
    e.signatoryEmail = email(f.signatory.email);
  }
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v));
}

export function IntakeForm({ token }: { token: string }) {
  const [f, setF] = useState<Form>(BLANK);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const saved = `start:${token}`;
  const set = (patch: Partial<Form>, field?: string) => {
    setF((cur) => ({ ...cur, ...patch }));
    // an error goes as soon as its field is touched again
    setErrors((cur) => {
      const next = { ...cur };
      for (const k of [...Object.keys(patch), field]) if (k) delete next[k];
      return next;
    });
  };

  // pick up where they left off
  useEffect(() => {
    try {
      const kept = JSON.parse(localStorage.getItem(saved) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring what this browser kept, once
      if (kept?.contactName !== undefined) setF({ ...BLANK, ...kept });
    } catch {}
  }, [saved]);
  useEffect(() => {
    try {
      if (!sent) localStorage.setItem(saved, JSON.stringify(f));
    } catch {}
  }, [f, saved, sent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = check(f);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    setProblem(null);
    const res = await submitIntake(token, {
      contactName: f.contactName,
      contactEmail: f.contactEmail,
      entity: f.entity,
      country: f.country,
      address: f.address,
      signatory: f.signsSelf ? null : f.signatory,
    });
    setSending(false);
    if (res.error) return setProblem(res.error);
    try {
      localStorage.removeItem(saved);
    } catch {}
    setSent(true);
  }

  if (sent) {
    const to = f.signsSelf ? f.contactEmail : f.signatory.email;
    return (
      <div className="fade-in flex flex-col items-start">
        <span className="flex size-11 items-center justify-center rounded-full bg-[#5ba8d4]/15 text-[#9dcbe7]">
          <Check size={20} />
        </span>
        <h1 className="mt-6 text-[24px] font-normal tracking-tight">Thank you, {f.contactName.trim().split(/\s+/)[0]}.</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/50">
          Your agreement will be sent to <span className="text-white/80">{to.trim()}</span> for e-signature shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="fade-in flex flex-col">
      <h1 className="text-[24px] font-normal tracking-tight">A few details for your agreement</h1>
      <p className="mt-1.5 text-[13.5px] text-white/45">Takes less than a minute.</p>

      <div className="mt-8 flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" required error={errors.contactName}>
            <Input value={f.contactName} onChange={(v) => set({ contactName: v })} placeholder="Andrew Thomas" autoComplete="name" invalid={!!errors.contactName} />
          </Field>
          <Field label="Email" required error={errors.contactEmail}>
            <Input value={f.contactEmail} onChange={(v) => set({ contactEmail: v })} placeholder="andrew@example.com" type="email" autoComplete="email" invalid={!!errors.contactEmail} />
          </Field>
        </div>
        <Field label="Business name" required error={errors.entity}>
          <Input value={f.entity} onChange={(v) => set({ entity: v })} placeholder="Registered name — or yours, if there's no company" autoComplete="organization" invalid={!!errors.entity} />
        </Field>
        <Field label="Country" required error={errors.country}>
          <CountryPicker value={f.country} onChange={(v) => set({ country: v })} invalid={!!errors.country} />
        </Field>
        <Field label="Address" required error={errors.address}>
          <Input value={f.address} onChange={(v) => set({ address: v })} placeholder="Street, city, postcode" autoComplete="street-address" invalid={!!errors.address} />
        </Field>

        <Field label="Who signs the agreement?">
          <div className="grid grid-cols-2 rounded-lg border border-white/[0.06] bg-[#151515] p-1">
            {[
              { self: true, label: "I'll sign it" },
              { self: false, label: "Someone else" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={f.signsSelf === o.self}
                onClick={() => set({ signsSelf: o.self })}
                className={`h-9 rounded-md text-[13px] transition-colors duration-200 ${
                  f.signsSelf === o.self ? "bg-[#5ba8d4]/15 text-[#c2e0f1]" : "text-white/50 hover:text-white/80"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        {!f.signsSelf && (
          <div className="fade-in grid gap-5 sm:grid-cols-2">
            <Field label="Their name" required error={errors.signatoryName}>
              <Input value={f.signatory.name} onChange={(v) => set({ signatory: { ...f.signatory, name: v } }, "signatoryName")} placeholder="Full name" invalid={!!errors.signatoryName} autoFocus />
            </Field>
            <Field label="Their email" required error={errors.signatoryEmail}>
              <Input value={f.signatory.email} onChange={(v) => set({ signatory: { ...f.signatory, email: v } }, "signatoryEmail")} placeholder="name@company.com" type="email" invalid={!!errors.signatoryEmail} />
            </Field>
          </div>
        )}
      </div>

      {problem && <p className="fade-in mt-6 text-[12.5px] text-[#e59a9a]">{problem}</p>}

      <button
        type="submit"
        disabled={sending}
        className="mt-9 h-11 rounded-lg bg-[#5ba8d4] text-[13.5px] font-medium text-[#0b1220] transition-colors duration-200 hover:bg-[#72b6dd] disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send details"}
      </button>

      <p className="mt-7 text-center text-[11.5px] text-white/30">
        Only used for your agreement ·{" "}
        <a href="/privacy" target="_blank" className="text-white/50 hover:text-white/80">
          Privacy Policy
        </a>
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] text-white/80">
        {label}
        {required && <span className="ml-0.5 text-[#5ba8d4]"> *</span>}
      </span>
      {children}
      {error ? <span className="fade-in text-[12px] text-[#e59a9a]">{error}</span> : hint && <span className="text-[12px] text-white/35">{hint}</span>}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  `w-full rounded-lg border bg-[#151515] px-3.5 text-[13.5px] text-white/90 outline-none! transition-[border-color,box-shadow] duration-200 placeholder:text-white/25 focus:bg-[#171717] ${
    invalid
      ? "border-[#e59a9a]/50 focus:shadow-[0_0_0_4px_rgba(229,154,154,0.10)]"
      : "border-white/[0.06] hover:border-white/[0.14] focus:border-[#5ba8d4]/70 focus:shadow-[0_0_0_4px_rgba(91,168,212,0.12)]"
  }`;

function Input({
  value,
  onChange,
  invalid = false,
  ...rest
}: { value: string; onChange: (v: string) => void; invalid?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} className={`${inputClass(invalid)} h-11`} />;
}

// The countries people most often pick first, then every other one — named
// by the browser itself, so the list needs no upkeep.
const FIRST = ["United Kingdom", "United States", "Canada", "Australia", "United Arab Emirates", "Saudi Arabia", "India", "Ireland"];
const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ", "AC", "CP", "CQ", "DG", "EA", "IC", "TA"]);
function countryNames(): string[] {
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const all = new Set<string>();
  for (let a = 65; a < 91; a++)
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_COUNTRIES.has(code)) continue;
      try {
        const n = names.of(code);
        if (n && n !== code) all.add(n);
      } catch {}
    }
  const rest = [...all].filter((n) => !FIRST.includes(n)).sort((x, y) => x.localeCompare(y));
  return [...FIRST, ...rest];
}

function CountryPicker({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  const all = useMemo(() => countryNames(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const shown = query.trim() ? all.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())) : all;

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="countries"
        aria-invalid={invalid}
        value={open ? query : value}
        placeholder={open && value ? value : "Search countries"}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHi(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (shown[hi]) pick(shown[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={`${inputClass(invalid)} h-11`}
      />
      {open && (
        <ul
          id="countries"
          ref={listRef}
          role="listbox"
          className="fade-in absolute inset-x-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#141414] p-1 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]"
        >
          {shown.length === 0 && <li className="px-3 py-2.5 text-[13px] text-white/40">No match</li>}
          {shown.map((n, i) => (
            <li
              key={n}
              role="option"
              aria-selected={n === value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(n);
              }}
              onMouseEnter={() => setHi(i)}
              className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-[13px] ${
                i === hi ? "bg-white/[0.06] text-white" : "text-white/70"
              } ${!query && i === FIRST.length - 1 ? "mb-1 border-b border-white/[0.06] pb-2.5" : ""}`}
            >
              {n}
              {n === value && <Check size={13} className="text-[#5ba8d4]" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
