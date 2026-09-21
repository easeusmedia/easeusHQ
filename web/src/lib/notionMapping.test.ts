import { test } from "node:test";
import assert from "node:assert/strict";
import { exportedLinkFor, matchClient, pushesToNotion } from "./notionMapping.ts";

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
  assert.equal(pushesToNotion({ role: "employee", teamSlug: "operations" }), true); // editors
  assert.equal(pushesToNotion({ role: "core", teamSlug: "operations" }), true); // Jyotsna, Arpit, Abhishek
  assert.equal(pushesToNotion({ role: "admin", teamSlug: "operations" }), false); // Ashmit
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
