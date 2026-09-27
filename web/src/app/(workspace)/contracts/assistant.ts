import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { indiaDay } from "@/lib/due";
import { claude, type Block, type Message, type Tool } from "@/lib/claude";
import {
  CONDITIONS,
  CURRENCIES,
  compose,
  withDefaults,
  type Clause,
  type ContractDetails,
} from "@/lib/contract";

// Claude as the contract's editor: ops says what they want in their own
// words, and Claude changes the details and clauses through the tools below
// — the same data the review page draws, so every change shows at once.

// An assistant message can end in a question with answers to pick from
// (files: the names of what was attached — the files themselves go to Claude
// with that one message and aren't kept)
export type ChatMessage = { role: "user" | "assistant"; text: string; at: string; question?: string; options?: string[]; files?: string[] };

// A file attached to a message, ready for Claude
export type Attachment = { name: string } & ({ kind: "image"; mediaType: string; data: string } | { kind: "pdf"; data: string } | { kind: "text"; data: string });

// What doesn't change between turns: who it is, the rules it works to, how
// clauses are written.
const GUIDE = `You are the contract assistant inside Easeus HQ, the ops app of Easeus Media — a video editing agency (podcasts, long-form, reels) run by Ashmit Shahi, operating from India. You edit client Service Agreements with the ops team, who talk to you in plain, often brief language.

The one rule above all: the contract only changes through your tools. Whenever ops gives you any information or asks for any change — an answer to your question, a figure, a list of deliverables, a new clause — you MUST call the tool that records it in that same turn, before replying or asking anything else. Never acknowledge an answer or move on without saving it, and never say something is set unless it's in the details or you just saved it. A plain "yes" confirming what's already there needs no tool. After saving, say what you set (e.g. "Platforms: YouTube and Instagram.") — not that it was "already there".

Asking: only ask when something is genuinely unclear, and then through the ask_question tool — never write a question in your text. One question per turn, with two or three options. Each option is a complete, concrete answer that can be picked as it is — "£2,500 GBP", "YouTube + Instagram", "2 long-form + 8 reels a month", "Keep $200 USD" — never a placeholder that needs more input ("Custom amount", "Custom list", "Set a date", "Change it", "Yes, name it", "Other"): the app always adds a field for typing any other answer. When the details already hold an answer, the first option keeps it. With nothing to go on, offer typical values (fees: £1,500 / £2,500 / $3,000; a name to show: the client's legal or trading name).

Your text is only a few words confirming what you just saved — "Fee: £2,500 GBP a month." — or nothing at all. Never repeat, introduce or hint at the question in your text; it's shown right below in its own card. Don't start with "Done", and don't justify anything by the rules unless asked. Save the answer and ask the next question in the same response, calling both tools together. No preamble, no markdown headings.

How a contract is built
- "Details" hold the facts (client, term, fee, deliverables…). Clauses read them through {{PLACEHOLDERS}} like {{CLIENT_ENTITY}}, {{TERM_LENGTH}}, {{MONTHLY_FEE}}, {{TOTAL_VALUE}}, {{PLATFORM_LIST}}. Change a fact with update_details, not by typing the value into a clause, so everything that uses it stays consistent.
- Clauses are the sections, in order, renumbered automatically. Body text: paragraphs separated by a blank line; a line starting "- " is a bullet; **bold**, *italic*. A paragraph starting with a condition in square brackets like "[trial]" or "[split]" only appears when that holds ("!" negates, several words must all hold). A clause's "when" does the same for the whole clause. Conditions: fixed (2+ months), trial (1 month), extension (trial with auto-extension), termination, disputes, upfront, split, podcast.
- Tables sit on their own line: [[parties]], [[fee]], [[scope]] (the deliverables), [[signatures]].
- For something the details don't cover, you can add a custom detail in "extra" (key "Retainer hours" becomes {{RETAINER_HOURS}}) or simply write the text into a clause.

The house rules (Easeus contract SOP)
- 1 month = trial (trial terms, no termination clause, no dispute resolution). 2+ months = fixed-term. Termination (four weeks' notice) is included from 3 months up by default; termination/disputes set to null follow these rules, true/false overrides them.
- The term starts when the first piece of content goes live, not at signing.
- Payment: full monthly fee upfront each month by default; "split" = 50% upfront, 50% on delivery of the first deliverables.
- Governing law: UK clients → UK contract law, courts of England and Wales; Saudi Arabia → Laws of the Kingdom of Saudi Arabia, courts of Riyadh; anywhere else, ask unless told.
- Every deliverable states its quantity explicitly (per episode and per month where they differ), and which episodes it covers if not all.
- Money: GBP, USD, EUR, AUD, CAD, AED, SAR, INR — amounts are numbers; formatting is automatic.
- Every client signatory is labelled CLIENT, never "Co-Signatory". At most two client signatories.
- Keep the formal, plain register of the existing clauses. Refer to "the Agency"/"the Service Provider" and "the Client".

The form
Ops fills most details in a form beside you. When a message starts with a field in brackets — [Monthly fee] 2500 AED, 20% off the first month — it came from that field's box: work out what they mean, save it (details, a note, a clause — whatever it takes), and reply in a few words. Ask back only if it's genuinely unclear.
A message from a field's box changes only what it asks for — "[Deliverables] same as the attached" means the deliverables (and anything else it names), nothing more.
Files may come attached — an earlier contract, a brief, a rate card, a screenshot. Read them and take only what the message asks for (with no instruction, fill in what's missing). Taking terms from an attached contract — fee, deliverables, term, clauses, wording — is exactly what it's for: do it straight away, no need to ask. Its client is someone else, so leave this contract's client (name, address, signatories) exactly as it is; the app keeps those anyway.
Say only what your tools confirmed. If a tool result says something was kept, don't claim it changed.

Behaviour
- Never invent facts about the client (names, emails, addresses, fees). If something needed is unclear, ask one short question instead of guessing.
- Several changes in one message: make them all.
- If asked to review or summarise, answer from the current contract without changing it.
- If the contract is locked (already sent for signature), explain it can't change now.`;

