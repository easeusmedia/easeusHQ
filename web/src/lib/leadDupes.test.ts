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

test("site pages, placeholders and other hosts aren't anyone's channel or page", () => {
  const none = [
    "https://www.instagram.com/accounts/login/?next=%2Frevone%2F", "instagram.com/tv/abc", "instagram.com/s/aGlnaGxpZ2h0", "instagram.com/_u/abc", "instagram.com/direct/inbox",
    "help.instagram.com/123", "about.instagram.com/x", "youtube.com/clip/Ugkxabc", "youtube.com/v/abc", "music.youtube.com/browse/VLPL1", "youtube.com/podcasts", "consent.youtube.com/m?continue=x",
  ];
  for (const url of none) assert.deepEqual(channelsIn([{ url }], []), [], url);
  for (const v of ["none", "N/A", "-", "TBA", "yes", "youtube", "---", "."]) {
    assert.deepEqual(channelsIn([], [person(["instagram", v], ["youtube", v])]), [], v);
  }
});

test("one channel however it's addressed, and an Instagram link with an @", () => {
  for (const url of ["youtube.com/c/TheDiaryOfACEO", "youtube.com/user/TheDiaryOfACEO", "https://www.youtube.com/TheDiaryOfACEO", "youtube.com/@TheDiaryOfACEO"]) {
    assert.deepEqual(channelsIn([{ url }], []), ["yt:@thediaryofaceo"], url);
  }
  assert.deepEqual(channelsIn([{ url: "https://www.instagram.com/@dr.pearce" }], []), ["ig:dr.pearce"]);
  // a bare @handle in the lead's own links isn't guessed at
  assert.deepEqual(channelsIn([{ url: "@abc" }], []), []);
});

test("a contact is a person with an email, phone or handle", () => {
  assert.equal(reachable([person(["email", "a@b.co"])]), true);
  assert.equal(reachable([person(["instagram", "@abc"])]), true);
  assert.equal(reachable([person(["youtube", "@abc"])]), false);
  assert.equal(reachable([person(["email", "  "])]), false);
  assert.equal(reachable([]), false);
  for (const v of ["N/A", "-", "none", "tba"]) assert.equal(reachable([person(["instagram", v], ["email", v])]), false, v);
  assert.equal(reachable([person(["phone", "123"])]), false);
});
