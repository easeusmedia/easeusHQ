import { test } from "node:test";
import assert from "node:assert/strict";
import { autoMap, buildLeads, columnsOf, decode, flatten, halves, jsonFileRows, oneEach, postLink, samePeople, slices, htmlScriptRows, jsonRows, matchOption, countryName, parseCsv, partsOf, placeExtracted, tableRows, targetsOf, textRows } from "./leadImport.ts";
import type { FieldData, MessageData } from "./space.ts";

const tags = (...names: string[]) => names.map((name, i) => ({ id: `o${i + 1}`, name, color: "blue" }));
const field = (id: string, name: string, kind: FieldData["kind"], options = tags(), required = false): FieldData => ({ id, name, kind, onCard: false, required, options });
const message = (id: string, name: string, channel: string, body: string, subject = ""): MessageData => ({ id, stageId: "s1", name, channel, subject, body, note: "" });
const board = {
  fields: [
    field("contacts", "Contacts", "contacts", tags(), true),
    field("links", "Links", "links"),
    field("subs", "Subscribers", "text"),
    field("opener", "Opener", "select", tags("D1 · Old hit still on top", "D2 · View swing")),
    field("country", "Country", "select", tags("USA", "UK", "UAE")),
    field("check", "To check", "multi", tags("Find first name", "Check description")),
  ],
  messages: [message("m1", "Email 1", "email", "Hi {{Greeting name}}, {{Observation}}", "{{Subject}}"), message("m2", "LinkedIn connection note", "linkedin", "Hi {{Greeting name}}"), message("m3", "Email 2", "email", "Following up")],
  leads: [{ title: "Already Here " }],
};

test("CSV: quoted commas, quotes, line breaks and a BOM", () => {
  const csv = '﻿Name,Notes,Email\r\n"Doe, Jane","Said ""yes""\nthen left",jane@x.com\r\nSam,,sam@x.com\n';
  assert.deepEqual(parseCsv(csv), [
    ["Name", "Notes", "Email"],
    ["Doe, Jane", 'Said "yes"\nthen left', "jane@x.com"],
    ["Sam", "", "sam@x.com"],
  ]);
});

