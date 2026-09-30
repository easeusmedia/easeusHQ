import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIDEO_SCORING, dueDay, lateDays, letterOf, scoreVideo, summarise, tierOf, withVideoScoringDefaults, type VideoEntry, type VideoInput } from "./videoScore.ts";

const S = DEFAULT_VIDEO_SCORING;
// a moment in India (26 Sep 2026 is a Saturday, 27 a Sunday, 28 a Monday)
const ist = (s: string) => new Date(`2026-09-${s}+05:30`);
const mv = (when: string, from: string, to: string) => ({ at: ist(when), from, to });
const entry = (over: Partial<VideoEntry> = {}): VideoEntry => ({ kind: "mistake", fromClient: false, count: 1, points: null, weight: 2, repeat: false, ...over });
const video = (over: Partial<VideoInput> = {}): VideoInput => ({
  title: "Reel",
  tags: ["Reel"],
  assignedAt: ist("28T10:00:00"),
  // assigned Monday morning, handed over that afternoon
  moves: [mv("28T10:30:00", "queued", "editing"), mv("28T15:00:00", "editing", "sent_for_approval")],
  grade: "A",
  entries: [],
  ...over,
});

test("letters: S from 95, A+ from 90, A from 80, B from 70, C from 60, D below", () => {
  assert.deepEqual([100, 95, 94.9, 90, 80, 79, 60, 59].map((n) => letterOf(n, S)), ["S", "S", "A+", "A+", "A", "B", "C", "D"]);
  assert.equal(letterOf(null, S), null);
  assert.equal(tierOf(96, S), "S");
  assert.equal(tierOf(91, S), "A+");
  assert.equal(tierOf(89, S), null);
});

test("quality: the grade, less our mistakes (a repeat twice, never more than 10), plus praise, less concerns", () => {
  // an A starts at the top of A's band, so a clean A reads A
  const clean = scoreVideo(video(), S);
  assert.equal(clean.quality.score, 89);
  assert.equal(clean.letter.quality, "A");
  // three typos at 2 each: still an A
  assert.equal(scoreVideo(video({ entries: [entry(), entry(), entry()] }), S).quality.score, 83);
  // a repeat counts twice
  assert.equal(scoreVideo(video({ entries: [entry({ repeat: true })] }), S).quality.score, 85);
  // an S with a pile of mistakes drops one grade at most
  const s = scoreVideo(video({ grade: "S", entries: Array.from({ length: 10 }, () => entry()) }), S);
  assert.equal(s.quality.score, 90);
  assert.equal(s.letter.quality, "A+");
  // praise adds 2, a concern takes 5; tips and creative changes nothing
  assert.equal(scoreVideo(video({ entries: [entry({ kind: "positive" }), entry({ kind: "negative" }), entry({ kind: "guidance" }), entry({ kind: "creative" })] }), S).quality.score, 86);
  // the client's mistakes are Client acceptance's, not Quality's
  assert.equal(scoreVideo(video({ entries: [entry({ fromClient: true })] }), S).quality.score, 89);
  // not graded: no Quality, and no overall
  const ungraded = scoreVideo(video({ grade: null }), S);
  assert.equal(ungraded.quality.score, null);
  assert.equal(ungraded.overall, null);
});

test("due days: the day it's assigned, the next working day after 6 pm, Sundays skipped, extra days for longer work", () => {
  assert.equal(dueDay(ist("28T10:00:00"), 0, S), "2026-09-28");
  assert.equal(dueDay(ist("28T19:00:00"), 0, S), "2026-09-29");
  // Saturday evening: due Monday
  assert.equal(dueDay(ist("26T19:00:00"), 0, S), "2026-09-28");
  // a podcast gets a working day more
  assert.equal(dueDay(ist("26T10:00:00"), 1, S), "2026-09-28");
  // due Saturday, handed over Monday: one working day late (Sunday skipped)
  assert.equal(lateDays("2026-09-26", ist("28T12:00:00"), S), 1);
  assert.equal(lateDays("2026-09-28", ist("28T23:00:00"), S), 0);
});