const person = { type: "object", properties: { name: { type: "string" }, email: { type: "string" } }, required: ["name", "email"] };

const TOOLS: Tool[] = [
  {
    name: "ask_question",
    description:
      "Ask ops one question, shown with your options as buttons plus a field for a custom answer. Their reply comes as their next message. Call it last, once per turn.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "One short question" },
        options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3, description: "The likeliest answers, a few words each" },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "update_details",
    description:
      "Change the contract's details. Only include fields that change. Lists (signatories, deliverables, platforms, extra) replace the whole list, so send the full new list. Use null for termination/disputes to follow the SOP rule.",
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", description: "Client's registered legal name" },
        tradingName: { type: "string" },
        address: { type: "string" },
        country: { type: "string" },
        podcastName: { type: "string" },
        platforms: { type: "array", items: { type: "string" } },
        signatories: { type: "array", items: person, maxItems: 2 },
        signingDate: { type: "string", description: "YYYY-MM-DD, or empty for the day it's sent" },
        commencementDate: { type: "string", description: "YYYY-MM-DD or empty" },
        contentUnit: { type: "string", description: "episode / YouTube video / piece of content" },
        termMonths: { type: ["integer", "null"] },
        extensionMonths: { type: ["integer", "null"], description: "Only for a 1-month trial that auto-extends" },
        currency: { type: "string", enum: CURRENCIES },
        monthlyFee: { type: ["number", "null"] },
        feeNote: { type: "string" },
        payment: { type: "string", enum: ["upfront", "split"] },
        deliverables: { type: "array", items: { type: "object", properties: { name: { type: "string" }, detail: { type: "string" } }, required: ["name", "detail"] } },
        rawContent: { type: "string" },
        additionalObligation: { type: "string" },
        termination: { type: ["boolean", "null"] },
        disputes: { type: ["boolean", "null"] },
        governingLaw: { type: "string" },
        jurisdiction: { type: "string", description: 'e.g. "exclusive jurisdiction of the courts of England and Wales"' },
        priorAgreement: { type: "string" },
        extra: { type: "array", items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] } },
      },
    },
  },
  {
    name: "edit_clause",
    description: "Change an existing clause's title, body and/or when-condition. Send the full new body when changing it.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, when: { type: "string", description: 'Condition, or "" for always' } },
      required: ["id"],
    },
  },
  {
    name: "add_clause",
    description: 'Add a new clause. after_id: the clause it follows ("START" for the very beginning; omitted = just before Signatures).',
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" }, when: { type: "string" }, after_id: { type: "string" } },
      required: ["title", "body"],
    },
  },
  {
    name: "remove_clause",
    description: "Remove a clause entirely.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "move_clause",
    description: 'Move a clause to just after another ("START" = first).',
    input_schema: { type: "object", properties: { id: { type: "string" }, after_id: { type: "string" } }, required: ["id", "after_id"] },
  },
];

