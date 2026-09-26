import { test } from "node:test";
import assert from "node:assert/strict";
import { databaseIdFrom } from "./notionMapping.ts";

test("a Notion database is found however it's pasted", () => {
  const id = "c8fe3e3f-bc0b-47bf-8681-e13b1e1eb62b";
  // the address bar: title, then the id, then a view
  assert.equal(databaseIdFrom("https://www.notion.so/easeus/Editing-Queue-c8fe3e3fbc0b47bf8681e13b1e1eb62b?v=1234"), id);
  // the id alone, dashed or not
  assert.equal(databaseIdFrom(id), id);
  assert.equal(databaseIdFrom("c8fe3e3fbc0b47bf8681e13b1e1eb62b"), id);
  // and nothing that isn't one
  assert.equal(databaseIdFrom("https://www.notion.so/easeus/Editing-Queue"), null);
  assert.equal(databaseIdFrom(""), null);
});

test("a title whose last letters are hex doesn't shift the id", () => {
  // "Editing-Queue-" ends in e, which is a hex digit
  assert.equal(
    databaseIdFrom("https://www.notion.so/Editing-Queue-c8fe3e3fbc0b47bf8681e13b1e1eb62b"),
    "c8fe3e3f-bc0b-47bf-8681-e13b1e1eb62b"
  );
  assert.equal(
    databaseIdFrom("https://www.notion.so/8f7047485f6649f58a3fe6a1c8f0e79a?v=abc&p=def"),
    "8f704748-5f66-49f5-8a3f-e6a1c8f0e79a"
  );
});
