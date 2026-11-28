import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsIn, channelsOfValues, linkKind, reachable } from "./leadDupes.ts";
import type { Contact } from "./space.ts";

const person = (...channels: [string, string][]): Contact => ({ id: "c", name: "A", role: "", channels: channels.map(([kind, value]) => ({ kind, value })) as Contact["channels"] });

test("a YouTube channel is the same however its link is written", () => {
  const same = ["https://www.youtube.com/@TheDiaryOfACEO/videos", "youtube.com/@thediaryofaceo", "m.youtube.com/@TheDiaryOfACEO?si=x"];
  for (const url of same) assert.deepEqual(channelsIn([{ url }], []), ["yt:@thediaryofaceo"]);
  assert.deepEqual(channelsIn([{ url: "https://youtube.com/channel/UCGq-a57w-aPwyi3pW7XLiHw/featured" }], []), ["yt:channel/ucgq-a57w-apwyi3pw7xlihw"]);
  // a person's YouTube, even as a bare name
  assert.deepEqual(channelsIn([], [person(["youtube", "TheDiaryOfACEO"])]), ["yt:@thediaryofaceo"]);
  // a video isn't a channel
  assert.deepEqual(channelsIn([{ url: "https://www.youtube.com/watch?v=abc" }, { url: "https://youtu.be/abc" }], []), []);
});

test("an Instagram page too, the lead's own or a person's, never a post", () => {
  assert.deepEqual(channelsIn([{ url: "https://www.instagram.com/Dr.Pearce/?hl=en" }], []), ["ig:dr.pearce"]);
  assert.deepEqual(channelsIn([], [person(["instagram", "@Dr.Pearce"])]), ["ig:dr.pearce"]);
  assert.deepEqual(channelsIn([{ url: "https://www.instagram.com/p/Cx123/" }, { url: "https://www.instagram.com/reel/Cx123/" }], []), []);
  // a bare word in the lead's links isn't taken for an Instagram name
  assert.deepEqual(channelsIn([{ url: "drpearce" }], []), []);
  // a YouTube @abc and an Instagram abc are different things
  assert.deepEqual(channelsIn([{ url: "youtube.com/@abc" }, { url: "instagram.com/abc" }], []).sort(), ["ig:abc", "yt:@abc"]);
  assert.equal(linkKind("ig:abc"), "Instagram page");
  assert.equal(linkKind("yt:@abc"), "YouTube channel");
});

test("a stored lead's channels and pages, whatever its properties are called", () => {
  const values = { f1: [{ label: "YouTube channel", url: "https://www.youtube.com/@Abc" }], f2: [person(["youtube", "@Def"], ["instagram", "instagram.com/ghi"])], f3: "youtube.com/@jkl", f4: ["tag"] };
  assert.deepEqual(channelsOfValues(values).sort(), ["ig:ghi", "yt:@abc", "yt:@def"]);
  assert.deepEqual(channelsOfValues(null), []);
});

test("a contact is a person with an email, phone or handle", () => {
  assert.equal(reachable([person(["email", "a@b.co"])]), true);
  assert.equal(reachable([person(["instagram", "@abc"])]), true);
  assert.equal(reachable([person(["youtube", "@abc"])]), false);
  assert.equal(reachable([person(["email", "  "])]), false);
  assert.equal(reachable([]), false);
});
