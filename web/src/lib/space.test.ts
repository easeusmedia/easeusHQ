import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanValue, DREAM_156, fillParts, fillText, isFilled, leadVars, missingDetails, messageGroups, messagePhases, dayOf, moveNeedsReason, outreachStats, tracksOutreach, uniqueSlug, variablesIn } from "./space.ts";

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
  assert.equal(DREAM_156.stages.length, 19);
  assert.equal(new Set(DREAM_156.stages.map((s) => s.name)).size, 19);
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

test("messages group by day, then by stage", () => {
  const st = (id: string, name: string) => ({ id, name, color: "blue" });
  const msg = (id: string, stageId: string) => ({ id, stageId, name: id, channel: "email", subject: "", body: "", note: "" });
  const stages = [st("a", "Dream List"), st("b", "Day 1 · Email 1"), st("c", "Day 1 · LinkedIn note"), st("d", "Day 2 · Instagram 1"), st("e", "Replied"), st("f", "Dead")];
  const groups = messageGroups({ stages, messages: [msg("e1", "b"), msg("l1", "c"), msg("i1", "d"), msg("r1", "e"), msg("r2", "e")] });
  assert.deepEqual(groups.map((g) => [g.title, g.items.map((m) => m.id)]), [["Day 1", ["e1", "l1"]], ["Day 2", ["i1"]], ["Replied", ["r1", "r2"]]]);
  assert.equal(dayOf("Day 12 · Email 9"), 12);
  assert.equal(dayOf("Daydream"), null);
  assert.equal(dayOf("Audit sent"), null);
});

// the podcast board's shape: three before reaching out, two days, the end
const outreach = ["Dream List", "Ready to reach out", "Day 1", "Day 2 · Instagram 1", "Replied", "Dead"].map((name, i) => ({ id: `s${i}`, name }));
const lead = (stageId: string, more: Partial<{ reached: boolean; opens: number; replied: boolean }> = {}) => ({ stageId, reached: false, opens: 0, replied: false, ...more });

test("reached out: Ready to reach out and after, Dead only if it got there first", () => {
  const stats = outreachStats(outreach, [lead("s0"), lead("s1"), lead("s2", { opens: 3 }), lead("s3", { opens: 1, replied: true }), lead("s5"), lead("s5", { reached: true, replied: true })]);
  assert.deepEqual(stats, { reached: 4, opened: 2, opens: 4, replied: 2, openRate: 50, replyRate: 50 });
});

test("opens and replies are kept from Day 1 on", () => {
  assert.equal(tracksOutreach(outreach, lead("s1")), false);
  assert.equal(tracksOutreach(outreach, lead("s2")), true);
  assert.equal(tracksOutreach(outreach, lead("s4")), true);
  assert.equal(tracksOutreach(outreach, lead("s5")), false);
  assert.equal(tracksOutreach(outreach, lead("s5", { reached: true })), true);
});

test("no day sequence: nothing to count", () => {
  assert.deepEqual(outreachStats([{ id: "a", name: "To do" }], [lead("a", { opens: 2 })]), { reached: 0, opened: 0, opens: 0, replied: 0, openRate: 0, replyRate: 0 });
});

// Ready, Day 1 (email and LinkedIn on one stage), Day 2, Day 7 on two stages, then the replies
const seq = { stages: ["Write-up done", "Ready to reach out", "Day 1", "Day 2 · Instagram 1", "Day 7 · Instagram 3", "Day 7 · LinkedIn 3", "Replied", "Dead"].map((name, i) => ({ id: `t${i}`, name, color: "default" })), messages: [["t2", "email"], ["t2", "linkedin"], ["t3", "instagram"], ["t4", "instagram"], ["t5", "linkedin"], ["t6", "email"]].map(([stageId, channel], i) => ({ id: `m${i}`, stageId, name: `m${i}`, channel, subject: "", body: "", note: "" })) };
const shape = (stageId: string) => messagePhases(seq, stageId).map((p) => `${p.title}:${p.when ?? "-"}:${p.messages.map((m) => m.id).join("+")}`);

test("before Ready to reach out there is nothing to send", () => {
  assert.deepEqual(shape("t0"), []);
});
test("at Ready to reach out every day shows, Day 1 next", () => {
  assert.deepEqual(shape("t1"), ["Day 1:next:m0+m1", "Day 2:-:m2", "Day 7:-:m3+m4"]);
});
test("on a day: that day now and the next one", () => {
  assert.deepEqual(shape("t2"), ["Day 1:now:m0+m1", "Day 2:next:m2"]);
  assert.deepEqual(shape("t3"), ["Day 2:now:m2", "Day 7:next:m3+m4"]);
  assert.deepEqual(shape("t5"), ["Day 7:now:m3+m4"]);
});
test("outside the sequence a stage shows its own", () => {
  assert.deepEqual(shape("t6"), ["Replied:now:m5"]);
  assert.deepEqual(shape("t7"), []);
});
