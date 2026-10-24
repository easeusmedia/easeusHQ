import { test } from "node:test";
import assert from "node:assert/strict";
import { askNames, boardNames, fallbackName, fillTemplates, findSlots, misplacedVars } from "./leadTemplates.ts";
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
  assert.equal(fallbackName({ before: "Your lysine video has", after: "views.", examples: ["88K", "1.2M"] }), "Views");
  // a number is named by the word right after it, not one further on
  assert.equal(fallbackName({ before: "Your views swing from", after: "on that one to under … on recent ones.", examples: ["88K", "2.2M"] }), "Swing");
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

const names = (leads: LeadIn[]) => leads.map((l) => Object.keys(l.vars ?? {}).sort());
const filled = (l: LeadIn) => texts([l]).map((t) => fillText(t, l.vars ?? {}));

test("a title stays with its name, so the greeting is the board's Greeting name", () => {
  const leads = ["Kay", "Lee", "Moe", "Ng"].map((n, i) => lead(`Dr ${n}`, { e1: `Hi Dr${i % 2 ? "." : ""} ${n},\n\nWatched your video on ${DOCS[i][1]}.` }));
  const out = fillTemplates(leads, findSlots(leads), {});
  assert.deepEqual(out[0].vars, { "Greeting name": "Dr Kay", Video: "lysine" });
  assert.equal(out[1].vars?.["Greeting name"], "Dr. Lee");
  assert.match(out[0].openers![0].drafts.e1.body, /^Hi \{\{Greeting name\}\},/);
});

test("an s' is a name's possessive, and 'Your' or 'Hi there' name nobody", () => {
  const g = ["Dr Kay", "Dr Chris", "Dr Moss", "Dr Lee", "there"];
  const leads = g.map((n) => lead(n, { e1: `Hi ${n},\n\n${n === "there" ? "Your" : n.endsWith("s") ? `${n}'` : `${n}'s`} channel audit is ready.` }));
  const out = fillTemplates(leads, findSlots(leads), {});
  assert.deepEqual(names(out), [["Greeting name"], ["Greeting name"], ["Greeting name"], ["Greeting name"], []]);
  assert.equal(out[1].openers![0].drafts.e1.body, "Hi {{Greeting name}},\n\n{{Greeting name}}' channel audit is ready.");
  // nobody's name stays written, so Fill in still asks for the greeting
  assert.equal(out[4].openers![0].drafts.e1.body, "Hi there,\n\nYour channel audit is ready.");
  assert.deepEqual(filled(out[4]), texts([leads[4]]));
});

test("a settled sentence takes a long video title as its blank", () => {
  const title = "why some men can't get a sharp jawline at all";
  const leads = [...DOCS.map((d) => d[1]), title].map((t, i) => lead(`L${i}`, { li: `Hi Dr ${"ABCDE"[i]}, watched your video on ${t}. Should I send it over?` }));
  const out = fillTemplates(leads, findSlots(leads), {});
  assert.equal(out[4].openers![0].drafts.li.body, "Hi {{Greeting name}}, watched your video on {{Video}}. Should I send it over?");
  assert.equal(out[4].vars?.Video, title);
});

test("words glued onto another blank's value are split off: the age apart, shared wording written", () => {
  const ages = ["2 weeks", "3 weeks", "1 month", "2 months"];
  const leads = DOCS.map((d, i) =>
    lead(d[0], { e1: email(d), dm1: `Watched your video on ${d[1]}${i < 3 ? ` from ${ages[i]} ago` : ""}.`, e2: `You've posted ${10 + i} videos since.`, e3: `Nothing in the ${10 + i} videos since came close.` }),
  );
  const extra = ["Dr Pak", "Dr Roe"].map((g, i) => lead(g, { dm1: `Watched your video on ${["scars", "moles"][i]}.`, e3: `Nothing in the ${["big", "new"][i]} uploads came close.` }));
  const all = [...leads, ...extra];
  const out = fillTemplates(all, findSlots(all), {});
  const kay = out[0];
  const vals = Object.values(kay.vars ?? {});
  assert.ok(!vals.some((v) => /lysine from|videos since/.test(v)), JSON.stringify(kay.vars));
  assert.ok(vals.includes("2 weeks"), JSON.stringify(kay.vars));
  assert.match(kay.openers![0].drafts.dm1.body, /^Watched your video on \{\{[^}]+\}\} from \{\{[^}]+\}\} ago\.$/);
  assert.match(kay.openers![0].drafts.e3.body, /^Nothing in the \{\{[^}]+\}\} videos since came close\.$/);
  out.forEach((l, i) => assert.deepEqual(filled(l), texts([all[i]])));
});

