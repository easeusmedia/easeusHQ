import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsIn, channelsOfValues, reachable } from "./leadDupes.ts";
import type { Contact } from "./space.ts";

const person = (...channels: [string, string][]): Contact => ({ id: "c", name: "A", role: "", channels: channels.map(([kind, value]) => ({ kind, value })) as Contact["channels"] });

test("a channel is the same however its link is written", () => {
  const same = ["https://www.youtube.com/@TheDiaryOfACEO/videos", "youtube.com/@thediaryofaceo", "m.youtube.com/@TheDiaryOfACEO?si=x"];
  for (const url of same) assert.deepEqual(channelsIn([{ url }], []), ["@thediaryofaceo"]);
  assert.deepEqual(channelsIn([{ url: "https://youtube.com/channel/UCGq-a57w-aPwyi3pW7XLiHw/featured" }], []), ["channel/ucgq-a57w-apwyi3pw7xlihw"]);
  // a person's YouTube, even as a bare name
  assert.deepEqual(channelsIn([], [person(["youtube", "TheDiaryOfACEO"])]), ["@thediaryofaceo"]);
  // a video, or another site, isn't a channel
  assert.deepEqual(channelsIn([{ url: "https://www.youtube.com/watch?v=abc" }, { url: "https://youtu.be/abc" }, { url: "instagram.com/x" }], []), []);
});

test("a stored lead's channels, whatever its properties are called", () => {
  const values = { f1: [{ label: "YouTube channel", url: "https://www.youtube.com/@Abc" }], f2: [person(["youtube", "@Def"])], f3: "youtube.com/@ghi", f4: ["tag"] };
  assert.deepEqual(channelsOfValues(values).sort(), ["@abc", "@def"]);
  assert.deepEqual(channelsOfValues(null), []);
});

test("a contact is a person with an email, phone or handle", () => {
  assert.equal(reachable([person(["email", "a@b.co"])]), true);
  assert.equal(reachable([person(["instagram", "@abc"])]), true);
  assert.equal(reachable([person(["youtube", "@abc"])]), false);
  assert.equal(reachable([person(["email", "  "])]), false);
  assert.equal(reachable([]), false);
});
