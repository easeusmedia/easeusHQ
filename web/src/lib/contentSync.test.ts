import { test } from "node:test";
import assert from "node:assert/strict";
import { addressKey, channelUrl, igRow, ytClient, ytRow } from "./contentSync.ts";

test("scraped Instagram posts become rows: reels by plays, photos without views", () => {
  const reel = igRow({ id: "a", type: "Video", productType: "clips", timestamp: "2026-09-21T08:42:13.000Z", likesCount: 11, commentsCount: 0, videoPlayCount: 818, videoViewCount: 392, caption: "Line one\\nmore", url: "https://www.instagram.com/p/x/" });
  assert.equal(reel?.kind, "Reel");
  assert.equal(reel?.views, 818);
  const photo = igRow({ id: "b", type: "Sidecar", timestamp: "2026-09-10T08:00:00.000Z", likesCount: 30 });
  assert.equal(photo?.kind, "Carousel");
  assert.equal(photo?.views, null);
  assert.equal(igRow({ id: "c" }), null); // no date, no row
});

test("scraped YouTube videos become rows, and find their client", () => {
  const v = ytRow({ id: "A9D", type: "video", date: "2026-09-24T15:01:29.000Z", viewCount: 37, likes: 2, commentsCount: 0, duration: "00:04:19" });
  assert.equal(v?.kind, "Video");
  assert.equal(ytRow({ id: "s", type: "shorts", date: "2026-09-20T10:00:00.000Z" })?.kind, "Short");
  const map = { [addressKey(channelUrl("@girlnamedrobyn")!)]: "robyn", [addressKey(channelUrl("UC2kZ-x8fDHKEVb222qpQ_NQ")!)]: "cl" };
  assert.equal(ytClient({ id: "1", inputChannelUrl: "https://www.youtube.com/@girlnamedrobyn/videos" }, map), "robyn");
  assert.equal(ytClient({ id: "2", channelUrl: "https://youtube.com/channel/UC2kZ-x8fDHKEVb222qpQ_NQ" }, map), "cl");
  assert.equal(ytClient({ id: "3", channelUrl: "https://www.youtube.com/channel/UCother" }, map), undefined);
});
