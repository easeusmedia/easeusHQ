// A client's service agreement: the details it's filled in from, the clauses
// it's made of, and how the two become the document — the same result in the
// review page and in the PDF that goes out for signing (lib/contractPdf.tsx).
// Built from the Contract Generation SOP: the clauses below are its master
// template, and ops can change them under Contracts → Master template.
//
// A clause's body is plain text with a few marks:
//   {{CLIENT_ENTITY}}   filled in from the details (see `values`)
//   [trial] …           a paragraph that only appears when that holds —
//                       several words must all hold, "!" negates one
//   - …                 a bullet
//   **bold**, *italic*
//   [[parties]] [[fee]] [[scope]] [[signatures]]   the tables, on a line of their own
// Paragraphs are separated by a blank line.

export type Signatory = { name: string; email: string };
export type Deliverable = { name: string; detail: string };

export type ContractDetails = {
  // what the client told us on the form
  contactName: string;
  contactEmail: string;
  whatsapp: string;
  entity: string; // registered name, or the person's own when there's no company
  tradingName: string;
  signatories: Signatory[]; // one or two, every one labelled CLIENT
  address: string;
  country: string;
  podcastName: string;
  platforms: string[];
  // what we decide
  signingDate: string; // yyyy-mm-dd; "" = the day it's sent
  commencementDate: string; // yyyy-mm-dd, optional — the term still runs from the first publish
  contentUnit: string; // episode / YouTube video / piece of content
  termMonths: number | null;
  extensionMonths: number | null; // a one-month trial that carries on unless either side stops it
  currency: string;
  monthlyFee: number | null;
  feeNote: string; // e.g. a discounted first month, and why
  payment: "upfront" | "split";
  deliverables: Deliverable[];
  rawContent: string;
  additionalObligation: string;
  // null = by the SOP's rule; true/false = decided for this one
  termination: boolean | null;
  disputes: boolean | null;
  governingLaw: string; // "" = from the country
  jurisdiction: string;
  priorAgreement: string; // e.g. "the trial agreement dated 1 April 2026"
  // anything else a clause needs, used as {{KEY}}
  extra: { key: string; value: string }[];
};

export const BLANK_DETAILS: ContractDetails = {
  contactName: "",
  contactEmail: "",
  whatsapp: "",
  entity: "",
  tradingName: "",
  signatories: [{ name: "", email: "" }],
  address: "",
  country: "",
  podcastName: "",
  platforms: [],
  signingDate: "",
  commencementDate: "",
  contentUnit: "episode",
  termMonths: null,
  extensionMonths: null,
  currency: "GBP",
  monthlyFee: null,
  feeNote: "",
  payment: "upfront",
  deliverables: [],
  rawContent: "",
  additionalObligation: "",
  termination: null,
  disputes: null,
  governingLaw: "",
  jurisdiction: "",
  priorAgreement: "",
  extra: [],
};

// Whatever's stored, as a complete set of details — older rows, or a field
// added since, just fall back to the blank value.
export function withDefaults(raw: unknown): ContractDetails {
  const d = { ...BLANK_DETAILS, ...(raw && typeof raw === "object" ? (raw as Partial<ContractDetails>) : {}) };
  if (!Array.isArray(d.signatories) || d.signatories.length === 0) d.signatories = [{ name: "", email: "" }];
  return d;
}

export type Clause = { id: string; title: string; body: string; when?: string };

// The service provider — the same on every contract
export const PROVIDER = {
  name: "Easeus Media (Easeusnow)",
  person: "Ashmit Shahi",
  gst: "10OEHPS2897E1Z2",
  location: "Operating from India",
  // signs every contract, after the client
  email: "easeus.media@gmail.com",
};

export const CONTENT_UNITS = ["episode", "YouTube video", "piece of content"];
export const PLATFORMS = ["YouTube", "Instagram", "TikTok", "LinkedIn", "X", "Facebook", "Spotify", "Apple Podcasts"];
export const CURRENCIES = ["GBP", "USD", "EUR", "AUD", "CAD", "AED", "SAR", "INR"];
const SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", AUD: "A$", CAD: "CA$" };

// When a clause (or a paragraph in one) applies. Shown in the template editor.
export const CONDITIONS: { value: string; label: string }[] = [
  { value: "", label: "Always" },
  { value: "fixed", label: "Fixed-term (2+ months)" },
  { value: "trial", label: "Trial (1 month)" },
  { value: "trial !extension", label: "Trial, no extension" },
  { value: "extension", label: "Trial with auto-extension" },
  { value: "termination", label: "With a termination clause" },
  { value: "disputes", label: "With dispute resolution" },
  { value: "upfront", label: "Paid monthly upfront" },
  { value: "split", label: "50/50 split payment" },
];

