import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanValue, describeValue, DREAM_156, isFilled, missingDetails, moveNeedsReason, uniqueSlug } from "./space.ts";

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

test("describeValue reads tags by name", () => {
  const field = { kind: "select" as const, options: [{ id: "y", name: "Yes", color: "blue" }] };
  assert.equal(describeValue(field, ["y"]), '"Yes"');
  assert.equal(describeValue(field, null), "cleared");
});

test("slugs never clash with a sibling", () => {
  assert.equal(uniqueSlug("Podcast", []), "podcast");
  assert.equal(uniqueSlug("Podcast", ["podcast"]), "podcast-2");
  assert.equal(uniqueSlug("Podcast!", ["podcast", "podcast-2"]), "podcast-3");
  assert.equal(uniqueSlug("  ", []), "page");
});

test("the Dream 156 template matches Notion's 19 stages", () => {
  assert.equal(DREAM_156.stages.length, 19);
  assert.equal(new Set(DREAM_156.stages.map((s) => s.name)).size, 19);
  for (const f of DREAM_156.fields) if (f.kind === "select") assert.ok(f.options?.length);
});
