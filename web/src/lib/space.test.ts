import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanValue, DREAM_156, fillParts, fillText, isFilled, leadVars, messageGroups, messagePhases, optionLabel, dayOf, dayPlatform, defaultMessage, markedOn, moveNeedsReason, outreachStats, reachedByDay, reachOutCounts, reachOutDays, readMarks, requestDay, keepDay, handleOf, linkName, sequenceTabs, stageSections, tracksOutreach, withMark, type Contact, type Marks, type Platform, uniqueSlug, variablesIn } from "./space.ts";

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

test("a count or contact with nothing in it isn't filled", () => {
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
  assert.equal(DREAM_156.stages.length, 16);
  assert.equal(new Set(DREAM_156.stages.map((s) => s.name)).size, 16);
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
const lead = (stageId: string, more: Partial<{ reached: boolean }> = {}) => ({ stageId, reached: false, ...more });

test("opens and replies show from Day 1 on", () => {
  assert.equal(tracksOutreach(outreach, lead("s1")), false);
  assert.equal(tracksOutreach(outreach, lead("s2")), true);
  assert.equal(tracksOutreach(outreach, lead("s4")), true);
  assert.equal(tracksOutreach(outreach, lead("s5")), false);
  assert.equal(tracksOutreach(outreach, lead("s5", { reached: true })), true);
});

// Day 1: email and LinkedIn; Day 2: Instagram; Day 3: email
const days = {
  stages: ["Ready to reach out", "Day 1", "Day 2 · Instagram 1", "Day 3 · Email 2", "Replied"].map((name, i) => ({ id: `d${i}`, name, color: "blue" })),
  messages: [
    { id: "e1", stageId: "d1", channel: "email" },
    { id: "l1", stageId: "d1", channel: "linkedin" },
    { id: "i1", stageId: "d2", channel: "instagram" },
    { id: "e2", stageId: "d3", channel: "email" },
  ].map((m) => ({ ...m, name: m.id, subject: "", body: "", note: "" })),
};

test("Instagram and LinkedIn are reached by the furthest day a lead has been on", () => {
  assert.deepEqual(markedOn(days, 1), ["linkedin"]);
  assert.deepEqual(markedOn(days, 3), []);
  assert.deepEqual(reachedByDay(days, ["Ready to reach out"]), []);
  assert.deepEqual(reachedByDay(days, ["Day 1"]), ["linkedin"]);
  // moved on to Replied after Day 2: both, by its record
  assert.deepEqual(reachedByDay(days, ["Replied", "Day 1", "Day 2 · Instagram 1"]), ["instagram", "linkedin"]);
});

test("a card's buttons follow the platform its day's message goes out on", () => {
  assert.equal(dayPlatform(days, {}, 1), "email");
  assert.equal(dayPlatform(days, { "day-1": "l1" }, 1), "linkedin");
  assert.equal(dayPlatform(days, {}, 2), "instagram");
  assert.equal(dayPlatform(days, {}, 9), null);
});

const person = (id: string, ...kinds: Contact["channels"][number]["kind"][]): Contact => ({ id, name: id, role: "", channels: kinds.map((kind) => ({ kind, value: `${id}@${kind}` })) });

test("a contact's day goes out where they can be reached, and their own pick wins", () => {
  // no email: Day 1 is the LinkedIn note for them
  assert.equal(dayPlatform(days, {}, 1, false, person("c1", "linkedin")), "linkedin");
  assert.equal(dayPlatform(days, {}, 1, false, person("c1", "email", "linkedin")), "email");
  // their own pick, then the lead's
  assert.equal(dayPlatform(days, { "day-1@c1": "l1" }, 1, false, person("c1", "email", "linkedin")), "linkedin");
  assert.equal(dayPlatform(days, { "day-1": "l1" }, 1, false, person("c1", "email", "linkedin")), "linkedin");
  // nothing to reach them with: the day's own default still shows (greyed)
  assert.equal(dayPlatform(days, {}, 2, false, person("c1", "email")), "instagram");
});

test("the LinkedIn connection request goes out on the sequence's first LinkedIn day", () => {
  assert.equal(requestDay(days), 1);
  assert.equal(requestDay({ stages: days.stages, messages: days.messages.filter((m) => m.channel !== "linkedin") }), null);
});

test("a day's message before one is picked follows whether the email was opened", () => {
  const day2 = [{ name: "DAY 2 · INSTAGRAM 1 · DIDN'T OPEN EMAIL 1" }, { name: "DAY 2 · INSTAGRAM 1 · ALREADY OPENED EMAIL 1" }];
  assert.equal(defaultMessage(day2, false)?.name, day2[0].name);
  assert.equal(defaultMessage(day2, true)?.name, day2[1].name);
  assert.equal(defaultMessage([{ name: "Email" }, { name: "LinkedIn" }], true)?.name, "Email");
});

test("a mark is set on a day for one contact, and cleared", () => {
  const set = withMark({}, { contact: "c1", platform: "instagram", kind: "seen", day: "day-2" }, "t");
  assert.deepEqual(set, { c1: { instagram: { seen: { day: "day-2", at: "t" } } } });
  assert.deepEqual(withMark(set, { contact: "c1", platform: "instagram", kind: "seen", day: null }), { c1: { instagram: {} } });
  // another contact's marks stay
  const two = withMark(set, { contact: "c2", platform: "instagram", kind: "replied", day: "day-2" }, "t");
  assert.deepEqual(Object.keys(two), ["c1", "c2"]);
});

test("clearing Accepted on LinkedIn clears that contact's reply too", () => {
  let m = withMark({}, { contact: "c1", platform: "linkedin", kind: "accepted", day: "day-1" }, "t");
  m = withMark(m, { contact: "c1", platform: "linkedin", kind: "replied", day: "day-1" }, "t");
  assert.ok(m.c1?.linkedin?.replied);
  assert.deepEqual(withMark(m, { contact: "c1", platform: "linkedin", kind: "accepted", day: null }), { c1: { linkedin: {} } });
});

test("marks kept by platform alone belong to the first contact", () => {
  const legacy = { instagram: { replied: { day: "day-2", at: "t" } }, c2: { linkedin: { accepted: { day: "day-1", at: "t" } } } };
  assert.deepEqual(readMarks(legacy, "c1"), { c2: legacy.c2, c1: { instagram: legacy.instagram } });
  assert.deepEqual(readMarks({ c1: { instagram: {} } }, "c1"), { c1: { instagram: {} } });
  assert.deepEqual(readMarks(null, "_"), {});
});

type T = { email?: { tracked?: boolean; opens?: number; replied?: boolean }; marks?: Marks; on?: Platform[] };
const row = ({ email = {}, marks = {}, on = [] }: T) => ({
  email: { sent: on.includes("email"), tracked: !!email.tracked, opens: email.opens ?? 0, openedBy: [], replied: email.replied ? { day: "day-1", at: "t", by: "Akash", address: "a@x.co" } : null, bounced: false },
  marks,
  reachedOn: on,
});
const seen = { day: "day-2", at: "t" };

test("the board's numbers, by lead, on each platform and on all", () => {
  const leads = [
    // emailed and tracked, opened twice
    row({ on: ["email", "linkedin"], email: { tracked: true, opens: 2 } }),
    // emailed and tracked, not opened; seen and replied on Instagram
    row({ on: ["email", "linkedin", "instagram"], email: { tracked: true }, marks: { c1: { instagram: { seen, replied: seen } } } }),
    // emailed from a computer without the tracker: no opens known, but it replied
    row({ on: ["email"], email: { replied: true } }),
    // emailed without the tracker, nothing back: reached, opens unknown
    row({ on: ["email"] }),
    // not reached anywhere yet
    row({}),
  ];
  // email: 4 reached, opens known for 3 (2 tracked, 1 replied), 2 opened, 1 replied
  assert.deepEqual(outreachStats(leads, "email"), { reached: 4, opened: 2, replied: 1, accepted: 0, openRate: 67, replyRate: 25, acceptRate: 0 });
  assert.deepEqual(outreachStats(leads, "instagram"), { reached: 1, opened: 1, replied: 1, accepted: 0, openRate: 100, replyRate: 100, acceptRate: 0 });
  // LinkedIn: reached by the day, nothing marked
  assert.deepEqual(outreachStats(leads, "linkedin"), { reached: 2, opened: 0, replied: 0, accepted: 0, openRate: 0, replyRate: 0, acceptRate: 0 });
  // all: each lead once
  assert.deepEqual(outreachStats(leads, null), { reached: 4, opened: 3, replied: 2, accepted: 0, openRate: 100, replyRate: 50, acceptRate: 0 });
});

test("a mark counts as reached even before its day", () => {
  assert.equal(outreachStats([row({ marks: { c1: { linkedin: { seen } } } })], "linkedin").reached, 1);
  assert.deepEqual(outreachStats([], null), { reached: 0, opened: 0, replied: 0, accepted: 0, openRate: 0, replyRate: 0, acceptRate: 0 });
});

test("a lead counts once however many of its people took the request or replied", () => {
  const accepted = { day: "day-1", at: "t" };
  const leads = [
    // two people on one lead: one accepted, the other accepted and replied
    row({ on: ["linkedin"], marks: { c1: { linkedin: { accepted } }, c2: { linkedin: { accepted, replied: accepted } } } }),
    // reached, nobody took it
    row({ on: ["linkedin"] }),
  ];
  assert.deepEqual(outreachStats(leads, "linkedin"), { reached: 2, opened: 1, replied: 1, accepted: 1, openRate: 100, replyRate: 50, acceptRate: 50 });
});

// Dream List, Shortlisted, Ready, Day 1 (email and LinkedIn on one stage), Day 2, Day 7 on two stages, then the replies
const seq = { stages: ["Dream List", "Shortlisted", "Ready to reach out", "Day 1", "Day 2 · Instagram 1", "Day 7 · Instagram 3", "Day 7 · LinkedIn 3", "Replied", "Dead"].map((name, i) => ({ id: `t${i}`, name, color: "default" })), messages: [["t3", "email"], ["t3", "linkedin"], ["t4", "instagram"], ["t5", "instagram"], ["t6", "linkedin"], ["t7", "email"]].map(([stageId, channel], i) => ({ id: `m${i}`, stageId, name: `m${i}`, channel, subject: "", body: "", note: "" })) };
const shape = (stageId: string) => messagePhases(seq, stageId).map((p) => `${p.title}:${p.when ?? "-"}:${p.messages.map((m) => m.id).join("+")}`);

test("before Ready to reach out (Dream List, Shortlisted) there is nothing to send", () => {
  assert.deepEqual(shape("t0"), []);
  assert.deepEqual(shape("t1"), []);
});
test("in Ready to reach out every day shows, Day 1 next", () => {
  assert.deepEqual(shape("t2"), ["Day 1:next:m0+m1", "Day 2:-:m2", "Day 7:-:m3+m4"]);
});
test("on a day: the days before it done, that day now and the next one", () => {
  assert.deepEqual(shape("t3"), ["Day 1:now:m0+m1", "Day 2:next:m2"]);
  assert.deepEqual(shape("t4"), ["Day 1:done:m0+m1", "Day 2:now:m2", "Day 7:next:m3+m4"]);
  assert.deepEqual(shape("t6"), ["Day 1:done:m0+m1", "Day 2:done:m2", "Day 7:now:m3+m4"]);
});
test("outside the sequence a stage shows its own", () => {
  assert.deepEqual(shape("t7"), ["Replied:now:m5"]);
  assert.deepEqual(shape("t8"), []);
});

test("a day's messages are picked by platform, or by what sets them apart", () => {
  const day1 = [{ channel: "email", name: "DAY 1 · EMAIL 1 · ALL ACCOUNTS" }, { channel: "linkedin", name: "DAY 1 · LINKEDIN · ALL ACCOUNTS" }];
  assert.deepEqual(day1.map((m) => optionLabel(day1, m)), ["Email", "LinkedIn"]);
  const day2 = [{ channel: "instagram", name: "DAY 2 · INSTAGRAM 1 · DIDN'T OPEN EMAIL 1" }, { channel: "instagram", name: "DAY 2 · INSTAGRAM 1 · ALREADY OPENED EMAIL 1" }];
  assert.deepEqual(day2.map((m) => optionLabel(day2, m)), ["Didn't open Email 1", "Already opened Email 1"]);
});

test("unique reach outs count each lead once, total every reach out", () => {
  const move = (fromStage: string, toStage: string) => ({ kind: "moved", fromStage, toStage });
  const r = reachOutDays([{ kind: "created", fromStage: null, toStage: "Ready to reach out" }, move("Ready to reach out", "Day 1"), move("Day 1", "Day 2 · Instagram 1"), move("Day 2 · Instagram 1", "Day 1"), move("Day 1", "Day 2 · Instagram 1"), move("Day 2 · Instagram 1", "Replied")], "Replied");
  // back to Day 1 isn't one; on to Day 2 again is
  assert.deepEqual(r, { first: 1, next: [2, 2] });
  assert.deepEqual(reachOutDays([{ kind: "created", fromStage: null, toStage: "Day 1" }], "Day 1"), { first: 1, next: [] });
  assert.deepEqual(reachOutDays([], "Day 1"), { first: 1, next: [] });
  assert.deepEqual(reachOutDays([], "Ready to reach out"), { first: null, next: [] });
  const lead = (first: number | null, next: number[]) => ({ reachOuts: { first, next }, picks: {}, email: row({}).email });
  // 5 leads into Day 1, on to 2 and to 3 (and 1 never reached): 5 unique, 15 total
  const leads = [...Array(5)].map(() => lead(1, [2, 3])).concat(lead(null, []));
  assert.deepEqual(reachOutCounts(days, leads, null), { unique: 5, total: 15 });
  // by the day's platform: Day 1 and 3 email, Day 2 Instagram
  assert.deepEqual(reachOutCounts(days, leads, "email"), { unique: 5, total: 10 });
  assert.deepEqual(reachOutCounts(days, leads, "instagram"), { unique: 5, total: 5 });
  assert.deepEqual(reachOutCounts(days, leads, "linkedin"), { unique: 0, total: 0 });
});

test("a board with a day sequence is in sections: in process to the last day and Dead, the rest replied", () => {
  const names = ["Dream List", "Ready to reach out", "Day 1", "Day 8 · Email 4", "Audit sent", "Replied", "No reply after the audit", "Parked for later", "Dead"];
  assert.deepEqual(stageSections(names.map((name) => ({ name }))), ["process", "process", "process", "process", "replied", "replied", "replied", "replied", "process"]);
  assert.equal(stageSections([{ name: "To do" }, { name: "Done" }]), null);
});

test("a lead's window shows every day as a tab, done, today and next", () => {
  // Dream list, then the fixture: Ready to reach out (d0), Day 1 to 3, Replied (d4)
  const ready = { stages: [{ id: "r", name: "Dream list", color: "default" }, ...days.stages], messages: [...days.messages, { id: "x", stageId: "d4", channel: "email", name: "Thanks", subject: "", body: "", note: "" }] };
  // before Ready to reach out: every day, none marked
  assert.deepEqual(sequenceTabs(ready, "r").map((t) => [t.title, t.when]), [["Day 1", null], ["Day 2", null], ["Day 3", null]]);
  const fromReady = sequenceTabs(ready, "d0");
  assert.deepEqual(fromReady.map((t) => [t.title, t.when]), [["Day 1", "next"], ["Day 2", null], ["Day 3", null]]);
  assert.equal(fromReady[0].sub, "Day 1 · Email + LinkedIn");
  assert.equal(fromReady[1].sub, "Day 2 · Instagram 1");
  assert.deepEqual(sequenceTabs(ready, "d2").map((t) => t.when), ["done", "now", "next"]);
  // past the sequence: every day done, and the stage's own messages as a tab
  assert.deepEqual(sequenceTabs(ready, "d4").map((t) => [t.title, t.when]), [["Day 1", "done"], ["Day 2", "done"], ["Day 3", "done"], ["Replied", "now"]]);
});

test("a day's stage keeps its day number whatever it's renamed to", () => {
  assert.equal(keepDay("Day 1", "Anime"), "Day 1 · Anime");
  assert.equal(keepDay("Day 4 · LinkedIn 1", "LinkedIn first"), "Day 4 · LinkedIn first");
  assert.equal(keepDay("Day 4 · LinkedIn 1", "Day 4 · LinkedIn DM"), "Day 4 · LinkedIn DM");
  assert.equal(keepDay("Day 4 · LinkedIn 1", "Day 9 · Oops"), "Day 4 · Oops");
  assert.equal(keepDay("Replied", "Interested"), "Interested");
});

test("a link is called something short", () => {
  assert.equal(linkName("YouTube channel", "https://youtube.com/@x"), "YouTube");
  assert.equal(linkName("Video named in the opener", "https://youtube.com/watch?v=1"), "Video");
  assert.equal(linkName("Reel named in the opener", "https://instagram.com/reel/1"), "Reel");
  assert.equal(linkName("Notion page", "https://a.notion.site/x"), "Notion");
  assert.equal(linkName("Notion page (YT 2)", "https://a.notion.site/x"), "Notion · YT 2");
  assert.equal(linkName("Post with the keyword", "https://instagram.com/p/1"), "Post");
  assert.equal(linkName("Clinic Instagram", "https://instagram.com/c"), "Clinic Instagram");
  assert.equal(linkName("Website", "https://clinic.com"), "Website");
  assert.equal(linkName("", "https://www.youtube.com/@doc"), "YouTube");
  assert.equal(linkName("", "https://youtu.be/abc"), "Video");
  assert.equal(linkName("", "https://www.linkedin.com/in/doc"), "LinkedIn");
  assert.equal(linkName("", "https://clinic.com/about"), "clinic.com");
  // only a platform loses its trailing word, and only whole words count
  assert.equal(linkName("Instagram profile", "https://instagram.com/c"), "Instagram");
  assert.equal(linkName("Landing page", "https://clinic.com/l"), "Landing page");
  assert.equal(linkName("Second channel", "https://youtube.com/@b"), "Second channel");
  assert.equal(linkName("Post-op care guide", "https://clinic.com/p"), "Post-op care guide");
  assert.equal(linkName("Notion page 2", "https://a.notion.site/y"), "Notion 2");
  assert.equal(linkName("", "mailto:a@b.com"), "a@b.com");
});

test("a page's handle shows beside its name", () => {
  assert.equal(handleOf("https://www.instagram.com/drtimpearce/"), "@drtimpearce");
  assert.equal(handleOf("https://www.youtube.com/@DrTimPearce"), "@DrTimPearce");
  assert.equal(handleOf("https://www.youtube.com/c/DrTimPearce"), "@DrTimPearce");
  assert.equal(handleOf("https://www.linkedin.com/in/drtimpearce/"), "in/drtimpearce");
  assert.equal(handleOf("https://x.com/drtim"), "@drtim");
  assert.equal(handleOf("https://drtimpearce.com/"), "drtimpearce.com");
  assert.equal(handleOf("mailto:a@b.com"), "a@b.com");
  // a single video or post, a Notion page, a channel id: nothing to show
  assert.equal(handleOf("https://www.youtube.com/watch?v=gwdP1E1uEew"), null);
  assert.equal(handleOf("https://youtu.be/abc"), null);
  assert.equal(handleOf("https://www.youtube.com/channel/UCabc123"), null);
  assert.equal(handleOf("https://www.instagram.com/reel/Cx1/"), null);
  assert.equal(handleOf("https://adorable-tower-3f9.notion.site/3b9b6a2080448080"), null);
  assert.equal(handleOf(""), null);
});

