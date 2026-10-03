import { test } from "node:test";
import assert from "node:assert/strict";
import { compressHistory, mentioned, needsDeepModel, TOPICS, type Turn, pickByName } from "./assistant.ts";

const turns = (n: number): Turn[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: i % 2 ? `Answer ${i} ${"x".repeat(2000)}` : `Question ${i}` }) as Turn);

test("recent exchanges are kept (answers clipped); older ones become a line each", () => {
  const { earlier, recent } = compressHistory(turns(10));
  assert.equal(recent.length, 6);
  assert.equal(recent[0].role, "user");
  assert.ok(recent[1].text.length <= 901);
  assert.equal(earlier?.split("\n").length, 2);
  assert.ok(earlier?.startsWith("- Q: Question 0 → A: Answer 1"));
});

test("a short conversation is sent whole, and never opens with an answer", () => {
  assert.deepEqual(compressHistory(turns(2)).earlier, null);
  const { recent } = compressHistory(turns(7), { keep: 6 });
  assert.equal(recent[0].role, "user");
});

test("Sonnet only for analysis; Haiku for looking things up", () => {
  assert.equal(needsDeepModel("What is Sparsh working on?"), false);
  assert.equal(needsDeepModel("Show me the pending tasks"), false);
  assert.equal(needsDeepModel("Analyse Narendra's mistakes and suggest how he can improve"), true);
  assert.equal(needsDeepModel("Why is turnaround slower this month?"), true);
});

test("names are matched as whole words, by full name or first name", () => {
  const people = [{ name: "Narendra Mehta" }, { name: "Sparsh" }, { name: "Arpit" }, { name: "Al" }];
  assert.deepEqual(mentioned("How did narendra do last month?", people).map((p) => p.name), ["Narendra Mehta"]);
  assert.deepEqual(mentioned("sparsh's tasks", people).map((p) => p.name), ["Sparsh"]);
  assert.deepEqual(mentioned("Show all pending work", people), []);
  const clients = [{ name: "The Broker Brunch" }, { name: "Dr Tego" }, { name: "Elle Sera" }];
  assert.deepEqual(mentioned("What's the weather today?", clients), []);
  assert.deepEqual(mentioned("How is the broker account doing? And tego?", clients).map((c) => c.name), ["The Broker Brunch", "Dr Tego"]);
  assert.deepEqual(TOPICS.filter((t) => t.test.test("Who has the most pending work?")).map((t) => t.key), ["workload"]);
  assert.deepEqual(TOPICS.filter((t) => t.test.test("What needs my attention today?")).map((t) => t.key), ["workload"]);
});

test("the assistant finds one thing by name, and asks when it can't tell", () => {
  const stages = [
    { id: "1", name: "Shortlisted", where: "Core" },
    { id: "2", name: "Shortlisted", where: "Dream (Core Offer)" },
    { id: "3", name: "Shortlisted", where: "Amplifier" },
    { id: "4", name: "Shortlisted again", where: "Core" },
  ];
  // an exact name beats one that only contains it; two alike need saying which
  assert.match(pickByName(stages, "shortlisted", "stage") as string, /^Which stage\? /);
  // "Core" is a board, and also part of another board's name: the exact board wins
  assert.equal((pickByName(stages, "Shortlisted", "stage", "Core") as { id: string }).id, "1");
  assert.equal((pickByName(stages, "Shortlisted", "stage", "dream") as { id: string }).id, "2");
  assert.equal((pickByName(stages, "again", "stage") as { id: string }).id, "4");
  assert.equal((pickByName(stages, "3", "stage") as { id: string }).id, "3");
  assert.match(pickByName(stages, "Won", "stage") as string, /^There's no stage called "Won"/);
});