const p = (...lines: string[]) => lines.join("\n\n");

export const DEFAULT_CLAUSES: Clause[] = [
  {
    id: "term",
    title: "Agreement Term",
    body: p(
      "This Agreement is made on the **{{SIGNING_DATE_ORDINAL}}**.",
      "**BETWEEN:**",
      "[[parties]]",
      'Each a "Party" and together the "Parties." Primary contact shall be between Ashmit Shahi (Service Provider) and {{CLIENT_SIGNATORY_LIST}} (Client).',
      "[podcast] **Podcast:** {{PODCAST_NAME}}",
      "[fixed] This Agreement is for a fixed term of **{{TERM_LENGTH}}**{{COMMENCEMENT_PREFIX}}. The term shall commence from the date the first {{CONTENT_UNIT}} produced under this engagement is published on the Client's platform(s), and not from the date of signing.",
      "[trial !extension] This Agreement is for a **{{TERM_LENGTH}} trial term**. The term shall commence from the date the first {{CONTENT_UNIT}} produced under this engagement is published on the Client's platform(s), and not from the date of signing. Upon expiry, a new agreement will be drafted should both Parties wish to continue.",
      "[extension] This Agreement is for a **{{TERM_LENGTH}} trial term**. The term shall commence from the date the first {{CONTENT_UNIT}} produced under this engagement is published on the Client's platform(s), and not from the date of signing.",
      "The Services are provided on a monthly subscription basis and billed monthly.",
      "The Client understands that timely delivery of raw content, approvals, and feedback, within a reasonable timeframe agreed between both Parties, is required for smooth execution, and any delay caused by the Client will not pause, extend, or suspend the monthly subscription, which shall continue as agreed.",
      "In the event of a delay caused solely by the Service Provider, the affected work will be reasonably adjusted, and the Client will not be charged for the period corresponding to such delay."
    ),
  },
  {
    id: "fees",
    title: "Fees & Payment Terms",
    body: p(
      "The Client shall pay the Agency a monthly fee of:",
      "[[fee]]",
      "{{FEE_ADJUSTMENT_NOTE}}",
      "[upfront] Payment must be made in advance, upfront, for each month of the Term.",
      "[upfront] The Agency shall not be obligated to continue work unless payment has been cleared.",
      "[split] **Payment Structure:**",
      "[split]\n- **50% ({{DEPOSIT_AMOUNT}})** is due upfront before commencement of work.\n- **50% ({{BALANCE_AMOUNT}})** is due upon delivery of all deliverables associated with the first {{CONTENT_UNIT}}.",
      "[split] The Agency shall not be obligated to commence or continue work unless the applicable payment instalment has been cleared."
    ),
  },
  {
    id: "scope",
    title: "Scope of Services",
    body: p(
      "The Agency shall provide the Client the following services each month{{SCOPE_QUALIFIER}}:",
      "[[scope]]",
      "*Any services not expressly listed above shall be considered outside scope and may require a separate agreement or additional fee.*"
    ),
  },
  {
    id: "obligations",
    title: "Client Obligations",
    body: p(
      "The Client agrees to:",
      [
        "- Provide all required footage, branding, access credentials, and references promptly.",
        "- Grant necessary access to {{PLATFORM_LIST}} accounts.",
        "- Supply feedback in a timely manner to avoid delays.",
        "- Provide {{RAW_CONTENT_DESCRIPTION}} within reasonable timeframes.",
        "- {{ADDITIONAL_OBLIGATION}}",
      ].join("\n")
    ),
  },
  {
    id: "ip",
    title: "Ownership & Intellectual Property",
    body: p(
      "Upon full payment, the Client receives 100% rights and ownership to all final delivered content.",
      "The Agency retains the right to use completed, publicly posted work for portfolio purposes, unless the Client requests otherwise in writing."
    ),
  },
  {
    id: "termination",
    title: "Termination (Break Clause)",
    when: "termination",
    body: p(
      "Either Party may terminate this Agreement with **four (4) weeks'** written notice.",
      "Work already completed will be delivered.",
      "Payments already made are non-refundable.",
      "If termination occurs mid-cycle, the Agency will fulfil work proportional to the amount paid."
    ),
  },
  {
    id: "trial",
    title: "Trial Terms & Continuation",
    when: "trial !extension",
    body: p(
      "This Agreement covers a **{{TERM_LENGTH}} trial period** only. Upon completion of the trial, both Parties shall review the engagement and, if mutually agreed, enter into a new, separate Service Agreement for ongoing services.",
      "This trial Agreement shall automatically expire at the end of the {{TERM_LENGTH}} term. No automatic renewal or continuation of services shall occur without a new written agreement signed by both Parties. Any continuation of services beyond this trial period without a signed agreement shall not be implied by either Party."
    ),
  },
  {
    id: "extension",
    title: "Trial & Extension Terms",
    when: "extension",
    body: p(
      "The initial trial period covers **{{TRIAL_MONTH}}** only. Upon completion, both Parties shall review the engagement. If neither Party provides written notice before the end of {{TRIAL_MONTH}} that they wish to discontinue, this Agreement shall automatically extend for **{{EXTENSION_MONTHS}}** at the same terms.",
      "If the trial is not continued, the Agreement shall expire at the end of {{TRIAL_MONTH}}. Payments already made are non-refundable. Work completed up to that point will be delivered."
    ),
  },
  {
    id: "disputes",
    title: "Dispute Resolution",
    when: "disputes",
    body: p(
      "Both Parties agree to attempt to resolve any dispute amicably and in good faith before taking further action.",
      "If unresolved, this Agreement shall be governed by {{GOVERNING_LAW}}.",
      "Any disputes shall be subject to the {{JURISDICTION_CLAUSE}}, unless otherwise agreed in writing by both Parties."
    ),
  },
  {
    id: "entire",
    title: "Entire Agreement",
    body: "This Agreement constitutes the entire understanding between the Parties and supersedes all prior discussions{{PRIOR_AGREEMENT_CLAUSE}}. Any amendments must be in writing and signed by both Parties.",
  },
  { id: "signatures", title: "Signatures", body: "[[signatures]]" },
];

