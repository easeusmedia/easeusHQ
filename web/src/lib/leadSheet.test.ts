import { test } from "node:test";
import assert from "node:assert/strict";
import { channelOf, channelsIn, columnOf, movedValues, shownAs } from "./leadSheet.ts";

test("a pasted detail is told by what it is", () => {
  assert.deepEqual(channelOf("mehta@clinic.in"), { kind: "email", value: "mehta@clinic.in" });
  assert.deepEqual(channelOf("mailto:a@b.co"), { kind: "email", value: "a@b.co" });
  assert.deepEqual(channelOf("+91 98765 43210"), { kind: "phone", value: "+91 98765 43210" });
  assert.equal(channelOf("instagram.com/drmehta")?.kind, "instagram");
  assert.equal(channelOf("https://www.linkedin.com/in/drmehta/")?.kind, "linkedin");
  assert.equal(channelOf("https://twitter.com/drmehta")?.kind, "x");
  assert.equal(channelOf("youtu.be/abc")?.kind, "youtube");
  assert.equal(channelOf("@drmehta")?.kind, "instagram");
  assert.equal(channelOf("drmehta.com")?.value, "https://drmehta.com");
  assert.equal(channelOf("hello there"), null);
  assert.equal(channelOf("2026"), null);
});

test("Facebook and websites both keep the outreach boards' kind, in their own columns", () => {
  const fb = channelOf("https://m.facebook.com/drmehta")!;
  assert.equal(fb.kind, "other");
  assert.equal(columnOf(fb), "facebook");
  assert.equal(columnOf(channelOf("fb.me/drmehta")!), "facebook");
  assert.equal(columnOf(channelOf("drmehta.com")!), "website");
  assert.equal(columnOf({ kind: "email", value: "a@b.co" }), "email");
});

test("a paste of several is split, once each, keeping what wasn't understood", () => {
  const { found, left } = channelsIn("instagram.com/drmehta, mehta@clinic.in\n+91 98765 43210  drmehta.com nonsense mehta@clinic.in");
  assert.deepEqual(
    found.map((c) => c.kind),
    ["instagram", "email", "phone", "other"],
  );
  assert.deepEqual(left, ["nonsense"]);
});

test("digits inside a link or an address stay part of it", () => {
  for (const v of [
    "rahul9876543210@gmail.com",
    "rahul.9876543210@gmail.com",
    "https://www.linkedin.com/in/john-doe-123456789/",
    "https://www.linkedin.com/in/priya-sharma-8b1234567/",
    "facebook.com/profile.php?id=100012345678901",
    "wa.me/919876543210",
    "https://www.google.com/maps/place/Clinic/@19.0759837,72.8776559,15z",
    "https://blog.com/2024-05-12/post",
    "https://youtube.com/watch?v=abc&t=1234567",
  ]) {
    const { found, left } = channelsIn(v);
    assert.equal(found.length, 1, v);
    assert.notEqual(found[0].kind, "phone", v);
    assert.ok(found[0].value.endsWith(v.replace(/^https:\/\//, "")), v);
    assert.deepEqual(left, [], v);
  }
  assert.deepEqual(channelsIn("(555) 123-4567"), { found: [{ kind: "phone", value: "(555) 123-4567" }], left: [] });
  assert.deepEqual(channelsIn("a@b.com,c@d.com").found.map((c) => c.value), ["a@b.com", "c@d.com"]);
});

test("a cell reads a page by its handle", () => {
  assert.equal(shownAs({ kind: "instagram", value: "https://instagram.com/drmehta/" }), "@drmehta");
  assert.equal(shownAs({ kind: "linkedin", value: "https://www.linkedin.com/in/drmehta/" }), "in/drmehta");
  assert.equal(shownAs({ kind: "other", value: "https://www.facebook.com/drmehta" }), "drmehta");
  assert.equal(shownAs({ kind: "other", value: "https://www.facebook.com/share/1Bx7yZ3kQ9/" }), "facebook.com/share/1Bx7yZ3kQ9");
  assert.equal(shownAs({ kind: "other", value: "https://www.facebook.com/people/Dr-Mehta/100012345/" }), "Dr-Mehta");
  assert.equal(shownAs({ kind: "other", value: "https://drmehta.com/about/" }), "drmehta.com/about");
  assert.equal(shownAs({ kind: "phone", value: "+91 98765 43210" }), "+91 98765 43210");
});

test("moved on, each property lands on the one there with its name, and nothing is lost", () => {
  const person = { id: "1", name: "Dr Mehta", role: "Founder", channels: [{ kind: "email" as const, value: "m@c.in" }] };
  const links = [{ label: "", url: "https://drmehta.com" }];
  // a Leads tab to an outreach board: people and links onto that board's own
  const sheet = [
    { id: "c", name: "Contacts", kind: "contacts" },
    { id: "l", name: "Links", kind: "links" },
  ];
  assert.deepEqual(movedValues({ fields: sheet, values: { c: [person], l: links }, notes: "Good fit" }, [{ id: "pc", name: "Contacts", kind: "contacts" }, { id: "pl", name: "Podcast links", kind: "links" }]), {
    values: { pc: [person], pl: links },
    notes: "Good fit",
  });
  // one outreach board to another: a tag by its name; one with no place there goes to the notes
  const from = [
    { id: "t", name: "Trailer", kind: "select", options: [{ id: "y", name: "Yes" }] },
    { id: "s", name: "Subscribers", kind: "text" },
  ];
  const to = [{ id: "t2", name: "trailer", kind: "select", options: [{ id: "y2", name: "yes" }] }];
  assert.deepEqual(movedValues({ fields: from, values: { t: ["y"], s: "12K" }, notes: "" }, to), { values: { t2: ["y2"] }, notes: "Subscribers: 12K" });
  // no links property there: they go to the notes
  assert.equal(movedValues({ fields: sheet, values: { l: links }, notes: "" }, [{ id: "pc", name: "Contacts", kind: "contacts" }]).notes, "Links: https://drmehta.com");
});
