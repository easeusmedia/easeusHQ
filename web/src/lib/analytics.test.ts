import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, instagramUsername, isoSeconds, previousRange, socialLink, youtubeRef } from "./analytics.ts";

test("the previous period is the same length, just before", () => {
  assert.deepEqual(previousRange("2026-09-01", "2026-09-28"), { from: "2026-08-04", to: "2026-08-31" });
  assert.equal(daysBetween("2026-09-27", "2026-10-02").length, 6);
});

test("durations: a Short is a minute, a podcast is an hour", () => {
  assert.equal(isoSeconds("PT59S"), 59);
  assert.equal(isoSeconds("PT1H2M3S"), 3723);
  assert.equal(isoSeconds(undefined), 0);
});

test("a YouTube channel from however it's pasted", () => {
  assert.deepEqual(youtubeRef("https://www.youtube.com/channel/UC2kZ-x8fDHKEVb222qpQ_NQ"), { id: "UC2kZ-x8fDHKEVb222qpQ_NQ" });
  assert.deepEqual(youtubeRef("UC2kZ-x8fDHKEVb222qpQ_NQ"), { id: "UC2kZ-x8fDHKEVb222qpQ_NQ" });
  assert.deepEqual(youtubeRef("https://youtube.com/@CourageousLeaders/videos"), { handle: "CourageousLeaders" });
  assert.deepEqual(youtubeRef("@elle.sera"), { handle: "elle.sera" });
  assert.deepEqual(youtubeRef("https://www.youtube.com/user/robyn"), { username: "robyn" });
  assert.equal(youtubeRef("not a channel at all"), null);
});

test("an Instagram username from a link or a handle", () => {
  assert.equal(instagramUsername("https://www.instagram.com/courageous_leaders/?hl=en"), "courageous_leaders");
  assert.equal(instagramUsername("@Dr.Tego"), "dr.tego");
  assert.equal(instagramUsername("https://www.instagram.com/reel/abc123/"), null);
  assert.equal(socialLink([{ label: "IG", url: "https://instagram.com/x" }], "instagram.com"), "https://instagram.com/x");
  assert.equal(socialLink(null, "instagram.com"), null);
});
