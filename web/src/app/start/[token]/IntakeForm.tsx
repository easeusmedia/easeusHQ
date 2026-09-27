"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { EMAIL, greetingName } from "@/lib/contract";
import { submitIntake } from "../actions";

// The first thing a new client fills in — one short page, only what the
// contract can't be written without: who they are (and their WhatsApp, the
// quickest way to reach them), their business, and who signs. Everything else is ours to fill in. A half-filled form survives a
// reload (kept in this browser only).

const BLANK = {
  contactName: "",
  contactEmail: "",
  whatsapp: "",
  // the WhatsApp number's country, for its calling code (ISO code, e.g. "IN")
  whatsappCountry: "",
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
  // optional, but a real number if given
  if (f.whatsapp.trim() && (!/^[\d\s+()-]+$/.test(f.whatsapp) || f.whatsapp.replace(/\D/g, "").length < 5)) e.whatsapp = "That number doesn't look right.";
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
    // a first guess at the WhatsApp code: the browser's region (en-IN → +91)
    const region = navigator.language.split("-")[1]?.toUpperCase();
    setF((cur) => (cur.whatsappCountry ? cur : { ...cur, whatsappCountry: region && DIAL[region] ? region : "GB" }));
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
      // the full international number: "+91 98765 43210" (typed with its
      // own + code, it's kept as it is)
      whatsapp: !f.whatsapp.trim() ? "" : f.whatsapp.trim().startsWith("+") ? f.whatsapp.trim() : `+${DIAL[f.whatsappCountry] ?? ""} ${f.whatsapp.trim()}`,
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
        <span className="flex size-11 items-center justify-center rounded-full bg-[#4b95e6]/15 text-[#9fc4f0]">
          <Check size={20} />
        </span>
        <h1 className="mt-6 text-[24px] font-normal tracking-tight">Thank you, {greetingName(f.contactName)}.</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/50">
          We have your details. Your agreement will be sent to <span className="text-white/80">{to.trim()}</span> for e-signature shortly.
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
        <Field label="WhatsApp number" error={errors.whatsapp}>
          <div className="flex gap-2">
            <DialPicker iso={f.whatsappCountry} onChange={(iso) => set({ whatsappCountry: iso })} />
            <Input value={f.whatsapp} onChange={(v) => set({ whatsapp: v })} placeholder="98765 43210" type="tel" autoComplete="tel-national" invalid={!!errors.whatsapp} />
          </div>
        </Field>
        <Field label="Business name" required error={errors.entity}>
          <Input value={f.entity} onChange={(v) => set({ entity: v })} placeholder="Registered name, or yours if there's no company" autoComplete="organization" invalid={!!errors.entity} />
        </Field>
        <Field label="Country" required error={errors.country}>
          <CountryPicker
            value={f.country}
            onChange={(v) =>
              // their country sets the WhatsApp code too, until they've typed a number
              set({ country: v, ...(!f.whatsapp.trim() && isoOf(v) ? { whatsappCountry: isoOf(v)! } : {}) })
            }
            invalid={!!errors.country}
          />
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
                  f.signsSelf === o.self ? "bg-[#4b95e6]/15 text-[#c4daf6]" : "text-white/50 hover:text-white/80"
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
        className="mt-9 h-11 rounded-lg bg-[#4b95e6] text-[13.5px] font-medium text-[#0b1220] transition-colors duration-200 hover:bg-[#63a4ec] disabled:opacity-60"
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
        {required && <span className="ml-0.5 text-[#4b95e6]"> *</span>}
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
      : "border-white/[0.06] hover:border-white/[0.14] focus:border-[#4b95e6]/70 focus:shadow-[0_0_0_4px_rgba(75,149,230,0.12)]"
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
          {shown.length === 0 && <li className="px-3 py-2.5 text-[13px] text-white/40">No matches</li>}
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
              {n === value && <Check size={13} className="text-[#4b95e6]" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Calling codes by country (ISO code + digits). Names come from the
// browser, like the country list above; flags are drawn from the ISO code.
const DIAL: Record<string, string> = Object.fromEntries(
  ("AF93 AL355 DZ213 AS1684 AD376 AO244 AI1264 AG1268 AR54 AM374 AW297 AU61 AT43 AZ994 BS1242 BH973 BD880 BB1246 BY375 BE32 " +
    "BZ501 BJ229 BM1441 BT975 BO591 BA387 BW267 BR55 BN673 BG359 BF226 BI257 KH855 CM237 CA1 CV238 KY1345 CF236 TD235 CL56 CN86 " +
    "CO57 KM269 CG242 CD243 CK682 CR506 CI225 HR385 CU53 CW599 CY357 CZ420 DK45 DJ253 DM1767 DO1809 EC593 EG20 SV503 GQ240 ER291 " +
    "EE372 SZ268 ET251 FJ679 FI358 FR33 GF594 PF689 GA241 GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1473 GP590 GU1671 GT502 GG44 " +
    "GN224 GW245 GY592 HT509 HN504 HK852 HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IM44 IL972 IT39 JM1876 JP81 JE44 JO962 KZ7 KE254 " +
    "KI686 XK383 KW965 KG996 LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 " +
    "MQ596 MR222 MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1664 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NC687 NZ64 NI505 " +
    "NE227 NG234 MK389 MP1670 NO47 OM968 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PL48 PT351 PR1787 QA974 RE262 RO40 RU7 RW250 " +
    "KN1869 LC1758 VC1784 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 SX1721 SK421 SI386 SB677 SO252 ZA27 KR82 SS211 ES34 " +
    "LK94 SD249 SR597 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 TL670 TG228 TO676 TT1868 TN216 TR90 TM993 TC1649 TV688 UG256 UA380 " +
    "AE971 GB44 US1 UY598 UZ998 VU678 VA39 VE58 VN84 VG1284 VI1340 YE967 ZM260 ZW263")
    .split(" ")
    .map((x) => [x.slice(0, 2), x.slice(2)])
);
const FIRST_ISO = ["GB", "US", "CA", "AU", "AE", "SA", "IN", "IE"];
const flag = (iso: string) => String.fromCodePoint(...[...iso].map((c) => 0x1f1a5 + c.charCodeAt(0)));

let dialCache: { iso: string; name: string; dial: string }[] | null = null;
function dialList() {
  if (dialCache) return dialCache;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const all = Object.keys(DIAL).map((iso) => ({ iso, name: names.of(iso) ?? iso, dial: DIAL[iso] }));
  dialCache = [
    ...FIRST_ISO.map((iso) => all.find((c) => c.iso === iso)!),
    ...all.filter((c) => !FIRST_ISO.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  return dialCache;
}
// the ISO code of a country picked by name, for its calling code
const isoOf = (name: string) => dialList().find((c) => c.name === name)?.iso;

function DialPicker({ iso, onChange }: { iso: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const all = useMemo(() => dialList(), []);
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const shown = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q)) : all;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
          setHi(0);
        }}
        aria-label="WhatsApp country code"
        aria-expanded={open}
        className="flex h-11 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#151515] px-3 text-[13.5px] text-white/90 transition-colors hover:border-white/[0.14]"
      >
        <span className="text-base leading-none">{iso ? flag(iso) : "🌐"}</span>
        <span className="tabular-nums">{iso ? `+${DIAL[iso]}` : "+"}</span>
        <ChevronDown size={14} className="text-white/40" />
      </button>
      {open && (
        <div className="fade-in absolute left-0 top-full z-20 mt-1.5 w-72 overflow-hidden rounded-xl border border-white/[0.08] bg-[#141414] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]">
          <input
            autoFocus
            value={query}
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
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (shown[hi]) pick(shown[hi].iso);
              } else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Search country or code"
            className="w-full border-b border-white/[0.06] bg-transparent px-3.5 py-3 text-[13px] text-white/90 outline-none! placeholder:text-white/30"
          />
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {shown.length === 0 && <li className="px-3 py-2.5 text-[13px] text-white/40">No matches</li>}
            {shown.map((c, i) => (
              <li
                key={c.iso}
                role="option"
                aria-selected={c.iso === iso}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c.iso);
                }}
                onMouseEnter={() => setHi(i)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] ${i === hi ? "bg-white/[0.06] text-white" : "text-white/70"} ${
                  !q && i === FIRST_ISO.length - 1 ? "mb-1 border-b border-white/[0.06] pb-2.5" : ""
                }`}
              >
                <span className="text-base leading-none">{flag(c.iso)}</span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="tabular-nums text-white/40">+{c.dial}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
