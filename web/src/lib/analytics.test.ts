import { test } from "node:test";
import assert from "node:assert/strict";
import { daysBetween, isoSeconds, parseReachCsv, previousRange, sumReach } from "./analytics.ts";

test("the previous period is the same length, just before", () => {
  assert.deepEqual(previousRange("2026-09-01", "2026-09-28"), { from: "2026-08-04", to: "2026-08-31" });
  assert.equal(daysBetween("2026-09-27", "2026-10-02").length, 6);
});

test("durations: a Short is a minute, a podcast is an hour", () => {
  assert.equal(isoSeconds("PT59S"), 59);
  assert.equal(isoSeconds("PT1H2M3S"), 3723);
  assert.equal(isoSeconds(undefined), 0);
});

test("a reach file reads either way it writes CTR, and weights it by impressions", () => {
  const csv = "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n20260925,UC1,a,1000,4.5\n20260925,UC1,b,10,50";
  const rows = parseReachCsv(csv);
  assert.deepEqual(rows[0], { day: "2026-09-25", videoId: "a", impressions: 1000, ctr: 0.045 });
  const r = sumReach(rows);
  assert.equal(r.impressions, 1010);
  assert.ok(Math.abs(r.ctr! - (1000 * 0.045 + 10 * 0.5) / 1010) < 1e-9);
  assert.deepEqual(parseReachCsv("nonsense"), []);
});
