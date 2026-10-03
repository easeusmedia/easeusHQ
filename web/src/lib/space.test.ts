import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanValue, DREAM_156, fillParts, fillText, isFilled, leadVars, missingDetails, moveNeedsReason, uniqueSlug, variablesIn } from "./space.ts";

const order = ["shortlist", "day1", "day2", "day3", "dead"];

test("one step forward is free", () => {
  assert.equal(moveNeedsReason(order, "day1", "day2"), false);
  assert.equal(moveNeedsReason(order, "shortlist", "day1"), false);
});

test("staying put is free", () => {
  assert.equal(moveNeedsReason(order, "day2", "day2"), false);
});

test("skipping ahead needs a reason", () => {
  assert.equal(moveNeedsReason(order, "day1", "day3"), true);
  assert.equal(moveNeedsReason(order, "shortlist", "dead"), true);
});

test("going back needs a reason, even one step", () => {
  assert.equal(moveNeedsReason(order, "day2", "day1"), true);
  assert.equal(moveNeedsReason(order, "dead", "shortlist"), true);
});

test("an unknown stage needs a reason", () => {
  assert.equal(moveNeedsReason(order, "gone", "day1"), true);
  assert.equal(moveNeedsReason(order, "day1", "gone"), true);
});

test("tags must belong to the field", () => {
  assert.deepEqual(cleanValue("select", ["a"], ["a", "b"]), { value: ["a"] });
  assert.ok("error" in cleanValue("select", ["z"], ["a"]));
  assert.ok("error" in cleanValue("select", ["a", "b"], ["a", "b"]));
  assert.deepEqual(cleanValue("multi", ["a", "b", "a"], ["a", "b"]), { value: ["a", "b"] });
  assert.deepEqual(cleanValue("select", [], ["a"]), { value: null });
  assert.ok("error" in cleanValue("select", "a", ["a"]));
});

test("a count is a whole number with an optional remark", () => {
  assert.deepEqual(cleanValue("count", { n: 3, remark: " good hooks " }), { value: { n: 3, remark: "good hooks" } });
  assert.deepEqual(cleanValue("count", { n: null, remark: "" }), { value: null });
  assert.deepEqual(cleanValue("count", { n: "", remark: "only words" }), { value: { n: null, remark: "only words" } });
  assert.ok("error" in cleanValue("count", { n: 2.5, remark: "" }));
  assert.ok("error" in cleanValue("count", { n: -1, remark: "" }));
});

test("contacts keep only known channels and trim everything", () => {
  const r = cleanValue("contacts", [{ id: "p1", name: " Jarrid ", role: "CEO", channels: [{ kind: "email", value: " a@b.co " }, { kind: "fax", value: "1" }] }]);
  assert.deepEqual(r, { value: [{ id: "p1", name: "Jarrid", role: "CEO", channels: [{ kind: "email", value: "a@b.co" }] }] });
  assert.deepEqual(cleanValue("contacts", []), { value: null });
  assert.ok("error" in cleanValue("contacts", "nope"));
});

test("links drop empty rows", () => {
  assert.deepEqual(cleanValue("links", [{ label: "IG", url: "https://instagram.com/x" }, { label: "", url: "" }]), { value: [{ label: "IG", url: "https://instagram.com/x" }] });
});

test("checkbox, date and text", () => {
  assert.deepEqual(cleanValue("checkbox", true), { value: true });
  assert.deepEqual(cleanValue("checkbox", false), { value: null });
  assert.deepEqual(cleanValue("date", "2026-10-02"), { value: "2026-10-02" });
  assert.ok("error" in cleanValue("date", "02/10/2026"));
  assert.deepEqual(cleanValue("text", "  "), { value: null });
});

test("missing details lists required fields left empty", () => {
  const fields = [
    { id: "t", name: "Trailer", kind: "select" as const, required: true },
    { id: "s", name: "Short-form quantity", kind: "count" as const, required: true },
    { id: "c", name: "Contacts", kind: "contacts" as const, required: true },
    { id: "n", name: "Newsletter", kind: "select" as const, required: false },
  ];
  assert.deepEqual(missingDetails(fields, {}), ["Trailer", "Short-form quantity", "Contacts"]);
  assert.deepEqual(missingDetails(fields, { t: ["yes"], s: { n: 0, remark: "" }, c: [{ id: "1", name: "Ann", role: "", channels: [] }] }), []);
  assert.equal(isFilled("count", { n: null, remark: "x" }), false);
  assert.equal(isFilled("contacts", [{ id: "1", name: "", role: "", channels: [] }]), false);
});

test("slugs never clash with a sibling", () => {
  assert.equal(uniqueSlug("Podcast", []), "podcast");
  assert.equal(uniqueSlug("Podcast", ["podcast"]), "podcast-2");
  assert.equal(uniqueSlug("Podcast!", ["podcast", "podcast-2"]), "podcast-3");
  assert.equal(uniqueSlug("  ", []), "page");
});

test("the Dream 156 template has 17 distinct stages", () => {
  assert.equal(DREAM_156.stages.length, 17);
  assert.equal(new Set(DREAM_156.stages.map((s) => s.name)).size, 17);
  for (const f of DREAM_156.fields) if (f.kind === "select") assert.ok(f.options?.length);
});

test("variables are found once each, in order", () => {
  assert.deepEqual(variablesIn(["Hey {{Name}}, your {{Guest}} episode", "{{ Name }} and {{Gap}}"]), ["Name", "Guest", "Gap"]);
});

test("a message fills what it knows and keeps the rest marked", () => {
  assert.equal(fillText("Hey {{Name}}, re {{Guest}}", { Name: "Ann" }), "Hey Ann, re {{Guest}}");
  assert.deepEqual(fillParts("Hi {{Name}}!", { Name: "Ann" }), [{ text: "Hi " }, { name: "Name", value: "Ann" }, { text: "!" }]);
  assert.deepEqual(fillParts("{{Gap}}", {}), [{ name: "Gap", value: null }]);
});

test("a lead's Name and Podcast fill themselves; typed values win", () => {
  const fields = [{ id: "c", kind: "contacts" as const }];
  const lead = { title: "Harlem Capital", values: { c: [{ id: "1", name: "Jarrid Tingle", role: "", channels: [] }] }, vars: {} };
  assert.deepEqual(leadVars(lead, fields), { Podcast: "Harlem Capital", Name: "Jarrid" });
  assert.deepEqual(leadVars({ ...lead, vars: { Name: "J", Guest: " " } }, fields), { Podcast: "Harlem Capital", Name: "J" });
});