test("two slots given one name that some lead holds apart get two names, the same on every lead", () => {
  const leads = DOCS.map((d, i) => lead(d[0], { e1: `Most of your videos sit around ${100 + i} views.`, e2: `Your top video has ${d[2]} views.` }));
  // a lead with only the top video: it used to take the name the others' typical views had
  leads.push(lead("Dr Top", { e2: "Your top video has 5M views." }));
  const plan = findSlots(leads);
  const out = fillTemplates(leads, plan, Object.fromEntries(plan.slots.map((s) => [s.id, "Typical views"])));
  const nameOf = (re: RegExp) => new Set(out.flatMap((l) => Object.entries(l.vars ?? {}).flatMap(([n, v]) => (re.test(v) ? [n] : []))));
  // the slot most leads have keeps the name, the other is "Typical views 2", on every lead
  assert.deepEqual([...nameOf(/[KM]$/)], ["Typical views"]);
  assert.deepEqual([...nameOf(/^10\d$/)], ["Typical views 2"]);
  // slots no lead holds apart keep the one name ("Hi ___," in two messages for different leads)
  const greet = [lead("A", { e1: "Hi Dr A,\n\nOne." }), lead("B", { e1: "Hi Dr B,\n\nOne." }), lead("C", { e2: "Thanks, Dr C. Two." }), lead("D", { e2: "Thanks, Dr D. Two." })];
  const p2 = findSlots(greet);
  const g2 = fillTemplates(greet, p2, Object.fromEntries(p2.slots.map((s) => [s.id, "Greeting name"])));
  assert.deepEqual(names(g2), [["Greeting name"], ["Greeting name"], ["Greeting name"], ["Greeting name"]]);
});

test("a blank's words for Claude are its own sentence's, never the sentence before, which is one lead's", () => {
  const leads = DOCS.map((d) => lead(d[0], { e1: `Hi ${d[0]}! It's at ${d[2]} views so far.` }));
  const plan = findSlots(leads);
  const views = plan.slots.find((s) => s.examples.includes("88K"))!;
  assert.equal(views.before, "It's at");
  assert.equal(views.after, "views so far.");
});

test("each lead's first person's first name is {{Name}}, so every person on it is greeted by their own", () => {
  const leads = ["Rachel Rhee", "Michelle Maiman", "Carter Crowley"].map((full, i) => ({
    ...lead(`Show ${i}`, { e3: `${full.split(" ")[0]},\n\nOne thing from the audit.`, e4: `Thanks for connecting, ${full.split(" ")[0]}.\n\nQuick one.` }),
    contacts: [{ name: full }],
  }));
  // Claude called it something else; it's still the board's {{Name}}
  const plan = findSlots(leads);
  const out = fillTemplates(leads, plan, Object.fromEntries(plan.slots.map((s) => [s.id, "Greeting name"])));
  assert.equal(out[1].openers![0].drafts.e4.body, "Thanks for connecting, {{Name}}.\n\nQuick one.");
  // a line that's only the name too
  assert.equal(out[1].openers![0].drafts.e3.body, "{{Name}},\n\nOne thing from the audit.");
  assert.equal(out[1].vars?.Name, "Michelle");
});

