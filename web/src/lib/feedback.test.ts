import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFeedback, FEEDBACK_MAX } from "./feedback.ts";

test("feedback is trimmed, named if a name was given", () => {
  assert.deepEqual(checkFeedback({ name: "  Elle ", message: " Love the reels ", trap: "" }), { name: "Elle", message: "Love the reels" });
  assert.deepEqual(checkFeedback({ name: "", message: "ok", trap: "" }), { name: null, message: "ok" });
});

test("empty, oversized, or bot-filled feedback is refused", () => {
  assert.ok("error" in checkFeedback({ name: "", message: "   ", trap: "" }));
  assert.ok("error" in checkFeedback({ name: "", message: "x".repeat(FEEDBACK_MAX + 1), trap: "" }));
  assert.ok("error" in checkFeedback({ name: "", message: "hi", trap: "http://spam" }));
});
