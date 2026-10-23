import { test } from "node:test";
import assert from "node:assert/strict";
import { askNames, fallbackName, fillTemplates, findSlots } from "./leadTemplates.ts";
import { fillText, variablesIn } from "./space.ts";
import type { LeadIn } from "./leadImport.ts";

const lead = (title: string, ...openers: Record<string, string>[]): LeadIn => ({
  title,
  openers: openers.map((bodies) => ({ label: "", drafts: Object.fromEntries(Object.entries(bodies).map(([id, body]) => [id, { subject: "", body }])) })),
});
const DOCS = [
  ["Dr Kay", "lysine", "88K", "2 years"],
  ["Sophie", "fat dissolving injections", "97K", "9 months"],
  ["Dr Ross", "buccal fat removal", "2.2M", "6 years"],
  ["Dr Shah", "lip filler", "12K", "1 year"],
];
const email = ([g, video, views, age]: string[]) =>
  `Hi ${g},\n\nYour video on ${video} is still your most-watched, ${age} after you posted it. It has ${views} views.\n\nYou can check our work here: {{Link}}\n\nShould I send it over?`;
const dm = ([g, video]: string[]) => `Hi ${g}!\n\nYour ${video} video is still your most-watched.`;

// every text of every lead, before and after
const texts = (leads: LeadIn[]) => leads.flatMap((l) => (l.openers ?? []).flatMap((o) => Object.values(o.drafts).flatMap((d) => [d.subject, d.body])));

test("what differs between the leads' sentences are the blanks; what they share stays written", () => {
  const leads = DOCS.map((d) => lead(d[0], { e1: email(d), dm1: dm(d) }));
  const plan = findSlots(leads);
  const examples = plan.slots.map((s) => s.examples);
  assert.ok(examples.some((e) => e.includes("Dr Kay") && e.includes("Sophie")));
  assert.ok(examples.some((e) => e.includes("lysine") && e.includes("buccal fat removal")));
  assert.ok(examples.some((e) => e.includes("88K") && e.includes("2.2M")));
  assert.ok(examples.some((e) => e.includes("2 years") && e.includes("9 months")));
  // a blank's words either side, for Claude
  const greeting = plan.slots.find((s) => s.examples.includes("Dr Kay"))!;
  assert.equal(greeting.after.startsWith(","), true);
  assert.equal(greeting.before.endsWith("Hi"), true);

  const [out] = [fillTemplates(leads, plan, Object.fromEntries(plan.slots.map((s) => [s.id, s.examples.includes("lysine") ? "Top video" : s.examples.includes("88K") ? "Top video views" : s.examples.includes("Dr Kay") ? "Greeting name" : "Top video age"])))];
  const kay = out[0];
  assert.deepEqual(kay.vars, { "Greeting name": "Dr Kay", "Top video": "lysine", "Top video age": "2 years", "Top video views": "88K" });
  assert.equal(
    kay.openers![0].drafts.e1.body,
    "Hi {{Greeting name}},\n\nYour video on {{Top video}} is still your most-watched, {{Top video age}} after you posted it. It has {{Top video views}} views.\n\nYou can check our work here: {{Link}}\n\nShould I send it over?",
  );
  // the same thing in another message is the same blank
  assert.equal(kay.openers![0].drafts.dm1.body, "Hi {{Greeting name}}!\n\nYour {{Top video}} video is still your most-watched.");
});