// ---- formatting ----

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "twenty-one", "twenty-two",
  "twenty-three", "twenty-four"];

// "three (3) months"
export function termLength(months: number): string {
  return `${WORDS[months] ?? months} (${months}) month${months === 1 ? "" : "s"}`;
}

// "£2,500 GBP", "$2,000 USD", "INR 2,40,000" — INR as letters: its symbol
// renders as a black box in the PDF's Helvetica
export function money(amount: number, currency: string): string {
  const n = amount.toLocaleString(currency === "INR" ? "en-IN" : "en-GB", { maximumFractionDigits: 2 });
  return SYMBOL[currency] ? `${SYMBOL[currency]}${n} ${currency}` : `${currency} ${n}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (day: string) => day.split("-").map(Number);

// "27 April 2026"
export function longDate(day: string): string {
  const [y, m, d] = parts(day);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// "27th day of April 2026"
export function ordinalDate(day: string): string {
  const [y, m, d] = parts(day);
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix} day of ${MONTHS[m - 1]} ${y}`;
}

// "YouTube, Instagram, and TikTok"
export function listOf(items: string[]): string {
  if (items.length < 3) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Governing law and courts by the client's country (SOP 5.3). Anywhere else
// is asked for.
const LAW: Record<string, { law: string; courts: string }> = {
  "united kingdom": { law: "UK contract law", courts: "exclusive jurisdiction of the courts of England and Wales" },
  "saudi arabia": { law: "the Laws of the Kingdom of Saudi Arabia", courts: "exclusive jurisdiction of the courts of Riyadh" },
};
const lawFor = (country: string) => LAW[country.trim().toLowerCase().replace(/^(uk|england|great britain)$/, "united kingdom")];

// ---- the rules ----

// What holds for this contract, for [conditions] and clause `when`s
export function conditions(d: ContractDetails): Record<string, boolean> {
  const months = d.termMonths ?? 0;
  const trial = months === 1;
  const extension = trial && !!d.extensionMonths;
  return {
    trial,
    fixed: months >= 2,
    extension,
    upfront: d.payment !== "split",
    split: d.payment === "split",
    // SOP 5.2: four weeks' notice from three months up; a trial has its own terms
    termination: d.termination ?? months >= 3,
    // SOP 5.3: never on a one-month trial
    disputes: !trial && (d.disputes ?? true),
    podcast: !!d.podcastName.trim(),
  };
}

export function holds(when: string | undefined, c: Record<string, boolean>): boolean {
  return (when ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => (w.startsWith("!") ? !c[w.slice(1)] : !!c[w]));
}

export const extraKey = (key: string) => key.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

// Every {{PLACEHOLDER}}'s value. `today` (yyyy-mm-dd) stands in for a signing
// date that isn't set yet — it's set to the day the contract is sent.
export function values(d: ContractDetails, today: string): Record<string, string> {
  const signing = d.signingDate || today;
  const months = d.termMonths ?? 0;
  const fee = d.monthlyFee != null && d.monthlyFee > 0 ? d.monthlyFee : null;
  const total = fee && months ? fee * months : null;
  const names = d.signatories.map((s) => s.name.trim()).filter(Boolean);
  const law = lawFor(d.country);
  const trading = d.tradingName.trim();
  const podcast = d.podcastName.trim();
  const v: Record<string, string> = {
    SIGNING_DATE: longDate(signing),
    SIGNING_DATE_ORDINAL: ordinalDate(signing),
    CLIENT_ENTITY: d.entity.trim(),
    CLIENT_TRADING_NAME: trading,
    CLIENT_TRADING_NAME_LINE: trading ? `t/a ${trading}` : "",
    CLIENT_SIGNATORY_1: d.signatories[0]?.name.trim() ?? "",
    CLIENT_EMAIL_1: d.signatories[0]?.email.trim() ?? "",
    CLIENT_SIGNATORY_2: d.signatories[1]?.name.trim() ?? "",
    CLIENT_EMAIL_2: d.signatories[1]?.email.trim() ?? "",
    CLIENT_SIGNATORY_LIST: names.join(" & "),
    CLIENT_ADDRESS: d.address.trim(),
    CLIENT_COUNTRY: d.country.trim(),
    PODCAST_NAME: podcast,
    TERM_LENGTH: months ? termLength(months) : "",
    COMMENCEMENT_PREFIX: d.commencementDate ? `, commencing from **${longDate(d.commencementDate)}**` : "",
    CONTENT_UNIT: d.contentUnit.trim(),
    MONTHLY_FEE: fee ? money(fee, d.currency) : "",
    TOTAL_VALUE: total ? money(total, d.currency) : "",
    DEPOSIT_AMOUNT: total ? money(total / 2, d.currency) : "",
    BALANCE_AMOUNT: total ? money(total / 2, d.currency) : "",
    FEE_ADJUSTMENT_NOTE: d.feeNote.trim(),
    SCOPE_QUALIFIER: podcast ? ` for the podcast **${podcast}**` : "",
    PLATFORM_LIST: listOf(d.platforms),
    RAW_CONTENT_DESCRIPTION: d.rawContent.trim() || (d.contentUnit.trim() ? `${d.contentUnit.trim()} raw content ready for editing` : ""),
    ADDITIONAL_OBLIGATION: d.additionalObligation.trim(),
    GOVERNING_LAW: d.governingLaw.trim() || law?.law || "",
    JURISDICTION_CLAUSE: d.jurisdiction.trim() || law?.courts || "",
    TRIAL_MONTH: d.commencementDate ? `${MONTHS[parts(d.commencementDate)[1] - 1]} ${parts(d.commencementDate)[0]}` : "the first month",
    EXTENSION_MONTHS: d.extensionMonths ? termLength(d.extensionMonths) : "",
    PRIOR_AGREEMENT_CLAUSE: d.priorAgreement.trim() ? `, including ${d.priorAgreement.trim()}` : "",
    DELIVERABLES: d.deliverables.some((x) => x.name.trim() && x.detail.trim()) ? "yes" : "",
  };
  for (const e of d.extra) if (extraKey(e.key)) v[extraKey(e.key)] = e.value.trim();
  return v;
}

// Fine to leave empty: they just drop out of the sentence they're in
const OPTIONAL = new Set([
  "CLIENT_TRADING_NAME",
  "CLIENT_TRADING_NAME_LINE",
  "CLIENT_SIGNATORY_2",
  "CLIENT_EMAIL_2",
  "COMMENCEMENT_PREFIX",
  "FEE_ADJUSTMENT_NOTE",
  "SCOPE_QUALIFIER",
  "ADDITIONAL_OBLIGATION",
  "PRIOR_AGREEMENT_CLAUSE",
]);

// The field each placeholder comes from, as the review page names it
const FROM: Record<string, string> = {
  SIGNING_DATE_ORDINAL: "SIGNING_DATE",
  CLIENT_TRADING_NAME_LINE: "CLIENT_TRADING_NAME",
  CLIENT_SIGNATORY_LIST: "CLIENT_SIGNATORY_1",
  TOTAL_VALUE: "MONTHLY_FEE",
  DEPOSIT_AMOUNT: "MONTHLY_FEE",
  BALANCE_AMOUNT: "MONTHLY_FEE",
  RAW_CONTENT_DESCRIPTION: "CONTENT_UNIT",
};
export const FIELD_LABEL: Record<string, string> = {
  SIGNING_DATE: "Signing date",
  CLIENT_ENTITY: "Legal name",
  CLIENT_TRADING_NAME: "Trading name",
  CLIENT_SIGNATORY_1: "Signatory",
  CLIENT_EMAIL_1: "Signatory's email",
  CLIENT_SIGNATORY_2: "Second signatory",
  CLIENT_EMAIL_2: "Second signatory's email",
  CLIENT_ADDRESS: "Address",
  CLIENT_COUNTRY: "Country",
  PODCAST_NAME: "Podcast or brand",
  TERM_LENGTH: "Term",
  CONTENT_UNIT: "Content unit",
  MONTHLY_FEE: "Monthly fee",
  PLATFORM_LIST: "Platforms",
  GOVERNING_LAW: "Governing law",
  JURISDICTION_CLAUSE: "Courts",
  EXTENSION_MONTHS: "Extension",
  DELIVERABLES: "Deliverables",
};
export const fieldOf = (key: string) => FROM[key] ?? key;
export const labelOf = (key: string) =>
  FIELD_LABEL[fieldOf(key)] ?? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " ");

