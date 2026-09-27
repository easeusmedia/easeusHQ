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

export type ChatMessage = { role: "user" | "assistant"; text: string; at: string };

// What doesn't change between turns: who it is, the rules it works to, how
// clauses are written.
const GUIDE = `You are the contract assistant inside Easeus HQ, the ops app of Easeus Media — a video editing agency (podcasts, long-form, reels) run by Ashmit Shahi, operating from India. You edit client Service Agreements with the ops team, who talk to you in plain, often brief language. Make the changes they ask for using your tools, then reply in one to three short sentences saying what you changed — plainly, without starting with "Done" and without justifying it by the rules unless asked. No preamble, no markdown headings. Use **bold** sparingly.

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

Behaviour
- Never invent facts about the client (names, emails, addresses, fees). If something needed is unclear, ask one short question instead of guessing.
- Several changes in one message: make them all.
- If asked to review or summarise, answer from the current contract without changing it.
- If the contract is locked (already sent for signature), explain it can't change now.`;

const person = { type: "object", properties: { name: { type: "string" }, email: { type: "string" } }, required: ["name", "email"] };

const TOOLS: Tool[] = [
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
function apply(name: string, input: Record<string, unknown>, work: { d: ContractDetails; clauses: Clause[] }): string {
  const at = (id: unknown) => work.clauses.findIndex((c) => c.id === id);
  if (name === "update_details") {
    work.d = withDefaults({ ...work.d, ...input });
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
  return `Done.${missing.length ? ` Still needed: ${missing.map((m) => m.label).join(", ")}.` : " Nothing missing."}`;
}

export async function askAboutContract(id: string, text: string) {
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) throw new Error("That contract no longer exists.");
  const locked = contract.status === "sent" || contract.status === "signed";
  const today = indiaDay(new Date());
  const history = (contract.chat as ChatMessage[] | null) ?? [];
  const work = { d: withDefaults(contract.details), clauses: structuredClone(contract.clauses as Clause[]) };

  const messages: Message[] = [
    ...history.slice(-20).map((m) => ({ role: m.role, content: m.text })),
    { role: "user" as const, content: text },
  ];
  let changed = false;
  let reply = "";
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
    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: calls.map((c) => {
        if (locked) return { type: "tool_result" as const, tool_use_id: c.id, content: "The contract is locked — it's already out for signature.", is_error: true };
        const out = apply(c.name, c.input, work);
        if (out.startsWith("Done")) changed = true;
        return { type: "tool_result" as const, tool_use_id: c.id, content: out };
      }),
    });
  }

  const now = new Date().toISOString();
  const chat: ChatMessage[] = [...history, { role: "user", text, at: now }, { role: "assistant", text: reply || "Done.", at: now }];
  // a change to an approved contract takes it back to draft, as any edit does
  const status = changed && contract.status === "approved" ? "draft" : contract.status;
  await prisma.contract.update({
    where: { id },
    data: { chat, ...(changed ? { details: work.d, clauses: work.clauses, status } : {}) },
  });
  return { chat, details: work.d, clauses: work.clauses, status };
}
