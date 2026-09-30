import { test } from "node:test";
import assert from "node:assert/strict";
import { clearsEditor, editorPeople, exportedLinkFor, matchClient, pushesToNotion, sameNotionId, workTaskHome } from "./notionMapping.ts";

const FRAME = "https://f.io/abc";
const DRIVE = "https://drive.google.com/file/d/xyz/view";

test("under review, Exported Link is the Frame.io thread", () => {
  for (const status of ["queued", "editing", "sent_for_approval", "sent_for_client_approval", "revision_requested"] as const) {
    assert.equal(exportedLinkFor({ status, frameioLink: FRAME, driveLink: null }), FRAME);
  }
});

test("once exported or delivered, the Drive link replaces it", () => {
  assert.equal(exportedLinkFor({ status: "final_export_ready", frameioLink: FRAME, driveLink: DRIVE }), DRIVE);
  assert.equal(exportedLinkFor({ status: "delivered_and_uploaded", frameioLink: FRAME, driveLink: DRIVE }), DRIVE);
});

test("a Drive link added early does NOT take the review link off the row", () => {
  // the client is still looking at the Frame.io thread — replacing it before
  // the work is actually delivered would pull the link out from under them
  assert.equal(exportedLinkFor({ status: "sent_for_client_approval", frameioLink: FRAME, driveLink: DRIVE }), FRAME);
});

test("whichever link exists is used when only one is set", () => {
  assert.equal(exportedLinkFor({ status: "editing", frameioLink: null, driveLink: DRIVE }), DRIVE);
  assert.equal(exportedLinkFor({ status: "delivered_and_uploaded", frameioLink: FRAME, driveLink: null }), FRAME);
  assert.equal(exportedLinkFor({ status: "queued", frameioLink: null, driveLink: null }), null);
});

test("only Operations, and not the admin, mirrors into the Editing Queue", () => {
  assert.equal(pushesToNotion({ role: "employee", teamSlug: "production" }), true); // editors
  assert.equal(pushesToNotion({ role: "core", teamSlug: "client-services" }), true); // Jyotsna, Arpit
  assert.equal(pushesToNotion({ role: "admin", teamSlug: "production" }), true); // Abhishek
  assert.equal(pushesToNotion({ role: "admin", teamSlug: null }), false); // Ashmit
  assert.equal(pushesToNotion({ role: "core", teamSlug: "sales" }), false); // Pankaj
  assert.equal(pushesToNotion({ role: "employee", teamSlug: null }), false); // unplaced: fail closed
});

// the real roster, because that's where the near-misses are
const CLIENTS = [
  "The Broker Brunch", "Elle Sera", "Robyn", "Dr Tego", "HUMAIN", "Neelkamal TMT", "Dr Yusra", "Courageous Leaders",
].map((name) => ({ name }));
const client = (title: string) => matchClient(title, CLIENTS)?.name ?? null;

test("a Notion row finds its client by prefix, initials, or the name in the title", () => {
  assert.equal(client("Robyn - Levels"), "Robyn"); // the prefix is the name
  assert.equal(client("CL - Energy - Katie"), "Courageous Leaders"); // initials
  assert.equal(client("BB - Cold Calling"), "The Broker Brunch"); // "The" isn't an initial
  assert.equal(client("Tego - Skin Business"), "Dr Tego"); // prefix inside the name
  assert.equal(client("Yusra Reel"), "Dr Yusra"); // no prefix at all
  assert.equal(client("Elle Sera - Spicules"), "Elle Sera");
});

test("a row we have no client for stays unmatched rather than landing on the wrong one", () => {
  assert.equal(client("Ashmit - Sponsorships"), null);
  assert.equal(client("Dr Ifeoma - Mandelic Acid"), null); // "Dr" must not match Dr Tego/Dr Yusra
  assert.equal(client("Dr - 5 Treatments i will never do"), null);
  assert.equal(client("SRT - Self Centred Leaders"), null); // "Leaders" alone isn't Courageous Leaders
  assert.equal(client(""), null);
});

test("a work task goes to its person's own workbook, the queue for other Operations, nowhere else", () => {
  // Abhishek, Arpit, Jyotsna: their own workbooks, whatever their team
  assert.equal(workTaskHome({ role: "admin", teamSlug: "production", workbookId: "wb-abhishek" }), "workbook");
  // an editor with no workbook: the shared Editing Queue
  assert.equal(workTaskHome({ role: "employee", teamSlug: "production", workbookId: null }), "queue");
  // the admin and Sales: not in Notion at all
  assert.equal(workTaskHome({ role: "admin", teamSlug: null, workbookId: null }), null);
  assert.equal(workTaskHome({ role: "core", teamSlug: "sales", workbookId: null }), null);
});

test("the Editor column, as Notion takes it", () => {
  assert.deepEqual(editorPeople("user-1"), { people: [{ object: "user", id: "user-1" }] });
  assert.deepEqual(editorPeople(null), { people: [] });
});

test("with no account for the assignee, an Editor is cleared only when it's one of ours", () => {
  const known = new Set(["narendra", "sparsh"]);
  // handed on from Narendra to someone without Notion: take Narendra off
  assert.equal(clearsEditor(["narendra"], known), true);
  // someone we don't know (their own unlinked account, or set in Notion): leave it
  assert.equal(clearsEditor(["someone-else"], known), false);
  assert.equal(clearsEditor([], known), false);
});

test("database ids match with or without dashes", () => {
  assert.ok(sameNotionId("c8fe3e3f-bc0b-47bf-8681-e13b1e1eb62b", "c8fe3e3fbc0b47bf8681e13b1e1eb62b"));
  assert.ok(!sameNotionId("c8fe3e3f-bc0b-47bf-8681-e13b1e1eb62b", "d8fe3e3fbc0b47bf8681e13b1e1eb62b"));
  assert.ok(!sameNotionId(null, "c8fe3e3fbc0b47bf8681e13b1e1eb62b"));
});
