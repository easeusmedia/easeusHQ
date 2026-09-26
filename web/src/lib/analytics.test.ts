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

test("an Instagram scrape becomes a dashboard: dated, pinned old posts left out, views from plays", async () => {
  const { instagramDashboard } = await import("./instagram.ts");
  const posts = [
    { id: "a", type: "Video", productType: "clips", timestamp: "2026-09-21T08:42:13.000Z", likesCount: 11, commentsCount: 0, videoPlayCount: 818, videoViewCount: 392 },
    { id: "b", type: "Image", timestamp: "2026-09-10T08:00:00.000Z", likesCount: 30, commentsCount: 2 },
    { id: "c", type: "Video", productType: "clips", timestamp: "2026-08-20T08:00:00.000Z", likesCount: 5, commentsCount: 1, videoPlayCount: 400 },
    // pinned, a year old
    { id: "d", type: "Video", productType: "clips", timestamp: "2025-06-30T07:00:00.000Z", likesCount: 227, commentsCount: 13, videoPlayCount: 32404 },
  ];
  const d = instagramDashboard("courageous_leaders", { username: "courageous_leaders", followersCount: 1000 }, posts, "2026-09-26T00:00:00Z", "2026-08-30", "2026-09-26");
  assert.deepEqual(d.rows.map((r) => [r.id, r.kind, r.stats.views]), [["a", "Reel", 818], ["b", "Post", null]]);
  const m = Object.fromEntries(d.metrics.map((x) => [x.key, [x.value, x.previous]]));
  assert.deepEqual(m.views, [818, 400]);
  assert.deepEqual(m.posts, [2, 1]);
  assert.equal(m.engagement[0], (11 + 0 + 30 + 2) / 2 / 1000);
});