// The contract as it stands, for Claude to read each turn
function state(d: ContractDetails, clauses: Clause[], status: string, today: string) {
  const { sections, missing, hidden } = compose(clauses, d, today);
  return [
    `Today: ${today}. Contract status: ${status}${status === "sent" || status === "signed" ? " (locked)" : ""}.`,
    `Details: ${JSON.stringify(d)}`,
    `Clauses, in order:\n${clauses
      .map((c) => `--- id: ${c.id} | title: ${c.title} | when: ${c.when || "always"}\n${c.body}`)
      .join("\n")}`,
    `As it reads now: ${sections.map((s) => `${s.number}. ${s.title}`).join("; ")}.`,
    hidden.length ? `Left out by their conditions: ${hidden.map((h) => h.title).join(", ")}.` : "",
    missing.length ? `Still needed before approval: ${missing.map((m) => m.label).join(", ")}.` : "Nothing is missing.",
    `Conditions available for "when": ${CONDITIONS.map((c) => c.value || '""').join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const clean = (c: Clause): Clause => ({
  id: c.id,
  title: String(c.title ?? "").slice(0, 200),
  body: String(c.body ?? "").slice(0, 20_000),
  ...(c.when ? { when: String(c.when).slice(0, 100) } : {}),
});

// Carries out one tool call on the working copy; what it says back to Claude
// Who the client is — kept as it is when files are attached, unless the
// message came from the Client box: an old contract attached for its terms
// carries some other client's name and address.
const IDENTITY = ["entity", "tradingName", "address", "country", "signatories", "contactName", "contactEmail", "whatsapp"];

function apply(name: string, input: Record<string, unknown>, work: { d: ContractDetails; clauses: Clause[] }, guardIdentity = false): string {
  const at = (id: unknown) => work.clauses.findIndex((c) => c.id === id);
  let kept = "";
  if (name === "update_details") {
    const blocked = guardIdentity ? IDENTITY.filter((k) => k in input) : [];
    if (blocked.length) kept = ` Kept the client's own ${blocked.join(", ")} — they only change when asked for in the Client box.`;
    work.d = withDefaults({ ...work.d, ...Object.fromEntries(Object.entries(input).filter(([k]) => !blocked.includes(k))) });
  } else if (name === "edit_clause") {
    const i = at(input.id);
    if (i < 0) return `No clause with id ${input.id}.`;
    const c = { ...work.clauses[i] };
    if (typeof input.title === "string") c.title = input.title;
    if (typeof input.body === "string") c.body = input.body;
    if (typeof input.when === "string") c.when = input.when || undefined;
    work.clauses[i] = clean(c);
  } else if (name === "add_clause") {
    const c = clean({ id: randomBytes(4).toString("hex"), title: String(input.title), body: String(input.body), when: input.when ? String(input.when) : undefined });
    // by default just before the signatures, or at the end without them
    const signatures = at("signatures");
    const fallback = signatures < 0 ? work.clauses.length : signatures;
    const after = input.after_id === "START" ? -1 : input.after_id ? at(input.after_id) : -2;
    work.clauses.splice(after === -2 || (after === -1 && input.after_id !== "START") ? fallback : after + 1, 0, c);
  } else if (name === "remove_clause") {
    const i = at(input.id);
    if (i < 0) return `No clause with id ${input.id}.`;
    work.clauses.splice(i, 1);
  } else if (name === "move_clause") {
    const i = at(input.id);
    if (i < 0) return `No clause with id ${input.id}.`;
    if (input.after_id !== "START" && at(input.after_id) < 0) return `No clause with id ${input.after_id}.`;
    const [c] = work.clauses.splice(i, 1);
    const after = input.after_id === "START" ? -1 : at(input.after_id);
    work.clauses.splice(after + 1, 0, c);
  } else return `Unknown tool ${name}.`;
  const { missing } = compose(work.clauses, work.d, indiaDay(new Date()));
  return `Done.${kept}${missing.length ? ` Still needed: ${missing.map((m) => m.label).join(", ")}.` : " Nothing missing."}`;
}