test("every message comes back word for word once filled in", () => {
  const leads = DOCS.map((d) => lead(d[0], { e1: email(d), dm1: dm(d), e2: "Following up on the audit." }, { e1: email([d[0], `${d[1]} myths`, d[2], d[3]]) }));
  const plan = findSlots(leads);
  const out = fillTemplates(leads, plan, {});
  const before = texts(leads);
  const after = out.flatMap((l) => texts([l]).map((t) => fillText(t, l.vars ?? {})));
  assert.deepEqual(after, before);
  // and something did become a template
  assert.ok(texts(out).some((t) => /\{\{(?!Link)/.test(t)));
});

test("different sentence shapes are different templates", () => {
  const swing = (g: string, top: string, low: string) => `Hi ${g},\n\nYour views swing from ${top} on that one to under ${low} on recent ones.`;
  const leads = [...DOCS.map((d) => lead(d[0], { e1: email(d) })), ...DOCS.map((d, i) => lead(`${d[0]} B`, { e1: swing(d[0], d[2], String(50 + i)) }))];
  const plan = findSlots(leads);
  // the two kinds of observation never share a blank: neither's words are the other's values
  for (const s of plan.slots) assert.ok(!s.examples.some((v) => /most-watched|swing/.test(v)), s.examples.join(" | "));
  assert.ok(plan.slots.some((s) => s.examples.includes("50") && s.examples.includes("51")));
});

test("a sentence no other lead shares, and wording many leads share, stay written", () => {
  const leads = Array.from({ length: 8 }, (_, i) =>
    lead(`Lead ${i}`, { e1: `Great ${i % 2 ? "breakdown" : "video"}, it has ${10 + i}K views.${i === 0 ? " Loved the bit about the rash on your cheek." : ""}` }),
  );
  const plan = findSlots(leads);
  assert.ok(plan.slots.every((s) => !s.examples.includes("breakdown")));
  const out = fillTemplates(leads, plan, { [plan.slots[0].id]: "Views" });
  assert.equal(out[0].openers![0].drafts.e1.body, "Great video, it has {{Views}} views. Loved the bit about the rash on your cheek.");
  assert.equal(out[3].vars?.Views, "13K");
});

test("one name holds one value: a backup's other video is split off, the same one shared", () => {
  const leads = DOCS.map((d, i) => lead(d[0], { e1: email(d) }, { e1: email([d[0], i % 2 ? d[1] : `${d[1]} at home`, d[2], d[3]]) }));
  const plan = findSlots(leads);
  const out = fillTemplates(leads, plan, Object.fromEntries(plan.slots.map((s) => [s.id, s.examples.includes("Dr Kay") ? "Greeting name" : s.examples.includes("lysine") ? "Top video" : "Other"])));
  const kay = out[0];
  assert.equal(kay.vars?.["Top video"], "lysine");
  assert.equal(kay.vars?.["Top video (backup)"], "lysine at home");
  assert.match(kay.openers![1].drafts.e1.body, /Your video on \{\{Top video \(backup\)\}\} is still/);
  // the backup naming the same video uses the same variable
  const sophie = out[1];
  assert.equal(sophie.vars?.["Top video (backup)"], undefined);
  assert.match(sophie.openers![1].drafts.e1.body, /Your video on \{\{Top video\}\} is still/);
});

test("values a lead already had stay, and so does a {{Variable}} already in its messages", () => {
  const leads = DOCS.map((d, i) => ({ ...lead(d[0], { e1: email(d) }), ...(i === 0 ? { vars: { "Top video": "something else" } } : {}) }));
  const plan = findSlots(leads);
  const out = fillTemplates(leads, plan, Object.fromEntries(plan.slots.map((s) => [s.id, s.examples.includes("lysine") ? "Top video" : s.examples.includes("Dr Kay") ? "Link" : "Other"])));
  const kay = out[0];
  assert.equal(kay.vars?.["Top video"], "something else");
  assert.equal(kay.vars?.["Top video (2)"], "lysine");
  // {{Link}} is still to fill, so the greeting can't take its name
  assert.equal(kay.vars?.Link, undefined);
  assert.ok(variablesIn([kay.openers![0].drafts.e1.body]).includes("Link"));
  assert.equal(fillText(kay.openers![0].drafts.e1.body, kay.vars!), fillText(email(DOCS[0]), kay.vars!));
});

test("without Claude, a blank is named from the words beside it, never a number", () => {
  assert.equal(fallbackName({ before: "Hi", after: ",", examples: ["Dr Kay", "Sophie"] }), "Greeting name");
  assert.equal(fallbackName({ before: "Thanks for connecting,", after: ".", examples: ["Dr Kay", "Sophie"] }), "Greeting name");
  assert.equal(fallbackName({ before: "Hi Dr", after: ", watched your … video.", examples: ["Kay", "Lee"] }), "Last name");
  assert.equal(fallbackName({ before: "Your lysine video has", after: "views.", examples: ["88K", "1.2M"] }), "Views");
  assert.equal(fallbackName({ before: "Your video on", after: "is still your most-watched,", examples: ["lysine", "buccal fat removal"] }), "Video");
  assert.equal(fallbackName({ before: "", after: "", examples: ["12", "40"] }), "Number");
  assert.equal(fallbackName({ before: "", after: "", examples: ["a", "b"] }), "Detail");
});

test("what Claude is asked: each blank once, its names chosen from the given blanks only", () => {
  const ask = askNames([{ id: "s1", before: "Hi", after: ",", examples: ["Dr Kay", "Dr Lee"] }], ["Greeting name"]);
  assert.match(ask.prompt, /"blank":"s1","in":"Hi ___ ,"/);
  assert.match(ask.system, /Greeting name\./);
  assert.deepEqual((ask.schema.properties.names.items.properties.blank as { enum: string[] }).enum, ["s1"]);
});
