import { test } from "node:test";
import assert from "node:assert/strict";
import { agreed, askMap, askTags, describe, mappingOf, rowsOf, toldTags } from "./importClaude.ts";
import type { FieldData, MessageData } from "../../../../lib/space.ts";

const tags = (...names: string[]) => names.map((name, i) => ({ id: `o${i + 1}`, name, color: "blue" }));
const field = (name: string, kind: FieldData["kind"], options = tags()): FieldData => ({ id: name, name, kind, onCard: false, required: false, options });

test("Claude sees every tag, so the 11th country is never answered with the nearest listed one", () => {
  const countries = ["USA", "UK", "India", "UAE", "Canada", "Australia", "Germany", "France", "Spain", "Italy", "South Korea", "Japan", "Brazil", "Malaysia", "Colombia"];
  const said = describe({ fields: [field("Contacts", "contacts"), field("Country", "select", tags(...countries))], messages: [] });
  for (const c of ["South Korea", "Malaysia", "Colombia"]) assert.match(said, new RegExp(`tags: .*${c}`));
  assert.doesNotMatch(said, /Contacts/);
  // still capped, for a board with a runaway list
  const many = describe({ fields: [field("Tag", "multi", tags(...Array.from({ length: 80 }, (_, i) => `t${i}`)))], messages: [] });
  assert.match(many, /t59\)/);
  assert.doesNotMatch(many, /t60/);
});

test("two values for one property are both kept, a repeat once", () => {
  const [row] = rowsOf([
    {
      title: "Hale Aesthetics",
      contacts: [{ name: "Tom Hale", email: "tom@haleaesthetics.com, bookings@haleaesthetics.com" }],
      links: [],
      values: [
        { field: "To check", value: "Find first name" },
        { field: "To check", value: "Check description" },
        { field: "To check", value: "Find first name" },
        { field: "Country", value: "Ireland" },
      ],
      vars: [{ name: "First name", value: "Tom" }],
    },
  ]);
  assert.deepEqual(row, {
    title: "Hale Aesthetics",
    contacts: [{ name: "Tom Hale", email: "tom@haleaesthetics.com, bookings@haleaesthetics.com" }],
    links: [],
    "To check": "Find first name, Check description",
    Country: "Ireland",
    "{{First name}}": "Tom",
  });
});

const message = (id: string, name: string, channel: string, body: string, subject = ""): MessageData => ({ id, stageId: "s1", name, channel, subject, body, note: "" });

test("Claude's placements: several messages for one column, the board's same words on two channels, versions only where a message has two", () => {
  const board = {
    fields: [],
    messages: [message("e3", "Day 3 Email 2", "email", "One thing from the audit"), message("ig", "Day 7 Instagram 3", "instagram", "Hey {{Name}}, last one"), message("li", "Day 7 LinkedIn 3", "linkedin", "Hey {{Name}}, last one")],
  };
  const { places, prompt } = askMap(board, [{ path: "d7", samples: ["Hey Rachel, last one"] }], [{ path: "title", target: "title" }]);
  // Claude sees where code put the rest, and that LinkedIn 3 has Instagram 3's words
  assert.match(prompt, /Columns already placed:\n- title: Lead: Lead name/);
  assert.match(prompt, /Day 7 LinkedIn 3 \(linkedin\): the same words as Day 7 Instagram 3/);
  const m = mappingOf(
    [
      { column: "d7", place: "Messages: Day 7 Instagram 3", version: "" },
      { column: "d3_comm", place: "Messages: Day 3 Email 2", version: "community" },
      { column: "d3_asset", place: "Messages: Day 3 Email 2", version: "Asset map" },
      { column: "alt[].email", place: "Messages: Day 3 Email 2", version: "Main" },
      { column: "x", place: "Nowhere", version: "" },
    ],
    places,
    board,
  );
  assert.deepEqual(m, {
    d7: "message:ig:body|message:li:body",
    d3_comm: "message:e3:body:Community",
    d3_asset: "message:e3:body:Asset map",
    // alone on its message in its list: not a version
    "alt[].email": "message:e3:body",
  });
});

test("what most of Claude's answers give is kept, with the version most of them name", () => {
  const a = (place: string, version = "") => ({ column: "c", place, version });
  assert.deepEqual(agreed([[a("Messages: Email 1", "Short")], [a("Messages: Email 1", "Short"), { column: "d", place: "Lead: Link" }], [a("Variables: Gap")]]), [a("Messages: Email 1", "Short")]);
  assert.deepEqual(agreed([[a("Lead: Link")]]), [a("Lead: Link")]);
  // a version keeps one name on every message, the one answer's that agrees most
  const v = (column: string, version: string) => ({ column, place: `Messages: ${column}`, version });
  const got = agreed([
    [v("e2b", "Asset"), v("e3b", "Asset")],
    [v("e2b", "Asset map"), v("e3b", "Asset map")],
    [v("e2b", "Asset"), v("e3b", "Asset map")],
  ]);
  assert.deepEqual(got.map((p) => p.version), ["Asset", "Asset"]);
});

test("values onto tags: one ask with each value's column and neighbours; an answer only counts on its own field", () => {
  const board = { fields: [field("Podcast cadence", "select", tags("4 episodes a month", "Less than 2 episodes a month")), field("Trailer", "select", tags("Yes", "No"))] };
  const ask = askTags(board, [{ field: "Podcast cadence", column: "research.eps90", values: ["5", "12"], beside: [{ "research.window": "90" }] }]);
  assert.deepEqual(ask.items, [
    { id: "v1", field: "Podcast cadence", value: "5" },
    { id: "v2", field: "Podcast cadence", value: "12" },
  ]);
  assert.match(ask.prompt, /Column: research\.eps90\nBeside it in two rows:\n\{"research\.window":"90"\}/);
  const told = toldTags(board, ask.items, [
    { id: "v1", tag: "Less than 2 episodes a month" },
    { id: "v2", tag: "Yes" },
  ]);
  assert.deepEqual(told, { "Podcast cadence": { "5": "o2" } });
  // a rate onto tags that are bands of numbers is placed in code: the band it's in, else the nearest
  const cadence = { fields: [field("Podcast cadence", "select", tags("More than 5 episodes a month", "4 episodes a month", "2-3 episodes a month", "Around 2 episodes a month", "Less than 2 episodes a month"))] };
  const rates = [1.67, 2, 3.67, 5, 5.33, 0];
  const items = rates.map((r, i) => ({ id: `v${i}`, field: "Podcast cadence", value: String(r) }));
  const placed = toldTags(cadence, items, rates.map((rate, i) => ({ id: `v${i}`, tag: "Around 2 episodes a month", rate })))["Podcast cadence"];
  assert.deepEqual(
    rates.map((r) => placed[String(r)]),
    ["o5", "o4", "o2", "o2", "o1", "o5"],
  );
  // not a number (-1): Claude's tag
  assert.equal(toldTags(cadence, items.slice(0, 1), [{ id: "v0", tag: "4 episodes a month", rate: -1 }])["Podcast cadence"]["1.67"], "o2");
});

test("for placing, a variable is shown where it's used, a whole subject line as one", () => {
  const said = describe({ fields: [], messages: [message("e1", "Email 1", "email", "Hi {{Name}},\n\nWatched your {{Guest}} episode.", "{{Subject}}")] }, true);
  assert.match(said, /- Subject: the whole subject line of Email 1/);
  assert.match(said, /- Guest, in Email 1's words: …Hi \{\{Name\}\}, Watched your \{\{Guest\}\} episode\.…/);
  assert.match(said, /- Email 1 \(email\): subject "\{\{Subject\}\}", Hi/);
});