test("a blank inside one of the lead's own values is that value, its shared last word and all", () => {
  const shows = ["You Are Here Podcast", "Commission and Cash Flow Podcast", "Rock Solid Podcast"];
  const leads = shows.map((show, i) => ({ ...lead(show, { e1: `Emailed you about ${show} - probably landed somewhere.` }), vars: { Podcast: show }, contacts: [{ name: `P${i}` }] }));
  const out = fillTemplates(leads, findSlots(leads), {});
  assert.deepEqual(
    out.map((l) => l.openers![0].drafts.e1.body),
    shows.map(() => "Emailed you about {{Podcast}} - probably landed somewhere."),
  );
});

test("a blank where the board's own wording has a variable is that variable, without asking", () => {
  const gaps = ["no chapters", "no trailer", "no clips"];
  const leads = gaps.map((g, i) => lead(`Show ${i}`, { li: `Watched your episode.\nNoticed, ${g}\nShould I send it over?` }));
  const plan = findSlots(leads);
  const board = [{ id: "li", subject: "", body: "Watched your episode.\nNoticed, {{Short gap}}\nShould I send it over?" }];
  const names = boardNames(plan, board);
  assert.deepEqual(Object.values(names), ["Short gap"]);
  assert.deepEqual(
    fillTemplates(leads, plan, names).map((l) => l.vars),
    gaps.map((g) => ({ "Short gap": g })),
  );
  // a board message without that variable there names nothing, nor does a variable a column of the file fills
  assert.deepEqual(boardNames(plan, [{ id: "li", subject: "", body: "Noticed, {{Finding}} and more, {{Reason}}" }]), {});
  assert.deepEqual(boardNames(plan, board, ["Short gap"]), {});
});

test("someone on the lead named in a blank stays written; little words and half a quote are no blank", () => {
  const hosts = [
    ["Carter", "Michelle"],
    ["Garrett", "Dana"],
    ["Charlie", "Andrew"],
  ];
  const leads = hosts.map(([other, first], i) => ({ ...lead(`Show ${i}`, { e1: `Hey {{Name}}, loved your episode with ${other}.` }), contacts: [{ name: `${first} X` }, { name: `${other} Y` }] }));
  const out = fillTemplates(leads, findSlots(leads), {});
  assert.deepEqual(
    out.map((l) => l.openers![0].drafts.e1.body),
    hosts.map(([other]) => `Hey {{Name}}, loved your episode with ${other}.`),
  );
  const said = ["the", "Kate's", "Ben's"].map((w, i) => lead(`L${i}`, { e1: `Watched ${w} episode on growth.` }));
  const plan = findSlots(said);
  assert.ok(plan.slots.every((s) => !s.examples.includes("the")));
  const quoted = ['"Rich But Broke?" episode with Ted', '"Second Act" episode with Ana', '"Deep Work" episode with Lo'].map((t, i) => lead(`Q${i}`, { e1: `Watched your ${t} - love it.` }));
  assert.ok(findSlots(quoted).slots.every((s) => s.examples.every((v) => (v.match(/"/g) ?? []).length % 2 === 0)));
});

test("a column on a variable that the leads' own messages have other words in the place of isn't that variable", () => {
  const board = [{ id: "li", subject: "", body: "Hey {{Name}}, Watched your {{Guest}} episode.\nNoticed, {{Short gap}}\nShould I send it over?" }];
  const shows = [
    ["house hacking", "Kate Beale", "recent episodes sit around 300 views"],
    ["vendor deals", "Ben Ortiz", "no clips on the channel"],
    ["first homes", "Ana Diaz", "the titles say nothing"],
  ];
  const leads = shows.map(([topic, guest, gap], i) => ({ ...lead(`Show ${i}`, { li: `Hey {{Name}}, Watched your ${guest} episode.\nNoticed, ${gap}\nShould I send it over?` }), vars: { "Short gap": topic, Guest: guest } }));
  assert.deepEqual(misplacedVars(leads, board), ["Short gap"]);
});
