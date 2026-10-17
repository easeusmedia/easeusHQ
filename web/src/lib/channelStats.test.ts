import { test } from "node:test";
import assert from "node:assert/strict";
import { channelOf, instagramOf, median, statsOf } from "./channelStats.ts";

test("a typical upload's views: the middle, not thrown by one hit", () => {
  assert.equal(median([]), null);
  assert.equal(median([300, 12000, 400]), 400);
  assert.equal(median([100, 200, 300, 400]), 250);
});

test("the channel comes from the lead's links, by label first", () => {
  const fields = [{ id: "l", kind: "links" }];
  assert.deepEqual(channelOf({ l: [{ label: "Notion page", url: "https://notion.so/x" }, { label: "YouTube channel", url: " https://www.youtube.com/@drx " }] }, fields), { platform: "youtube", url: "https://www.youtube.com/@drx" });
  assert.deepEqual(channelOf({ l: [{ label: "Instagram", url: "https://www.instagram.com/dry/" }] }, fields), { platform: "instagram", url: "https://www.instagram.com/dry/" });
  assert.equal(channelOf({ l: [{ label: "Video named in the opener", url: "https://www.youtube.com/watch?v=1" }] }, fields), null);
});

test("a YouTube read: subscribers, typical views and the latest first", () => {
  const s = statsOf("youtube", [
    { title: "Old", url: "u1", viewCount: 100, date: "2026-09-01", numberOfSubscribers: 20400, channelAvatarUrl: "https://yt3.ggpht.com/abc=s900-c-k-c0x00ffffff-no-rj" },
    { title: "New", url: "u2", viewCount: 900, date: "2026-10-10" },
    { title: "Mid", url: "u3", viewCount: 352, date: "2026-09-20" },
  ]);
  assert.equal(s?.followers, 20400);
  assert.equal(s?.typicalViews, 352);
  assert.equal(s?.recent[0].title, "New");
  assert.equal(s?.lastUploadAt, "2026-10-10");
  assert.equal(s?.avatar, "https://yt3.ggpht.com/abc=s128-c-k-c0x00ffffff-no-rj");
});

test("an Instagram read: followers and the reels' usual plays", () => {
  const s = statsOf("instagram", [{ followersCount: 5100, profilePicUrl: "https://cdn/pic.jpg", profilePicUrlHD: "https://cdn/hd.jpg", latestPosts: [{ caption: "Reel one\nmore", url: "p1", timestamp: "2026-10-01", videoPlayCount: 800 }, { caption: "Photo", url: "p2", timestamp: "2026-10-05" }] }]);
  assert.equal(s?.followers, 5100);
  assert.equal(s?.typicalViews, 800);
  assert.equal(s?.recent[0].title, "Photo");
  assert.equal(s?.recent[1].title, "Reel one");
  assert.equal(s?.avatar, "https://cdn/pic.jpg");
});

test("the lead's Instagram, from a link or a contact", () => {
  const fields = [{ id: "l", kind: "links" }, { id: "c", kind: "contacts" }];
  assert.equal(instagramOf({ l: [{ label: "Instagram", url: "https://www.instagram.com/dr.y/" }] }, fields), "https://www.instagram.com/dr.y/");
  assert.equal(instagramOf({ l: [{ label: "Reel named in the opener", url: "https://www.instagram.com/reel/abc/" }] }, fields), null);
  assert.equal(instagramOf({ c: [{ id: "1", name: "Dr Y", role: "", channels: [{ kind: "instagram", value: "@dr_y" }] }] }, fields), "https://www.instagram.com/dr_y/");
  assert.equal(instagramOf({}, fields), null);
});