test("efficiency: 100 on time; less 5 a late day, 5 a revision of ours, 5 a day a revision is late", () => {
  assert.equal(scoreVideo(video(), S).efficiency.score, 100);
  // handed over Tuesday instead of Monday
  assert.equal(scoreVideo(video({ moves: [mv("29T11:00:00", "editing", "sent_for_approval")] }), S).efficiency.score, 95);
  // a podcast has until Tuesday
  assert.equal(scoreVideo(video({ tags: ["Podcast editing"], moves: [mv("29T11:00:00", "editing", "sent_for_approval")] }), S).efficiency.score, 100);
  // one revision of ours, back the same day: 95; back the next day: 90
  const back = (when: string) => [
    mv("28T15:00:00", "editing", "sent_for_approval"),
    mv("28T16:00:00", "sent_for_approval", "revision_requested"),
    mv("28T16:30:00", "revision_requested", "editing"),
    mv(when, "editing", "sent_for_approval"),
  ];
  const sameDay = scoreVideo(video({ moves: back("28T17:30:00") }), S);
  assert.equal(sameDay.efficiency.score, 95);
  assert.equal(sameDay.efficiency.rounds[0].hours, 1);
  assert.equal(scoreVideo(video({ moves: back("29T12:00:00") }), S).efficiency.score, 90);
  // not handed over yet: nothing to score
  assert.equal(scoreVideo(video({ moves: [mv("28T10:30:00", "queued", "editing")] }), S).efficiency.score, null);
});

test("client acceptance: 100 in one go; less 5 a creative change, 10 a mistake; pending until it reaches the client", () => {
  const withClient = [mv("28T15:00:00", "editing", "sent_for_approval"), mv("28T18:00:00", "sent_for_approval", "sent_for_client_approval")];
  assert.equal(scoreVideo(video({ moves: withClient }), S).client.score, 100);
  assert.equal(scoreVideo(video({ moves: withClient, entries: [entry({ kind: "creative", fromClient: true }), entry({ fromClient: true })] }), S).client.score, 85);
  // our own creative notes don't touch it
  assert.equal(scoreVideo(video({ moves: withClient, entries: [entry({ kind: "creative" })] }), S).client.score, 100);
  assert.equal(scoreVideo(video(), S).client.score, null);
  // a revision the client asked for isn't one of ours: no revision penalty
  const clientRound = [...withClient, mv("29T10:00:00", "sent_for_client_approval", "revision_requested"), mv("29T12:00:00", "editing", "sent_for_approval")];
  const r = scoreVideo(video({ moves: clientRound }), S);
  assert.equal(r.efficiency.ours, 0);
  assert.equal(r.efficiency.score, 100);
});

test("overall: quality 50, efficiency 25, client 25; a pending part's share goes to the others", () => {
  const withClient = [mv("28T15:00:00", "editing", "sent_for_approval"), mv("28T18:00:00", "sent_for_approval", "sent_for_client_approval")];
  // 89, 100, 90 → 92
  assert.equal(scoreVideo(video({ moves: withClient, entries: [entry({ kind: "mistake", fromClient: true })] }), S).overall, 92);
  // client pending: 89 × 2/3 + 100 × 1/3
  assert.equal(scoreVideo(video(), S).overall, 92.7);
});

test("an editor's stretch: averages of what's scored, and their S and A+ videos", () => {
  const sum = summarise([scoreVideo(video({ grade: "S" }), S), scoreVideo(video({ grade: "A" }), S), scoreVideo(video({ grade: null }), S)], S);
  assert.equal(sum.videos, 3);
  assert.equal(sum.graded, 2);
  assert.equal(sum.quality, 94.5);
  assert.equal(sum.s, 1);
  assert.equal(sum.aPlus, 0);
});

test("saved settings keep the defaults for anything they don't set", () => {
  const s = withVideoScoringDefaults({ lateDay: 10, bands: { S: 97 } });
  assert.equal(s.lateDay, 10);
  assert.deepEqual(s.bands, { S: 97, "A+": 90, A: 80, B: 70, C: 60 });
  assert.equal(s.types.Trailer.days, 2);
});
