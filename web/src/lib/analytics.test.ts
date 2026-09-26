import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDashboard, daysBetween, instagramUsername, lastWeek, previousRange, socialLink, youtubeRef, type Item } from "./analytics.ts";

test("the previous period is the same length, just before", () => {
  assert.deepEqual(previousRange("2026-09-01", "2026-09-28"), { from: "2026-08-04", to: "2026-08-31" });
  assert.equal(daysBetween("2026-09-27", "2026-10-02").length, 6);
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

test("last week is Monday to Sunday, whatever day it is now", () => {
  assert.deepEqual(lastWeek("2026-09-26"), { from: "2026-09-14", to: "2026-09-20" }); // a Saturday
  assert.deepEqual(lastWeek("2026-09-28"), { from: "2026-09-21", to: "2026-09-27" }); // a Monday
  assert.deepEqual(lastWeek("2026-09-27"), { from: "2026-09-14", to: "2026-09-20" }); // a Sunday
});

const item = (o: Partial<Item>): Item => ({
  externalId: "x", clientId: "c1", platform: "youtube", title: "t", url: "u", thumbnail: null, kind: "Video",
  published: "2026-09-15", views: 0, likes: 0, comments: 0, ...o,
});

test("a client's dashboard: this range against the one before, engagement per platform", () => {
  const items = [
    item({ externalId: "a", published: "2026-09-24", views: 37, likes: 2 }),
    item({ externalId: "b", kind: "Short", published: "2026-09-20", views: 1200, likes: 40, comments: 3 }),
    item({ externalId: "c", published: "2026-08-15", views: 500, likes: 10, comments: 1 }),
  ];
  const acct = { name: "Robyn", image: null, url: "u", followers: 10600, totalViews: 91119, totalPosts: 62 };
  const d = buildDashboard("youtube", acct, items, "2026-09-26T00:00:00Z", "2026-08-30", "2026-09-26");
  const m = Object.fromEntries(d.metrics.map((x) => [x.key, [x.value, x.previous]]));
  assert.deepEqual(m.views, [1237, 500]);
  assert.deepEqual(m.posts, [2, 1]);
  assert.equal(m.engagement[0], 45 / 1237);
  const ig = buildDashboard("instagram", { ...acct, followers: 1000 }, items.map((i) => ({ ...i, platform: "instagram" as const })), "", "2026-08-30", "2026-09-26");
  assert.equal(ig.metrics.find((x) => x.key === "engagement")!.value, 45 / 2 / 1000);
});
