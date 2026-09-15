import { test } from "node:test";
import assert from "node:assert/strict";
import { exportedLinkFor, pushesToNotion } from "./notionMapping.ts";

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
