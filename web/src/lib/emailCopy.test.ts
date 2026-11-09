import { test } from "node:test";
import assert from "node:assert/strict";
import { emailHtml, plainText } from "./emailCopy.ts";

test("an email copies as Gmail's own formatting, a margin between paragraphs and never an empty line", () => {
  const body = "Hey Yara,\n\nI know you're busy.\nWatched your episode.\n\n\nContext:\n• Drive **~1M total YouTube views**\n• Engineer <their> Short\n\nYou can [check our work here!](https://easeus.media/)\n";
  const P = '<p style="margin:0 0 1em">';
  assert.equal(
    emailHtml(body),
    `<div dir="ltr" style="font-size:small;color:#222222">${P}Hey Yara,</p>${P}I know you're busy.<br>Watched your episode.</p>${P}Context:</p><ul style="margin:0 0 1em"><li>Drive <b>~1M total YouTube views</b></li><li>Engineer &#60;their&#62; Short</li></ul>${P}You can <a href="https://easeus.media/">check our work here!</a></p></div>`,
  );
  assert.equal(plainText(body), "Hey Yara,\n\nI know you're busy.\nWatched your episode.\n\n\nContext:\n• Drive ~1M total YouTube views\n• Engineer <their> Short\n\nYou can check our work here!\n");
});