test("CSV: the delimiter is guessed from the first line, a tab for TSV", () => {
  assert.deepEqual(parseCsv("a;b\n1;2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
  assert.deepEqual(parseCsv("a,b\t c\n1,2\t3", "\t"), [
    ["a,b", " c"],
    ["1,2", "3"],
  ]);
});

test("a grid's rows by its headings: blanks named, repeats numbered, empty lines skipped", () => {
  assert.deepEqual(tableRows([["Email", "", "Email"], ["", "", ""], ["a@x.com", "x", "b@x.com"]]), [{ Email: "a@x.com", "Column 2": "x", "Email 2": "b@x.com" }]);
});

test("JSON: the longest list of objects, wherever it is, but not one inside the records", () => {
  assert.deepEqual(jsonRows({ meta: { tags: [{ a: 1 }] }, data: { rows: [{ n: "A" }, { n: "B" }] } }), [{ n: "A" }, { n: "B" }]);
  assert.deepEqual(jsonRows({ just: "an object" }), []);
  const eps = [1, 2, 3, 4, 5].map((ep) => ({ ep }));
  assert.deepEqual(
    jsonRows([{ title: "A", episodes: eps }, { title: "B" }, { title: "C" }]).map((r) => r.title),
    ["A", "B", "C"],
  );
  assert.deepEqual(jsonRows([{ title: "Pod", contacts: [{ name: "a" }, { name: "b" }] }]), [{ title: "Pod", contacts: [{ name: "a" }, { name: "b" }] }]);
});

test("HTML: rows from its JSON blocks, read from the string alone", () => {
  const html = `<html><head><script type="application/ld+json">{"@type":"Organization"}</script></head>
<body><script id="data" type="application/json">[{"g":"Dr K","docs":[{"n":"Dr. K"}]},{"g":"Dr S","docs":[]}]</script>
<script>var x = [{"not":"data"},{"a":1},{"b":2}]</script></body></html>`;
  assert.deepEqual(htmlScriptRows(html), [
    { g: "Dr K", docs: [{ n: "Dr. K" }] },
    { g: "Dr S", docs: [] },
  ]);
  assert.deepEqual(htmlScriptRows("<table><tr><td>no blocks</td></tr></table>"), []);
  // a page's search details aren't its leads
  assert.deepEqual(htmlScriptRows(`<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"WebSite"},{"@type":"Organization"}]}</script>`), []);
});

test("common headings place themselves", () => {
  const rows = tableRows(
    parseCsv(
      "Podcast,Name,Email,Instagram,LinkedIn,Country,Opener,{{Greeting name}},Email 1 subject,Notes\nGrowth Show,Jane Doe,jane@x.com; j@y.com,@growth,https://linkedin.com/in/jane,USA,D1,Jane,Your show,Met once",
    ),
  );
  assert.deepEqual(autoMap(columnsOf(rows), board), {
    Podcast: "title",
    Name: "contact.name",
    Email: "contact.email",
    Instagram: "contact.instagram",
    LinkedIn: "contact.linkedin",
    Country: "field:country",
    Opener: "field:opener",
    "{{Greeting name}}": "var:Greeting name",
    "Email 1 subject": "message:m1:subject",
  });
});

test("a heading only counts when the values fit it, else they tell", () => {
  const cols = columnsOf([{ li: "Hi Dr K, watched your video", em: ["k@x.com"], url: "https://youtube.com/@k", t: "D2", board: "UK" }]);
  assert.deepEqual(autoMap(cols, board), { "em[]": "contact.email", url: "link", t: "field:opener", board: "field:country" });
});

test("people and links only go where the board keeps them", () => {
  const bare = { fields: [field("subs", "Subscribers", "text")], messages: [] };
  const values = targetsOf(bare).map((t) => t.value);
  assert.ok(!values.includes("link") && !values.some((v) => v.startsWith("contact.")));
  assert.deepEqual(autoMap(columnsOf([{ Company: "Clinic", Name: "Jane", Email: "j@x.com", URL: "https://x.com", Subscribers: "12k" }]), bare), { Company: "title", Subscribers: "field:subs" });
});

test("what Claude read out is placed by its exact names", () => {
  const b = {
    fields: [field("contacts", "Contacts", "contacts"), field("links", "Links", "links"), field("avg", "Avg. views", "text"), field("web", "Website", "text")],
    messages: [message("m1", "Email 1", "email", "Hi {{Dr. Name}}")],
  };
  const rows = [{ title: "Jane Clinic", contacts: [{ name: "Jane", website: "jane.me" }], links: ["https://jane.clinic"], "Avg. views": "12k", Website: "janeclinic.com", "{{Dr. Name}}": "Dr Jane" }];
  assert.deepEqual(placeExtracted(columnsOf(rows), b), {
    title: "title",
    "contacts[].name": "contact.name",
    "contacts[].website": "contact.website",
    "links[]": "link",
    "Avg. views": "field:avg",
    Website: "field:web",
    "{{Dr. Name}}": "var:Dr. Name",
  });
});

test("a value is a tag by its name or the start of it", () => {
  const opts = tags("D1 · Old hit still on top", "D10 · Other", "UK");
  assert.equal(matchOption(opts, "D1")?.name, "D1 · Old hit still on top");
  assert.equal(matchOption(opts, "d1 · old hit still on top")?.id, "o1");
  assert.equal(matchOption(opts, " uk ")?.id, "o3");
  assert.equal(matchOption(opts, "D"), undefined);
  assert.equal(matchOption(opts, ""), undefined);
});

test("the leads add_leads gets: people per doctor, main and backup openers, tags by id", () => {
  const rows = [
    {
      cn: "PCH MedSpa",
      g: "Dr K",
      t: "D1",
      subs: 20400,
      url: "https://youtube.com/@pch",
      docs: [
        { n: "Dr. K", em: ["k@pch.com"], li: "https://linkedin.com/in/k" },
        { n: "Ann", em: [] },
      ],
      check: "Find first name, Unknown",
      m: { s: "your lysine video", email: "Hi Dr K, main", li: "Hi, main note" },
      alt: [{ s: "your other video", email: "Hi Dr K, backup" }],
      seq: { e2: "Following up, Dr K" },
    },
    // again in the file (one more person on it), on the board already, no people, no name
    { cn: "PCH MedSpa", docs: [{ n: "Again" }] },
    { cn: "already here", docs: [{ n: "X" }] },
    { cn: "Nobody", country: "France" },
    { g: "No name at all" },
  ];
  const mapping = {
    cn: "title",
    g: "var:Greeting name",
    t: "field:opener",
    subs: "field:subs",
    url: "link",
    "docs[].n": "contact.name",
    "docs[].em[]": "contact.email",
    "docs[].li": "contact.linkedin",
    check: "field:check",
    country: "field:country",
    "m.s": "message:m1:subject",
    "m.email": "message:m1:body",
    "m.li": "message:m2:body",
    "alt[].s": "message:m1:subject",
    "alt[].email": "message:m1:body",
    "seq.e2": "message:m3:body",
  };
  const p = buildLeads(rows, mapping, board);
  assert.deepEqual(p.leads, [
    {
      title: "PCH MedSpa",
      values: { subs: "20400", opener: ["o1"], check: ["o1"] },
      contacts: [{ name: "Dr. K", email: ["k@pch.com"], linkedin: ["https://linkedin.com/in/k"] }, { name: "Ann" }, { name: "Again" }],
      links: [{ label: "", url: "https://youtube.com/@pch" }],
      vars: { "Greeting name": "Dr K" },
      openers: [
        {
          label: "",
          drafts: { m1: { subject: "your lysine video", body: "Hi Dr K, main" }, m2: { subject: "", body: "Hi, main note" }, m3: { subject: "", body: "Following up, Dr K" } },
        },
        {
          label: "",
          drafts: { m1: { subject: "your other video", body: "Hi Dr K, backup" }, m2: { subject: "", body: "Hi, main note" }, m3: { subject: "", body: "Following up, Dr K" } },
        },
      ],
    },
  ]);
  assert.equal(p.existing, 1);
  assert.equal(p.missing, 1);
  assert.equal(p.unnamed, 1);
  // France, a real country, goes on by name for importLeads to add as a tag
  assert.deepEqual(p.unmatched, ["To check: Unknown"]);
});

test("without a name column, the people's names name the lead", () => {
  const p = buildLeads([{ Name: "Jane Doe", Email: "jane@x.com" }], { Name: "contact.name", Email: "contact.email" }, board);
  assert.deepEqual(p.leads, [{ title: "Jane Doe", contacts: [{ name: "Jane Doe", email: ["jane@x.com"] }] }]);
});

test("Claude's parts: about 6,000 characters or two pictures, halved when an answer runs out", () => {
  const line = "x".repeat(5000);
  const parts = partsOf({ text: [line, line, line].join("\n"), images: ["a", "b", "c", "d", "e"] });
  assert.deepEqual(
    parts.map((p) => (p.text ? p.text.length : p.images!.length)),
    [5001, 5001, 5001, 2, 2, 1],
  );
  // a line with no breaks (a minified page) is cut between words, none lost
  const words = Array.from({ length: 3000 }, (_, i) => `lead${i}`).join(" ");
  const cut = partsOf({ text: words, images: [] });
  assert.ok(cut.length > 1 && cut.every((p) => p.text!.length <= 6_002));
  assert.equal(cut.map((p) => p.text!.trim()).join(" "), words);
  assert.deepEqual(
    partsOf({ text: "x".repeat(13_000), images: [] }).map((p) => p.text!.length),
    [6001, 6001, 1001],
  );
  assert.deepEqual(halves({ images: ["a", "b", "c"] }), [{ images: ["a", "b"] }, { images: ["c"] }]);
  assert.deepEqual(halves({ text: "one\ntwo\nthree" }), [{ text: "one\ntwo" }, { text: "three" }]);
  // a page with no breaks is cut between words
  assert.deepEqual(halves({ text: "no breaks" }), [{ text: "no" }, { text: "breaks" }]);
  assert.equal(halves({ text: "oneword" }), null);
});

test("each place takes one column; a person's details and links can take several", () => {
  const cols = ["m.a", "m.b", "email", "work email", "url", "site"].map((path) => ({ path, values: [] }));
  const mapping = { "m.a": "var:Observation", "m.b": "var:Observation", email: "contact.email", "work email": "contact.email", url: "link", site: "link" };
  assert.deepEqual(oneEach(cols, mapping), { ...mapping, "m.b": "ignore" });
});

test("one name per person, links that are addresses, and who can't be reached yet", () => {
  const board = { fields: [{ id: "c", name: "Contacts", kind: "contacts", required: true, onCard: false, options: [] }, { id: "l", name: "Links", kind: "links", required: false, onCard: false, options: [] }], messages: [], leads: [] };
  const cols = ["g", "docs[].n", "docs[].l", "url"].map((path) => ({ path, values: [] }));
  const mapping = oneEach(cols, { g: "contact.name", "docs[].n": "contact.name", "docs[].l": "link", url: "link" });
  const p = buildLeads([{ g: "Dr Karandish", docs: [{ n: "Dr. K | PCH MedSpa", l: "YT 1" }], url: "https://www.youtube.com/@PCHMedSpa" }], mapping, board as never);
  assert.equal(p.leads[0].contacts?.[0].name, "Dr Karandish");
  assert.deepEqual(p.leads[0].links?.map((l) => l.url), ["https://www.youtube.com/@PCHMedSpa"]);
  assert.deepEqual(p.unreachable, [p.leads[0].title]);
});

test("one person written twice is one contact, with the fullest name and every handle", () => {
  assert.deepEqual(samePeople([{ name: "Sophie Shotter" }, { name: "Dr Sophie Shotter", email: ["hello@drsophieshotter.com"] }]), [{ name: "Dr Sophie Shotter", email: ["hello@drsophieshotter.com"] }]);
  assert.equal(samePeople([{ name: "𝐁𝐞𝐧 𝐓𝐚𝐥𝐞𝐢, 𝐌𝐃" }, { name: "Ben Talei, MD Facial plastic Surgeon" }]).length, 1);
  // a handle in common, whatever the names
  assert.equal(samePeople([{ name: "Doctor Mesa", instagram: ["https://instagram.com/doctor.mesa/"] }, { name: "John Mesa", instagram: ["https://www.instagram.com/doctor.mesa"] }]).length, 1);
  // two people at one clinic stay two
  assert.equal(samePeople([{ name: "Dr. Ross Kopelman" }, { name: "Dr. Joel Kopelman" }]).length, 2);
  const cols = ["g", "docs[].n"].map((path) => ({ path, values: [] }));
  const board = { fields: [{ id: "c", name: "Contacts", kind: "contacts", required: true, onCard: false, options: [] }], messages: [], leads: [] };
  const p = buildLeads([{ g: "Dr Shotter", docs: [{ n: "Sophie Shotter" }, { n: "Dr Sophie Shotter" }] }], oneEach(cols, { g: "contact.name", "docs[].n": "contact.name" }), board as never);
  assert.deepEqual(p.leads[0].contacts, [{ name: "Dr Sophie Shotter" }]);
});

test("a practice or channel beside the doctor on one lead is the doctor's page", () => {
  assert.deepEqual(samePeople([{ name: "Timothy Katzen" }, { name: "Dr. Katzen Plastic Surgery", instagram: ["@katzen"] }]), [{ name: "Timothy Katzen", instagram: ["@katzen"] }]);
  assert.deepEqual(samePeople([{ name: "MYAutoimmuneMD" }, { name: "Dr. Micah Yu" }]).map((c) => c.name), ["Dr. Micah Yu"]);
  // two practices, no doctor named: both stay
  assert.equal(samePeople([{ name: "Savalia Plastic Surgery" }, { name: "Colorado Plastic Surgery Center - DenverBodyDoc" }]).length, 2);
});

test("a message keeps its main column and its backups' column", () => {
  const cols = ["m.email", "alt[].email", "m.email2"].map((path) => ({ path, values: [] }));
  assert.deepEqual(oneEach(cols, { "m.email": "message:e1:body", "alt[].email": "message:e1:body", "m.email2": "message:e1:body" }), { "m.email": "message:e1:body", "alt[].email": "message:e1:body", "m.email2": "ignore" });
});

test("a reel's or a video's address is a link, not the person's handle", () => {
  assert.equal(postLink("https://www.instagram.com/reel/DbcLmdege-h/"), true);
  assert.equal(postLink("https://www.instagram.com/avanceplasticsurgery"), false);
  assert.equal(postLink("https://www.youtube.com/watch?v=x"), true);
  assert.equal(postLink("https://www.linkedin.com/in/erezdayan/"), false);
  const board = { fields: [{ id: "c", name: "Contacts", kind: "contacts", required: true, onCard: false, options: [] }, { id: "l", name: "Links", kind: "links", required: false, onCard: false, options: [] }], messages: [], leads: [] };
  const cols = [{ path: "reel", values: ["https://www.instagram.com/reel/DbcLmdege-h/"] }];
  assert.notEqual(autoMap(cols, board as never).reel, "contact.instagram");
  const p = buildLeads([{ cn: "Avance", ig: ["https://www.instagram.com/avanceplasticsurgery", "https://www.instagram.com/reel/DbcLmdege-h/"] }], { cn: "title", "ig[]": "contact.instagram" }, board as never);
  assert.deepEqual(p.leads[0].contacts?.[0].instagram, ["https://www.instagram.com/avanceplasticsurgery"]);
});

// ---- what a file's columns hold, however it's laid out ----

const people = { fields: [field("c", "Contacts", "contacts", tags(), true), field("l", "Links", "links")], messages: [], leads: [] };
// a CSV through what the dialog does without Claude: code's placements, one column per place, the leads
const leadsOf = (csv: string, b: typeof people | typeof board = people) => {
  const rows = tableRows(parseCsv(csv));
  const cols = columnsOf(rows);
  return buildLeads(rows, oneEach(cols, autoMap(cols, b)), b);
};

test("an Email 1 column of addresses is the person's email, not the Email 1 message", () => {
  const cols = columnsOf(tableRows(parseCsv("Clinic,Email 1,Email 2,Email,Email\nGlow,jane@glow.com,info@glow.com,a@glow.com,b@glow.com")));
  assert.deepEqual(autoMap(cols, board), { Clinic: "title", "Email 1": "contact.email", "Email 2": "contact.email", Email: "contact.email", "Email 3": "contact.email" });
  assert.equal(autoMap(columnsOf([{ "Email 1": "Hi Jane, loved the video" }]), board)["Email 1"], "message:m1:body");
});

test("a job title beside a company is the person's role; alone, it names the lead", () => {
  const apollo = autoMap(columnsOf([{ "First Name": "Jane", "Last Name": "Doe", Title: "Plastic Surgeon", Company: "Glow Clinic" }]), people);
  assert.equal(apollo.Title, "contact.role");
  assert.equal(apollo.Company, "title");
  assert.equal(autoMap(columnsOf([{ Title: "The Skin Show", Host: "Jane" }]), people).Title, "title");
  assert.deepEqual(leadsOf("Title,Company,Email\nDermatologist,Glow Clinic,j@glow.com\nDermatologist,Ritz Derm,r@ritz.com").leads.map((l) => l.title), ["Glow Clinic", "Ritz Derm"]);
});

test("first, middle and last names are one name", () => {
  const p = leadsOf("First Name,Last Name,Email\nJane,Garcia-Lopez,j@x.com");
  assert.deepEqual(p.leads[0].contacts, [{ email: ["j@x.com"], name: "Jane Garcia-Lopez" }]);
  // a full name that says more still wins
  assert.equal(leadsOf("Full name,First,Last,Email\nDr. Jane Doe,Jane,Doe,j@x.com").leads[0].contacts?.[0].name, "Dr. Jane Doe");
});

test("one row per person at a clinic is one lead with each of them, not duplicates", () => {
  const p = leadsOf("Clinic,Name,Email\nGlow Clinic,Dr Jane Doe,\nGlow Clinic,Sam Lee,sam@glow.com\nRitz,Ross,ross@ritz.com");
  assert.equal(p.duplicates.length, 0);
  assert.deepEqual(p.leads[0].contacts?.map((c) => c.name), ["Dr Jane Doe", "Sam Lee"]);
  // a later row brings the email, so the lead can be reached
  assert.deepEqual(p.unreachable, []);
});

test("a count is never a handle: 'YouTube Subscribers' is the Subscribers property, 'Instagram Followers' no Instagram", () => {
  const m = autoMap(columnsOf([{ "YouTube Subscribers": "20.4K", "Instagram Followers": "12K", "LinkedIn Connections": "500+", Subs: "1.2M" }]), board);
  assert.equal(m["YouTube Subscribers"], "field:subs");
  assert.equal(m["Instagram Followers"], undefined);
  assert.equal(m["LinkedIn Connections"], undefined);
});

test("cells that only say there's nothing, and addresses written with words around them", () => {
  assert.deepEqual(flatten({ a: "N/A", b: "-", c: "#N/A", d: "none", e: "x", f: "TBD" }), { e: ["x"] });
  const p = leadsOf("Clinic,Email,Instagram\nA,Jane Doe <jane@a.com>,-\nB,mailto:info@b.com?subject=Hi,n/a\nC,c@c.com / d@c.com,\nD,raj [at] facemd [dot] com,\nE,info@e.com (office),@e1 @e2");
  assert.deepEqual(
    p.leads.map((l) => l.contacts?.[0]),
    [{ email: ["jane@a.com"] }, { email: ["info@b.com"] }, { email: ["c@c.com", "d@c.com"] }, { email: ["raj@facemd.com"] }, { email: ["info@e.com"], instagram: ["@e1", "@e2"] }],
  );
  assert.deepEqual(p.unreachable, []);
});

test("text in UTF-16 or Windows-1252 reads as written", () => {
  assert.equal(decode(new Uint8Array([0xff, 0xfe, 0x4a, 0, 0x6f, 0, 0x73, 0, 0xe9, 0])), "José");
  assert.equal(decode(new Uint8Array([0xfe, 0xff, 0, 0x4a, 0, 0xe9])), "Jé");
  assert.equal(decode(new Uint8Array([0x4e, 0xfa, 0xf1, 0x65, 0x7a])), "Núñez");
  assert.equal(decode(new TextEncoder().encode("Zoë")), "Zoë");
});

test("the headings are found below a title line, sep= or notes; repeats, totals and Notion links are handled", () => {
  assert.deepEqual(tableRows(parseCsv("sep=;\nName;Email\nJane;j@x.com")), [{ Name: "Jane", Email: "j@x.com" }]);
  assert.deepEqual(tableRows(parseCsv("Dream 300 leads - October\n\nName,Email\nJane,j@x.com")), [{ Name: "Jane", Email: "j@x.com" }]);
  // a merged banner across the sheet says one thing, so it isn't the headings
  assert.deepEqual(tableRows([["Leads", "Leads"], ["Name", "Email"], ["Jane", "j@x.com"]]), [{ Name: "Jane", Email: "j@x.com" }]);
  assert.deepEqual(tableRows(parseCsv("Name,Subs\nJane,10\nname,subs\nSam,20\nTotal,,30")), [
    { Name: "Jane", Subs: "10" },
    { Name: "Sam", Subs: "20" },
  ]);
  // no headings at all: the first row is a lead
  assert.deepEqual(tableRows(parseCsv("Glow,jane@glow.com\nRitz,ross@ritz.com")), [
    { "Column 1": "Glow", "Column 2": "jane@glow.com" },
    { "Column 1": "Ritz", "Column 2": "ross@ritz.com" },
  ]);
  assert.deepEqual(tableRows(parseCsv("Name,Clinic\nJane,Glow Clinic (https://www.notion.so/Glow-abc?pvs=21)")), [{ Name: "Jane", Clinic: "Glow Clinic", "Clinic link": ["https://www.notion.so/Glow-abc?pvs=21"] }]);
  const p = leadsOf("Name,Clinic,Email\nJane,Glow Clinic (https://www.notion.so/Glow-abc?pvs=21),j@x.com");
  assert.deepEqual([p.leads[0].title, p.leads[0].links], ["Glow Clinic", [{ label: "", url: "https://www.notion.so/Glow-abc?pvs=21" }]]);
});

test("CSV typed by hand: a space before a quote, an unquoted comma keeps its last cell", () => {
  assert.deepEqual(parseCsv('a, "Khan, Ahmed",x'), [["a", "Khan, Ahmed", "x"]]);
  assert.deepEqual(tableRows(parseCsv("Clinic,Name,Email\nGlow,Dr Jane, MD,jane@glow.com"))[0]["Column 4"], "jane@glow.com");
});

test("JSON kept by id, as a grid of cells, or one record a line", () => {
  assert.deepEqual(jsonRows({ leads: { "-N1": { clinic: "Glow" }, "-N2": { clinic: "Ritz", email: "r@x.com" } } }), [{ clinic: "Glow" }, { clinic: "Ritz", email: "r@x.com" }]);
  assert.deepEqual(jsonRows({ values: [["Clinic", "Email"], ["Glow", "j@x.com"]] }), [{ Clinic: "Glow", Email: "j@x.com" }]);
  // one record's parts, or columns by row number, aren't records
  assert.deepEqual(jsonRows({ company: { name: "Glow", site: "g.com" }, contact: { name: "Jane", email: "j@x.com" } }), []);
  assert.deepEqual(jsonRows({ clinic: { 0: "Glow", 1: "Ritz" }, email: { 0: "a@x.com", 1: "b@x.com" } }), []);
  assert.deepEqual(jsonFileRows('{"clinic":"Glow"}\n{"clinic":"Ritz"}\n'), [{ clinic: "Glow" }, { clinic: "Ritz" }]);
  assert.deepEqual(htmlScriptRows('<script type="text/json">[{"a":1},{"a":2}]</script>'), [{ a: 1 }, { a: 2 }]);
});

test("a sheet pasted as text, a Markdown table or a list with | between cells is rows; notes aren't", () => {
  assert.deepEqual(textRows("Clinic\tEmail\nGlow\tj@x.com\n"), [{ Clinic: "Glow", Email: "j@x.com" }]);
  assert.deepEqual(textRows("# Leads\n\n| Clinic | Email |\n|---|---|\n| Glow | j@x.com |\n"), [{ Clinic: "Glow", Email: "j@x.com" }]);
  assert.deepEqual(textRows("Clinic | Doctor | Email\nGlow | Jane | j@x.com\nRitz | Ross | r@x.com"), [
    { Clinic: "Glow", Doctor: "Jane", Email: "j@x.com" },
    { Clinic: "Ritz", Doctor: "Ross", Email: "r@x.com" },
  ]);
  // a lead written beside the table, or notes, go to Claude
  assert.equal(textRows("| Clinic | Email |\n|---|---|\n| Glow | j@x.com |\n- Dr Dan, dan@wu.com"), null);
  assert.equal(textRows("Name:\tJane\nEmail:\tj@x.com"), null);
  assert.equal(textRows("Met Dr Jane at AAD, she's at jane@glow.com"), null);
});

test("headings with accents and in Spanish or German", () => {
  const m = autoMap(columnsOf([{ Clínica: "Núñez", Nombre: "José", Apellido: "Núñez", Correo: "j@x.mx", Teléfono: "+52 55 5555 0101", País: "México" }]), board);
  assert.deepEqual(m, { Clínica: "title", Nombre: "contact.name", Apellido: "contact.name", Correo: "contact.email", Teléfono: "contact.phone", País: "field:country" });
});

test("a nested record's name is that record's; a list in a list's records holds none of the lead's people", () => {
  const rows = [{ company: { name: "Glow Clinic" }, people: [{ name: { first: "Jane", last: "Doe" }, email: "j@glow.com" }] }];
  const cols = columnsOf(rows);
  const m = autoMap(cols, people);
  assert.equal(m["company.name"], "title");
  assert.deepEqual(buildLeads(rows, oneEach(cols, m), people).leads[0], { title: "Glow Clinic", contacts: [{ email: ["j@glow.com"], name: "Jane Doe" }] });
  assert.equal(autoMap(columnsOf([{ posts: [{ tagged: [{ full_name: "Kim K" }] }] }]), people)["posts[].tagged[].full_name"], undefined);
  const two = [{ clinic: "Glow", doctors: [{ name: "Dr Jane Doe", email: "j@glow.com" }], assistants: [{ name: "Sam Lee", email: "s@glow.com" }] }];
  const c2 = columnsOf(two);
  assert.deepEqual(
    buildLeads(two, oneEach(c2, autoMap(c2, people)), people).leads[0].contacts?.map((c) => c.name),
    ["Dr Jane Doe", "Sam Lee"],
  );
});

test("a profile's address is the person's whatever its heading; pictures and company pages aren't", () => {
  const m = autoMap(columnsOf([{ url: "https://www.instagram.com/drjane", profileUrl: "https://www.linkedin.com/in/jane", profilePicUrl: "https://scontent.cdninstagram.com/a.jpg", img: "https://x.com/a.png" }]), people);
  assert.deepEqual(m, { url: "contact.instagram", profileUrl: "contact.linkedin", profilePicUrl: "ignore", img: "ignore" });
  assert.equal(postLink("http://www.linkedin.com/company/glow-clinic"), true);
  const p = leadsOf("Clinic,Person Linkedin Url,Company Linkedin Url\nGlow,https://linkedin.com/in/jane,https://linkedin.com/company/glow");
  assert.deepEqual([p.leads[0].contacts, p.leads[0].links], [[{ linkedin: ["https://linkedin.com/in/jane"] }], [{ label: "", url: "https://linkedin.com/company/glow" }]]);
});

test("a person's details go where they belong, whichever column they came in", () => {
  const rows = tableRows(parseCsv("Clinic,Website,Link\nGlow,instagram.com/drjane,glowclinic.com\nRitz,www.ritz.com (main),dr@ritz.com\nZen,,+1 (212) 555-0147"));
  const p = buildLeads(rows, { Clinic: "title", Website: "contact.website", Link: "link" }, people);
  assert.deepEqual(
    p.leads.map((l) => [l.contacts, l.links]),
    [
      [[{ instagram: ["instagram.com/drjane"] }], [{ label: "", url: "https://glowclinic.com" }]],
      [[{ website: ["www.ritz.com"], email: ["dr@ritz.com"] }], undefined],
      [[{ phone: ["+1 (212) 555-0147"] }], undefined],
    ],
  );
});

test("tags written another way: a country's names and codes, an opener's code or words", () => {
  const countries = tags("USA", "UK", "UAE", "Türkiye");
  for (const [v, want] of [["United States", "USA"], ["U.S.", "USA"], ["us", "USA"], ["GB", "UK"], ["England", "UK"], ["Dubai, UAE", "UAE"], ["Turkey", "Türkiye"], ["France", undefined]] as [string, string | undefined][])
    assert.equal(matchOption(countries, v)?.name, want, v);
  const openers = tags("D1 · Old hit still on top", "D2 · View swing", "D3 · Real hit");
  for (const [v, want] of [["D1 - Old hit still on top", "D1 · Old hit still on top"], ["Old hit", "D1 · Old hit still on top"], ["d2: views", "D2 · View swing"], ["D9", undefined], ["hit", undefined]] as [string, string | undefined][])
    assert.equal(matchOption(openers, v)?.name, want, v);
});

test("an Opener column of sentences is the {{Opener}}, not the Opener tag", () => {
  const b = { fields: [field("opener", "Opener", "select", tags("D1 · Old hit still on top"))], messages: [message("m1", "Email 1", "email", "{{Opener}}")] };
  assert.equal(autoMap(columnsOf([{ Opener: "Your video on lysine is still your most-watched." }]), b).Opener, "var:Opener");
  assert.equal(autoMap(columnsOf([{ Opener: "D1" }]), b).Opener, "field:opener");
});

test("a 1/2/3 priority or an id isn't a tag field; a heading that names the field is", () => {
  const b = { fields: [field("meme", "Meme board", "select", tags("1", "2", "3"))], messages: [] };
  assert.deepEqual(autoMap(columnsOf([{ Priority: "1", id: "2", board: "3" }]), b), { board: "field:meme" });
});

test("a wide sheet's Contact 1 and Contact 2 are two people", () => {
  const p = leadsOf("Clinic,Contact 1 Name,Contact 1 Email,Contact 1 Role,Contact 2 Name,Contact 2 Email,Contact 2 Role\nGlow,Dr Jane,jane@glow.com,Owner,Sam Lee,sam@glow.com,Manager");
  assert.deepEqual(p.leads[0].contacts, [
    { name: "Dr Jane", email: ["jane@glow.com"], role: "Owner" },
    { name: "Sam Lee", email: ["sam@glow.com"], role: "Manager" },
  ]);
});

test("a lead named by its handle when nothing else names it; by the business when Name is the clinic", () => {
  assert.deepEqual(leadsOf("Instagram,Email\n@drjane,\n,ross@ritz.com").leads.map((l) => l.title), ["@drjane", "ross@ritz.com"]);
  assert.deepEqual(leadsOf("Name,Doctor,Email\nGlow Aesthetics Clinic,Dr Jane Doe,j@glow.com").leads[0], { title: "Glow Aesthetics Clinic", contacts: [{ email: ["j@glow.com"], name: "Dr Jane Doe" }] });
});

test("already on the board by a name written another way, or by an email or handle a lead there has", () => {
  const b = {
    ...people,
    leads: [
      { title: "Dr. K | PCH MedSpa" },
      { title: "Sophie", values: { c: [{ id: "1", name: "", role: "", channels: [{ kind: "email", value: "akraj@gmail.com" }] }], l: [{ label: "", url: "https://www.youtube.com/@SunSkin" }] } },
    ],
  };
  const p = leadsOf("Clinic,Email,Channel\nDr K | PCH MedSpa,a@x.com,\nShotter Aesthetics,AKRAJ@gmail.com,\nSun,s@x.com,youtube.com/@sunskin/\nNew,n@x.com,", b);
  assert.deepEqual([p.leads.map((l) => l.title), p.existing], [["New"], 3]);
  // ...and the same channel twice in the file is one lead
  assert.equal(leadsOf("Clinic,Email\nGlow Clinic,jane@glow.com\nGlow Aesthetics,jane@glow.com").leads.length, 1);
});

test("people who share a clinic's site, phone or inbox stay apart; one person written two ways is one", () => {
  assert.equal(samePeople([{ name: "Dr Jane Doe", website: ["glow.com"], phone: ["555 0101"], email: ["info@glow.com"] }, { name: "Dr John Roe", website: ["glow.com"], phone: ["555 0101"], email: ["info@glow.com"] }]).length, 2);
  assert.equal(samePeople([{ name: "Jane Doe", email: ["j@glow.com"] }, { name: "John Roe", email: ["j@glow.com"] }]).length, 2);
  assert.equal(samePeople([{ name: "José Núñez" }, { name: "Jose Nunez" }]).length, 1);
  assert.deepEqual(samePeople([{ instagram: ["@drjane"] }, { instagram: ["https://instagram.com/drjane/"] }]), [{ instagram: ["@drjane"] }]);
  assert.deepEqual(samePeople([{ name: "Jane", email: ["jane@glow.com"] }, { name: "Jane", email: ["Jane@Glow.com"] }]), [{ name: "Jane", email: ["jane@glow.com"] }]);
  // a run-together name is a channel's only when it reads like one
  assert.equal(samePeople([{ name: "Dr Jane Doe" }, { name: "LaToya", role: "Assistant" }]).length, 2);
  assert.deepEqual(samePeople([{ name: "Dr Jane Doe" }, { name: "Glow Skin team", role: "Bookings" }]), [{ name: "Dr Jane Doe" }]);
});

test("a profile's bold letters are plain; two doctors in one cell are two people", () => {
  const rows = [{ cn: "Kopelman", n: "Dr. Ross Kopelman  Dr. Joel Kopelman" }, { cn: "Markelov", n: "𝐃𝐫. 𝐀𝐥𝐞𝐱𝐞𝐲 𝐌𝐚𝐫𝐤𝐞𝐥𝐨𝐯" }];
  const p = buildLeads(rows, { cn: "title", n: "contact.name" }, people);
  assert.deepEqual(
    p.leads.map((l) => l.contacts?.map((c) => c.name)),
    [["Dr. Ross Kopelman", "Dr. Joel Kopelman"], ["Dr. Alexey Markelov"]],
  );
});

test("two columns on one message keep the whole message; {{Link}} takes only links", () => {
  const cols = [
    { path: "m.da", values: ["Great breakdown."] },
    { path: "m.email", values: ["Hi Dr K,\n\nYour video on lysine is still your most-watched. Great breakdown."] },
    { path: "m.e", values: ["so far more of those viewers stay"] },
    { path: "m.site", values: ["https://easeus.media"] },
    { path: "m.c", values: ["D1"] },
    { path: "t", values: ["D1"] },
  ];
  assert.deepEqual(oneEach(cols, { "m.da": "message:m1:body", "m.email": "message:m1:body", "m.e": "var:Link", "m.site": "var:Link", "m.c": "field:opener", t: "field:opener" }), {
    "m.da": "ignore",
    "m.email": "message:m1:body",
    "m.e": "ignore",
    "m.site": "var:Link",
    "m.c": "field:opener",
    // the first one keeps the field; only a code beside the messages names an opener
    t: "ignore",
  });
});

test("backups fill their own openers: own subject and variables, the tag code as the label", () => {
  const b = { ...board, messages: [message("m1", "Email 1", "email", "Hi {{Greeting name}}, {{Observation}}", "{{Subject}}"), message("m2", "LinkedIn connection note", "linkedin", "Hi, {{Observation}}")] };
  const rows = [{ cn: "Glow", t: "D1", docs: [{ n: "Jane", em: "j@glow.com" }], m: { c: "D1", s: "your lysine video", email: "Hi Jane, main one" }, alt: [{ c: "D2", s: "your other video", o: "Your views swing", email: "Hi Jane, backup" }] }];
  const mapping = oneEach(columnsOf(rows), {
    cn: "title",
    "docs[].n": "contact.name",
    "docs[].em": "contact.email",
    t: "field:opener",
    "m.c": "field:opener",
    "m.s": "var:Subject",
    "m.email": "message:m1:body",
    "alt[].c": "field:opener",
    "alt[].s": "var:Subject",
    "alt[].o": "var:Observation",
    "alt[].email": "message:m1:body",
  });
  const lead = buildLeads(rows, mapping, b).leads[0];
  assert.deepEqual(lead.vars, { Subject: "your lysine video" });
  assert.deepEqual(lead.openers, [
    { label: "D1 · Old hit still on top", drafts: { m1: { subject: "{{Subject}}", body: "Hi Jane, main one" } } },
    { label: "D2 · View swing", drafts: { m1: { subject: "your other video", body: "Hi Jane, backup" }, m2: { subject: "", body: "Hi, Your views swing" } } },
  ]);
});

test("a count of 1.2K is 1,200", () => {
  const b = { fields: [field("n", "Episodes", "count")], messages: [], leads: [] };
  assert.deepEqual(buildLeads([{ t: "Pod", n: "1.2K" }, { t: "Cast", n: "0x1A" }], { t: "title", n: "field:n" }, b).leads.map((l) => l.values?.n), [{ n: 1200, remark: "" }, { n: null, remark: "0x1A" }]);
});

test("a tall picture is cut in overlapping slices at most twice as tall as wide", () => {
  assert.deepEqual(slices(1000, 1500), [{ top: 0, height: 1500 }]);
  const s = slices(1170, 8600);
  assert.ok(s.length === 4 && s.every((x) => x.height === 2340) && s.at(-1)!.top + 2340 === 8600);
  assert.ok(s.slice(1).every((x, i) => x.top < s[i].top + x.height));
  assert.deepEqual(slices(0, 10), []);
});

test("Claude's parts end at a blank line, and after 35 lines that reach someone", () => {
  const leads = Array.from({ length: 80 }, (_, i) => `Clinic ${i} | dr${i}@x.com`).join("\n");
  assert.deepEqual(
    partsOf({ text: leads, images: [] }).map((p) => p.text!.split("\n").filter(Boolean).length),
    [35, 35, 10],
  );
  const paras = Array.from({ length: 60 }, (_, i) => `Radiance ${i} - Toronto\n@dr${i} | p${i}@r.com\nFollowers 12K`).join("\n\n");
  assert.ok(partsOf({ text: paras, images: [] }).every((p) => /^\n?Radiance/.test(p.text!)));
});

test("what Claude read out is cleaned the same way: lists in a cell, profiles and addresses put in links", () => {
  const b = { ...people, fields: [...people.fields, field("country", "Country", "select", tags("USA", "UK"))] };
  const rows = [
    { title: "Webb Derm", contacts: [{ name: "Dr Marcus Webb", email: "mailto:m@webb.com, info@webb.com", website: "instagram.com/drmarcuswebb" }], links: ["(212) 555-0147", "dr@webb.com", "webbderm.com", "YT 1"], Country: "United Kingdom" },
  ];
  const cols = columnsOf(rows);
  const p = buildLeads(rows, oneEach(cols, placeExtracted(cols, b)), b);
  assert.deepEqual(p.leads[0], {
    title: "Webb Derm",
    values: { country: ["o2"] },
    contacts: [{ name: "Dr Marcus Webb", email: ["m@webb.com", "info@webb.com", "dr@webb.com"], instagram: ["instagram.com/drmarcuswebb"], phone: ["(212) 555-0147"] }],
    links: [{ label: "", url: "https://webbderm.com" }],
  });
});

test("a lead named by an @handle takes the person's name when the file has one", () => {
  const board = { fields: [{ id: "c", name: "Contacts", kind: "contacts", required: true, onCard: false, options: [] }], messages: [], leads: [] };
  const p = buildLeads([{ user: "@drjanedoe", full: "Dr Jane Doe", mail: "jane@example.com" }], { user: "title", full: "contact.name", mail: "contact.email" }, board as never);
  assert.equal(p.leads[0].title, "Dr Jane Doe");
});

test("a lead with a Notion page isn't asked about for contact details: its page is read after", () => {
  const board = { fields: [{ id: "c", name: "Contacts", kind: "contacts", required: true, onCard: false, options: [] }, { id: "l", name: "Links", kind: "links", required: false, onCard: false, options: [] }], messages: [], leads: [] };
  const p = buildLeads([{ cn: "Dr K", g: "Dr K", no: "https://adorable-tower-3f9.notion.site/089b6a208044827f9721814679a8773c" }, { cn: "Dr Q", g: "Dr Q" }], { cn: "title", g: "contact.name", no: "link" }, board as never);
  assert.deepEqual(p.unreachable, ["Dr Q"]);
});

test("a real country however it's written, and nothing else", () => {
  assert.equal(countryName("Milan, Italy"), "Italy");
  assert.equal(countryName("Italia"), "Italy");
  assert.equal(countryName("U.S."), "United States");
  assert.equal(countryName("Dubai"), "United Arab Emirates");
  assert.equal(countryName("japan"), "Japan");
  assert.equal(countryName("European Union"), null);
  assert.equal(countryName("Somewhere nice"), null);
  assert.equal(countryName(""), null);
});