// What the tables need, as the placeholders they're drawn from
const BLOCK_NEEDS: Record<string, string[]> = {
  parties: ["CLIENT_ENTITY", "CLIENT_SIGNATORY_1", "CLIENT_EMAIL_1", "CLIENT_ADDRESS", "CLIENT_COUNTRY"],
  fee: ["MONTHLY_FEE", "TERM_LENGTH"],
  scope: ["DELIVERABLES"],
  signatures: ["CLIENT_ENTITY", "CLIENT_SIGNATORY_1", "CLIENT_EMAIL_1"],
};

export type Block =
  | { kind: "p"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; name: "parties" | "fee" | "scope" | "signatures" };
export type Section = { id: string; number: number; title: string; blocks: Block[] };

const PLACEHOLDER = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;
const BLOCK = /^\[\[(parties|fee|scope|signatures)\]\]$/;
const CONDITION = /^\[(?!\[)([^\]]*)\]\s*/;

// The contract as it reads: each clause that applies, numbered in order with
// no gaps, its placeholders filled in. A required value that's still missing
// stays as {{ITS_NAME}} in the text (the review page marks it) and is listed
// in `missing`, which has to be empty before it can be approved or sent.
export function compose(clauses: Clause[], d: ContractDetails, today: string) {
  const v = values(d, today);
  const c = conditions(d);
  const used = new Set<string>();
  const fill = (text: string) =>
    text.replace(PLACEHOLDER, (whole, key: string) => {
      used.add(key);
      if (v[key]) return v[key];
      return key in v && OPTIONAL.has(key) ? "" : `{{${key}}}`;
    });

  const sections: Section[] = [];
  const hidden: Clause[] = [];
  for (const clause of clauses) {
    if (!holds(clause.when, c)) {
      hidden.push(clause);
      continue;
    }
    const blocks: Block[] = [];
    for (const raw of clause.body.split(/\n\s*\n/)) {
      let para = raw.trim();
      const cond = para.match(CONDITION);
      if (cond) {
        if (!holds(cond[1], c)) continue;
        para = para.slice(cond[0].length).trim();
      }
      const table = para.match(BLOCK);
      if (table) {
        const name = table[1] as "parties" | "fee" | "scope" | "signatures";
        BLOCK_NEEDS[name].forEach((k) => used.add(k));
        blocks.push({ kind: "table", name });
        continue;
      }
      const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length && lines.every((l) => l.startsWith("- "))) {
        const items = lines.map((l) => fill(l.slice(2)).trim()).filter(Boolean);
        if (items.length) blocks.push({ kind: "bullets", items });
        continue;
      }
      const text = fill(lines.join(" ")).trim();
      if (text) blocks.push({ kind: "p", text });
    }
    if (blocks.length) sections.push({ id: clause.id, number: sections.length + 1, title: clause.title.trim(), blocks });
  }

  const missing = new Map<string, string>();
  for (const key of used) {
    if (v[key] || (key in v && OPTIONAL.has(key))) continue;
    missing.set(fieldOf(key), labelOf(key));
  }
  // a second signatory is optional, but half of one isn't
  const second = d.signatories[1];
  if (second && (second.name.trim() || second.email.trim())) {
    if (!second.name.trim()) missing.set("CLIENT_SIGNATORY_2", labelOf("CLIENT_SIGNATORY_2"));
    if (!second.email.trim()) missing.set("CLIENT_EMAIL_2", labelOf("CLIENT_EMAIL_2"));
  }
  for (const s of d.signatories) {
    if (s.email.trim() && !EMAIL.test(s.email.trim())) missing.set("CLIENT_EMAIL_1", "A valid signatory email");
  }

  return {
    sections,
    values: v,
    missing: [...missing].map(([key, label]) => ({ key, label })),
    hidden: hidden.map((h) => ({ id: h.id, title: h.title })),
  };
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A clause's text in runs, for **bold** and *italic*
export function runs(text: string): { text: string; bold?: boolean; italic?: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
    .filter(Boolean)
    .map((t) =>
      t.startsWith("**") && t.endsWith("**") && t.length > 4
        ? { text: t.slice(2, -2), bold: true }
        : t.startsWith("*") && t.endsWith("*") && t.length > 2
          ? { text: t.slice(1, -1), italic: true }
          : { text: t }
    );
}

