"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import { EMAIL, PLATFORMS } from "@/lib/contract";
import { submitIntake, type IntakeInput } from "../actions";

// The first thing a new client fills in: who they are, their business, their
// content, who signs — four short steps, one idea each, so it never reads as
// a wall of fields. Everything asked here is something the contract needs.
// A half-filled form survives a reload (kept in this browser only).

type Form = Omit<IntakeInput, "signatory" | "second"> & {
  signsSelf: boolean;
  signatory: { name: string; email: string };
  second: { name: string; email: string } | null;
};

const BLANK: Form = {
  contactName: "",
  contactEmail: "",
  whatsapp: "",
  entity: "",
  tradingName: "",
  country: "",
  address: "",
  podcastName: "",
  platforms: [],
  signsSelf: true,
  signatory: { name: "", email: "" },
  second: null,
};

const STEPS = [
  { title: "Let's start with you", sub: "Who we'll be talking to about your agreement." },
  { title: "Your business", sub: "Exactly as it should appear on the contract." },
  { title: "Your content", sub: "What we'll be making for you, and where it goes out." },
  { title: "Who signs", sub: "We'll send the agreement to them for e-signature." },
];

type Errors = Partial<Record<string, string>>;

function check(step: number, f: Form): Errors {
  const e: Errors = {};
  const email = (v: string) => (!v.trim() ? "Add an email address." : !EMAIL.test(v.trim()) ? "That email doesn't look right." : undefined);
  if (step === 0) {
    if (!f.contactName.trim()) e.contactName = "Add your name.";
    e.contactEmail = email(f.contactEmail);
  }
  if (step === 1) {
    if (!f.entity.trim()) e.entity = "Add your business's legal name — or your own, if there's no company.";
    if (!f.country.trim()) e.country = "Choose your country.";
    if (!f.address.trim()) e.address = "Add your address.";
  }
  if (step === 2 && !f.platforms.length) e.platforms = "Pick at least one.";
  if (step === 3) {
    if (!f.signsSelf) {
      if (!f.signatory.name.trim()) e.signatoryName = "Add their name.";
      e.signatoryEmail = email(f.signatory.email);
    }
    if (f.second) {
      if (!f.second.name.trim()) e.secondName = "Add their name.";
      e.secondEmail = email(f.second.email);
    }
  }
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v));
}

