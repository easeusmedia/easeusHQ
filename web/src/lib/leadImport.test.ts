import { test } from "node:test";
import assert from "node:assert/strict";
import { autoMap, buildLeads, columnsOf, halves, htmlScriptRows, jsonRows, matchOption, parseCsv, partsOf, tableRows } from "./leadImport.ts";
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

test("JSON: the longest list of objects, wherever it is", () => {
  assert.deepEqual(jsonRows({ meta: { tags: [{ a: 1 }] }, data: { rows: [{ n: "A" }, { n: "B" }] } }), [{ n: "A" }, { n: "B" }]);
  assert.deepEqual(jsonRows({ just: "an object" }), []);
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

test("Claude's parts: about 12,000 characters or five pictures, halved when an answer runs out", () => {
  const line = "x".repeat(5000);
  const parts = partsOf({ text: [line, line, line].join("\n"), images: ["a", "b", "c", "d", "e", "f"] });
  assert.deepEqual(
    parts.map((p) => (p.text ? p.text.length : p.images!.length)),
    [10002, 5001, 5, 1],
  );
  assert.deepEqual(halves({ images: ["a", "b", "c"] }), [{ images: ["a", "b"] }, { images: ["c"] }]);
  assert.deepEqual(halves({ text: "one\ntwo\nthree" }), [{ text: "one\ntwo" }, { text: "three" }]);
  assert.equal(halves({ text: "no breaks" }), null);
});
