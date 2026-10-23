import { test } from "node:test";
import assert from "node:assert/strict";
import { autoMap, buildLeads, columnsOf, halves, oneEach, postLink, samePeople, htmlScriptRows, jsonRows, matchOption, parseCsv, partsOf, placeExtracted, tableRows, targetsOf } from "./leadImport.ts";
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
    // twice in the file, on the board already, no people, no name
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
      contacts: [{ name: "Dr. K", email: ["k@pch.com"], linkedin: ["https://linkedin.com/in/k"] }, { name: "Ann" }],
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
  assert.equal(p.existing, 2);
  assert.equal(p.missing, 1);
  assert.equal(p.unnamed, 1);
  assert.deepEqual(p.unmatched, ["To check: Unknown", "Country: France"]);
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
  assert.equal(halves({ text: "no breaks" }), null);
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