export function IntakeForm({ token }: { token: string }) {
  const [f, setF] = useState<Form>(BLANK);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const saved = `start:${token}`;
  const set = (patch: Partial<Form>) => {
    setF((cur) => ({ ...cur, ...patch }));
    // an error goes as soon as its field is touched again
    setErrors((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  // pick up where they left off
  useEffect(() => {
    try {
      const kept = JSON.parse(localStorage.getItem(saved) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring what this browser kept, once
      if (kept?.f) setF({ ...BLANK, ...kept.f });
      if (typeof kept?.step === "number") setStep(Math.min(3, kept.step));
    } catch {}
  }, [saved]);
  useEffect(() => {
    try {
      if (!sent) localStorage.setItem(saved, JSON.stringify({ f, step }));
    } catch {}
  }, [f, step, saved, sent]);

  async function next(e: React.FormEvent) {
    e.preventDefault();
    const found = check(step, f);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (step < 3) return setStep(step + 1);
    setSending(true);
    setProblem(null);
    const res = await submitIntake(token, {
      ...f,
      signatory: f.signsSelf ? null : f.signatory,
      second: f.second,
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
        <span className="flex size-11 items-center justify-center rounded-full bg-[#a9b893]/15 text-[#c3d0ae]">
          <Check size={20} />
        </span>
        <h1 className="mt-6 text-[24px] font-normal tracking-tight">Thank you, {f.contactName.trim().split(/\s+/)[0]}.</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/50">
          We&apos;ll prepare your agreement and send it to <span className="text-white/80">{to.trim()}</span> for
          e-signature. There&apos;s nothing else you need to do for now.
        </p>
      </div>
    );
  }

  const s = STEPS[step];
  return (
    <form onSubmit={next} noValidate className="flex flex-col">
      {/* progress: where you are, and that it's short */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-[3px] flex-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-[#a9b893]" : "bg-white/10"}`}
            />
          ))}
        </div>
        <span className="text-[12px] tabular-nums text-white/40">
          {step + 1} of {STEPS.length}
        </span>
      </div>

      <div key={step} className="fade-in flex flex-col">
        <h1 className="text-[24px] font-normal tracking-tight">{s.title}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/45">{s.sub}</p>

        <div className="mt-8 flex flex-col gap-5">
          {step === 0 && (
            <>
              <Field label="Full name" required error={errors.contactName}>
                <Input value={f.contactName} onChange={(v) => set({ contactName: v })} placeholder="e.g. Andrew Thomas" autoComplete="name" invalid={!!errors.contactName} />
              </Field>
              <Field label="Email address" required error={errors.contactEmail}>
                <Input value={f.contactEmail} onChange={(v) => set({ contactEmail: v })} placeholder="e.g. andrew@example.com" type="email" autoComplete="email" invalid={!!errors.contactEmail} />
              </Field>
              <Field label="WhatsApp number" hint="Optional — the quickest way to reach you.">
                <Input value={f.whatsapp} onChange={(v) => set({ whatsapp: v })} placeholder="+44 7700 900123" type="tel" autoComplete="tel" />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Legal business name" required error={errors.entity} hint={errors.entity ? undefined : "As registered. No company? Use your full name."}>
                <Input value={f.entity} onChange={(v) => set({ entity: v })} placeholder="e.g. Thomas Studio Ltd" autoComplete="organization" invalid={!!errors.entity} autoFocus />
              </Field>
              <Field label="Trading name" hint="Optional — only if you trade under a different name.">
                <Input value={f.tradingName} onChange={(v) => set({ tradingName: v })} placeholder="e.g. The Thomas Show" />
              </Field>
              <Field label="Country" required error={errors.country}>
                <CountryPicker value={f.country} onChange={(v) => set({ country: v })} invalid={!!errors.country} />
              </Field>
              <Field label="Full address" required error={errors.address}>
                <textarea
                  value={f.address}
                  onChange={(e) => set({ address: e.target.value })}
                  placeholder="Street, city, postcode"
                  autoComplete="street-address"
                  rows={2}
                  className={`${inputClass(!!errors.address)} field-sizing-content min-h-[68px] resize-none py-3`}
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Podcast or brand name" hint="Optional — the show or brand we'll be working on.">
                <Input value={f.podcastName} onChange={(v) => set({ podcastName: v })} placeholder="e.g. The Thomas Show" autoFocus />
              </Field>
              <Field label="Where do you publish?" required error={errors.platforms} hint={errors.platforms ? undefined : "Pick all that apply."}>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => {
                    const on = f.platforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ platforms: on ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] })}
                        className={`flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors duration-200 ${
                          on
                            ? "border-[#a9b893]/60 bg-[#a9b893]/12 text-[#d5dfc4]"
                            : "border-white/[0.08] bg-[#151515] text-white/65 hover:border-white/20 hover:text-white/85"
                        }`}
                      >
                        {on && <Check size={13} />}
                        {p}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { self: true, label: "I'll sign it", sub: f.contactName.trim() || "You" },
                  { self: false, label: "Someone else", sub: "A director, partner…" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={f.signsSelf === o.self}
                    onClick={() => set({ signsSelf: o.self })}
                    className={`flex flex-col items-start rounded-xl border px-4 py-3.5 text-left transition-colors duration-200 ${
                      f.signsSelf === o.self ? "border-[#a9b893]/60 bg-[#a9b893]/[0.08]" : "border-white/[0.08] bg-[#151515] hover:border-white/20"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between text-[13.5px]">
                      {o.label}
                      <span
                        className={`flex size-4 items-center justify-center rounded-full border transition-colors ${
                          f.signsSelf === o.self ? "border-[#a9b893] bg-[#a9b893] text-[#10130d]" : "border-white/25"
                        }`}
                      >
                        {f.signsSelf === o.self && <Check size={10} strokeWidth={3} />}
                      </span>
                    </span>
                    <span className="mt-0.5 truncate text-[12px] text-white/40">{o.sub}</span>
                  </button>
                ))}
              </div>

              {!f.signsSelf && (
                <div className="fade-in grid gap-5 sm:grid-cols-2">
                  <Field label="Their name" required error={errors.signatoryName}>
                    <Input value={f.signatory.name} onChange={(v) => set({ signatory: { ...f.signatory, name: v } })} placeholder="Full name" invalid={!!errors.signatoryName} />
                  </Field>
                  <Field label="Their email" required error={errors.signatoryEmail}>
                    <Input value={f.signatory.email} onChange={(v) => set({ signatory: { ...f.signatory, email: v } })} placeholder="name@company.com" type="email" invalid={!!errors.signatoryEmail} />
                  </Field>
                </div>
              )}

              {f.second ? (
                <div className="fade-in flex flex-col gap-3 rounded-xl border border-white/[0.06] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-white/80">Second signatory</span>
                    <button type="button" onClick={() => set({ second: null })} aria-label="Remove second signatory" className="rounded-md p-1 text-white/40 transition-colors hover:text-white/80">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Name" required error={errors.secondName}>
                      <Input value={f.second.name} onChange={(v) => set({ second: { ...f.second!, name: v } })} placeholder="Full name" invalid={!!errors.secondName} autoFocus />
                    </Field>
                    <Field label="Email" required error={errors.secondEmail}>
                      <Input value={f.second.email} onChange={(v) => set({ second: { ...f.second!, email: v } })} placeholder="name@company.com" type="email" invalid={!!errors.secondEmail} />
                    </Field>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => set({ second: { name: "", email: "" } })} className="flex items-center gap-1.5 self-start text-[13px] text-white/55 transition-colors hover:text-white/90">
                  <Plus size={14} /> Add a second signatory
                </button>
              )}

              {/* one last look before it's sent */}
              <dl className="mt-1 flex flex-col divide-y divide-white/[0.06] rounded-xl bg-white/[0.025] text-[12.5px]">
                {[
                  { at: 0, label: "You", value: `${f.contactName.trim()} · ${f.contactEmail.trim()}` },
                  { at: 1, label: "Business", value: [f.entity.trim(), f.country.trim()].filter(Boolean).join(" · ") },
                  { at: 2, label: "Content", value: [f.podcastName.trim(), f.platforms.join(", ")].filter(Boolean).join(" · ") },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-3 px-4 py-2.5">
                    <dt className="w-16 shrink-0 text-white/40">{r.label}</dt>
                    <dd className="min-w-0 flex-1 truncate text-white/75">{r.value}</dd>
                    <button type="button" onClick={() => setStep(r.at)} className="text-white/40 transition-colors hover:text-white/85">
                      Edit
                    </button>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>

      {problem && <p className="fade-in mt-6 text-[12.5px] text-[#e59a9a]">{problem}</p>}

      <div className="mt-10 flex gap-2.5">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-white/60 transition-colors hover:border-white/20 hover:text-white"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <button
          type="submit"
          disabled={sending}
          className="h-11 flex-1 rounded-lg bg-[#a9b893] text-[13.5px] font-medium text-[#10130d] transition-colors duration-200 hover:bg-[#b8c6a3] disabled:opacity-60"
        >
          {step < 3 ? "Continue" : sending ? "Sending…" : "Send details"}
        </button>
      </div>

      <p className="mt-8 text-center text-[11.5px] leading-relaxed text-white/30">
        Your details are only used to prepare your agreement. See our{" "}
        <a href="/privacy" target="_blank" className="text-white/55 hover:text-white/80">
          Privacy Policy
        </a>
        .
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
        {required && <span className="ml-0.5 text-[#a9b893]"> *</span>}
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
      : "border-white/[0.06] hover:border-white/[0.14] focus:border-[#a9b893]/70 focus:shadow-[0_0_0_4px_rgba(169,184,147,0.12)]"
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
              {n === value && <Check size={13} className="text-[#a9b893]" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
