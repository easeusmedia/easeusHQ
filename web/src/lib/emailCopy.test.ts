import { test } from "node:test";
import assert from "node:assert/strict";
import { emailHtml, plainText } from "./emailCopy.ts";

test("an email copies as Gmail's own formatting", () => {
  const body = "Hey Yara,\n\nContext:\n• Drive **~1M total YouTube views**\n• Engineer <their> Short\n\nYou can [check our work here!](https://easeus.media/)";
  assert.equal(
    emailHtml(body),
    '<div>Hey Yara,</div><div><br></div><div>Context:</div><ul><li>Drive <b>~1M total YouTube views</b></li><li>Engineer &#60;their&#62; Short</li></ul><div><br></div><div>You can <a href="https://easeus.media/">check our work here!</a></div>',
  );
  assert.equal(plainText(body), "Hey Yara,\n\nContext:\n• Drive ~1M total YouTube views\n• Engineer <their> Short\n\nYou can check our work here!");
});
