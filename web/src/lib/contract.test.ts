import { test } from "node:test";
import assert from "node:assert/strict";
import { BLANK_DETAILS, DEFAULT_CLAUSES, compose, money, ordinalDate, termLength, listOf, type ContractDetails } from "./contract.ts";

const ready: ContractDetails = {
  ...BLANK_DETAILS,
  entity: "DR-IME LTD",
  tradingName: "Adonia Medical Clinic",
  signatories: [{ name: "Michelle Hamilton", email: "michelle@example.com" }],
  address: "1 High Street, London, W1 1AA",
  country: "United Kingdom",
  platforms: ["YouTube", "Instagram", "TikTok"],
  termMonths: 6,
  monthlyFee: 2500,
  deliverables: [{ name: "Full long-form edit", detail: "2 episodes per month" }],
};
const titles = (d: ContractDetails) => compose(DEFAULT_CLAUSES, d, "2026-04-27").sections.map((s) => `${s.number}. ${s.title}`);
const text = (d: ContractDetails) =>
  compose(DEFAULT_CLAUSES, d, "2026-04-27")
    .sections.flatMap((s) => s.blocks)
    .map((b) => (b.kind === "p" ? b.text : b.kind === "bullets" ? b.items.join(" / ") : `[${b.name}]`))
    .join("\n");

test("formatting follows the SOP", () => {
  assert.equal(termLength(3), "three (3) months");
  assert.equal(termLength(1), "one (1) month");
  assert.equal(money(2500, "GBP"), "£2,500 GBP");
  assert.equal(money(240000, "INR"), "INR 2,40,000");
  assert.equal(ordinalDate("2026-04-27"), "27th day of April 2026");
  assert.equal(ordinalDate("2026-05-22"), "22nd day of May 2026");
  assert.equal(listOf(["YouTube", "Instagram", "TikTok"]), "YouTube, Instagram, and TikTok");
});

test("a fixed-term contract keeps termination and disputes, numbered without gaps", () => {
  assert.deepEqual(titles(ready), [
    "1. Agreement Term",
    "2. Fees & Payment Terms",
    "3. Scope of Services",
    "4. Client Obligations",
    "5. Ownership & Intellectual Property",
    "6. Termination (Break Clause)",
    "7. Dispute Resolution",
    "8. Entire Agreement",
    "9. Signatures",
  ]);
  const t = text(ready);
  assert.match(t, /UK contract law/);
  assert.match(t, /fixed term of \*\*six \(6\) months\*\*/);
  assert.doesNotMatch(t, /trial/);
  assert.deepEqual(compose(DEFAULT_CLAUSES, ready, "2026-04-27").missing, []);
});

test("a one-month trial swaps in trial terms and drops termination and disputes", () => {
  const trial = { ...ready, termMonths: 1 };
  assert.deepEqual(titles(trial).map((t) => t.slice(3)), [
    "Agreement Term",
    "Fees & Payment Terms",
    "Scope of Services",
    "Client Obligations",
    "Ownership & Intellectual Property",
    "Trial Terms & Continuation",
    "Entire Agreement",
    "Signatures",
  ]);
  const ext = { ...trial, extensionMonths: 2 };
  assert.ok(titles(ext).some((t) => t.endsWith("Trial & Extension Terms")));
  assert.match(text(ext), /extend for \*\*two \(2\) months\*\*/);
});

test("split payment halves the total", () => {
  const t = text({ ...ready, termMonths: 1, monthlyFee: 3000, currency: "USD", payment: "split" });
  assert.match(t, /50% \(\$1,500 USD\)/);
  assert.doesNotMatch(t, /in advance, upfront/);
});

test("what's missing is found from the template itself", () => {
  const { missing } = compose(DEFAULT_CLAUSES, { ...ready, monthlyFee: null, deliverables: [], country: "United States" }, "2026-04-27");
  assert.deepEqual(missing.map((m) => m.label).sort(), ["Courts", "Deliverables", "Governing law", "Monthly fee"]);
  // a clause that needs something new asks for it
  const extra = [...DEFAULT_CLAUSES, { id: "x", title: "Retainer", body: "Hours: {{RETAINER_HOURS}}" }];
  assert.deepEqual(compose(extra, ready, "2026-04-27").missing, [{ key: "RETAINER_HOURS", label: "Retainer hours" }]);
  const filled = { ...ready, extra: [{ key: "Retainer hours", value: "10" }] };
  assert.deepEqual(compose(extra, filled, "2026-04-27").missing, []);
});

test("Adobe's emails are read for the right agreement", async () => {
  const { readAdobeSubject } = await import("./contract.ts");
  const name = "Service Agreement - Demo";
  assert.deepEqual(readAdobeSubject("Service Agreement - Demo has been sent out for signature to akraj618@gmail.com", name), {
    kind: "sent",
    text: "Sent to akraj618@gmail.com",
  });
  assert.equal(readAdobeSubject("Service Agreement - Demo between Easeus Media and Abhishek is Signed and Filed!", name)?.kind, "completed");
  assert.equal(readAdobeSubject('Signature requested on "Service Agreement - Demo"', name)?.kind, "requested");
  assert.equal(readAdobeSubject("Service Agreement - Demo has been signed by Ashmit Shahi", name)?.text, "Signed by Ashmit Shahi");
  // another contract, or not about one at all
  assert.equal(readAdobeSubject("Service Agreement - Demo Studios has been sent out for signature to a@b.com", name), null);
  assert.equal(readAdobeSubject("Your account was credited", name), null);
});

test("an undeliverable email is tied to its agreement by its text", async () => {
  const { readAdobeMail } = await import("./contract.ts");
  const snippet =
    "Service Agreement - Dr Drake: Undeliverable We were unable to deliver your document to the email address akraj^18@gmail.com. Please check that this is the correct email address.";
  assert.deepEqual(readAdobeMail("Adobe Acrobat Sign Document - Undeliverable", snippet, "Service Agreement - Dr Drake"), {
    kind: "undeliverable",
    text: "Couldn't be delivered to akraj^18@gmail.com",
  });
  assert.equal(readAdobeMail("Adobe Acrobat Sign Document - Undeliverable", snippet, "Service Agreement - Demo"), null);
});