// ---- following it through Adobe ----

// What Acrobat calls the agreement: the downloaded file's name, which its
// emails then carry in their subjects
export const agreementName = (d: ContractDetails, fallback?: string | null) =>
  `Service Agreement - ${d.entity.trim() || fallback?.trim() || "Draft"}`.replace(/[\\/:*?"<>|]/g, "");

export type SignEvent = {
  kind: "sent" | "requested" | "viewed" | "signed-by" | "completed" | "declined" | "cancelled" | "expired" | "undeliverable";
  text: string;
};

// One of Adobe Sign's email subjects, read for what it says about this
// agreement — "Service Agreement - Demo has been sent out for signature to
// x@y.com", "… between Easeus Media and Jane is Signed and Filed!" — or
// null when it's about something else.
export function readAdobeSubject(subject: string, agreement: string): SignEvent | null {
  const norm = (t: string) => t.replace(/[“”"']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const s = norm(subject);
  const name = norm(agreement);
  const at = s.indexOf(name);
  if (at < 0) return null;
  // "… - Demo" isn't "… - Demo Studios"
  if (!/^(\s+(has|have|between|is|was|signed|and)\b|\s*$|[!.,:])/.test(s.slice(at + name.length))) return null;
  if (/signed and filed/.test(s)) return { kind: "completed", text: "Signed by everyone and filed" };
  let m = subject.match(/sent out for signature to (.+?)[.!]?$/i);
  if (m) return { kind: "sent", text: `Sent to ${m[1].trim()}` };
  if (/signature requested on/.test(s)) return { kind: "requested", text: "Waiting for Ashmit's signature" };
  m = subject.match(/signed by (.+?)[.!]?$/i);
  if (m) return { kind: "signed-by", text: `Signed by ${m[1].trim()}` };
  if (/viewed/.test(s)) return { kind: "viewed", text: "Viewed" };
  if (/declined|rejected/.test(s)) return { kind: "declined", text: "Declined" };
  if (/cancel/.test(s)) return { kind: "cancelled", text: "Cancelled" };
  if (/expired/.test(s)) return { kind: "expired", text: "Expired" };
  return null;
}

// Adobe's "Document - Undeliverable" email doesn't name the agreement in its
// subject — its text does: "Service Agreement - Demo: Undeliverable We were
// unable to deliver your document to the email address x@y.com."
export function readAdobeMail(subject: string, snippet: string, agreement: string): SignEvent | null {
  if (/undeliverable/i.test(subject)) {
    const norm = (t: string) => t.replace(/[“”"']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!norm(snippet).startsWith(`${norm(agreement)}:`)) return null;
    const to = snippet.match(/email address (\S+@\S+?)\.?(?:\s|$)/i)?.[1];
    return { kind: "undeliverable", text: `Couldn't be delivered${to ? ` to ${to}` : ""}` };
  }
  return readAdobeSubject(subject, agreement);
}