export async function askAboutContract(id: string, text: string, attached: Attachment[] = []) {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) throw new Error("That contract no longer exists.");
  const locked = contract.status === "sent" || contract.status === "signed";
  const today = indiaDay(new Date());
  const history = (contract.chat as ChatMessage[] | null) ?? [];
  const work = { d: withDefaults(contract.details), clauses: structuredClone(contract.clauses as Clause[]) };

  const before = structuredClone(work.d);
  const past = history.slice(-24);
  // Past questions go back to Claude as the tool calls they were, each
  // answered by the reply that followed — so it keeps asking that way.
  const messages: Message[] = past[0]?.role === "assistant" ? [{ role: "user", content: "(I've opened this contract.)" }] : [];
  let open: string | null = null;
  const answer = (reply: string): Message => ({
    role: "user",
    content: open ? [{ type: "tool_result", tool_use_id: open, content: reply }] : reply,
  });
  past.forEach((m, i) => {
    if (m.role === "user") {
      messages.push(answer(m.files?.length ? `${m.text}\n\n(Attached then: ${m.files.join(", ")})` : m.text));
      open = null;
      return;
    }
    const blocks: Block[] = m.text ? [{ type: "text", text: m.text }] : [];
    open = m.question ? `q${i}` : null;
    if (m.question) blocks.push({ type: "tool_use", id: `q${i}`, name: "ask_question", input: { question: m.question, options: m.options ?? [] } });
    messages.push({ role: "assistant", content: blocks.length ? blocks : "(nothing)" });
  });
  // this message, with anything attached to it (files first, as Claude reads best)
  const files: Block[] = attached.map((a) =>
    a.kind === "image"
      ? { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } }
      : a.kind === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data }, title: a.name }
        : { type: "text", text: `Attached file "${a.name}":\n${a.data}` }
  );
  const now = answer(text);
  if (files.length) now.content = typeof now.content === "string" ? [...files, { type: "text", text: now.content }] : [...now.content, ...files];
  messages.push(now);
  let changed = false;
  let reply = "";
  let asked: { question: string; options: string[] } | null = null;
  // ponytail: a fixed number of rounds is enough for any one request
  for (let round = 0; round < 8; round++) {
    const res = await claude({
      system: [
        { type: "text", text: GUIDE, cache_control: { type: "ephemeral" } },
        { type: "text", text: state(work.d, work.clauses, contract.status, today) },
      ],
      messages,
      tools: TOOLS,
    });
    reply = res.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim();
    const calls = res.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !calls.length) break;
    const results = calls.map((c) => {
      if (c.name === "ask_question") {
        // "Custom…"/"Other" options are what the answer field is for
        const options = (Array.isArray(c.input.options) ? c.input.options : []).map(String).filter((o) => !/^(custom|other|something else|different|change it|set a date|one thing)\b/i.test(o.trim()));
        asked = { question: String(c.input.question ?? ""), options: options.slice(0, 3) };
        return { type: "tool_result" as const, tool_use_id: c.id, content: "Shown to ops." };
      }
      if (locked) return { type: "tool_result" as const, tool_use_id: c.id, content: "The contract is locked — it's already out for signature.", is_error: true };
      const out = apply(c.name, c.input, work, attached.length > 0 && !text.startsWith("[Client]"));
      if (out.startsWith("Done")) changed = true;
      return { type: "tool_result" as const, tool_use_id: c.id, content: out };
    });
    // a question ends the turn: their answer is the next message
    if (asked) break;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: results });
  }

  const at = new Date().toISOString();
  const chat: ChatMessage[] = [
    ...history,
    { role: "user", text, at, ...(attached.length ? { files: attached.map((a) => a.name) } : {}) },
    { role: "assistant", text: reply || (asked ? "" : "Done."), at, ...(asked ?? {}) },
  ];
  // a change to an approved contract takes it back to draft, as any edit does
  const status = changed && contract.status === "approved" ? "draft" : contract.status;
  // Only what Claude changed goes over what's saved now — the form may have
  // saved something else while it was thinking.
  const fresh = withDefaults((await prisma.contract.findUnique({ where: { id }, select: { details: true } }))?.details);
  const details = withDefaults({
    ...fresh,
    ...Object.fromEntries(
      Object.entries(work.d).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k as keyof ContractDetails]))
    ),
  });
  await prisma.contract.update({
    where: { id },
    data: { chat, ...(changed ? { details, clauses: work.clauses, status } : {}) },
  });
  return { chat, details, clauses: work.clauses, status };
}
