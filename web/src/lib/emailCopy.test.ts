import { test } from "node:test";
import assert from "node:assert/strict";
import { emailHtml, marked, plainText } from "./emailCopy.ts";

test("an email copies as Gmail's own formatting, a margin between paragraphs and never an empty line", () => {
  const body = "Hey Yara,\n\nI know you're busy.\nWatched your episode.\n\n\nContext:\n• Drive **~1M total YouTube views**\n• Engineer <their> Short\n\nYou can [check our work here!](https://easeus.media/)\n";
  const P = '<p style="margin:0 0 1em">';
  assert.equal(
    emailHtml(body),
    `<div dir="ltr" style="font-size:small;color:#222222">${P}Hey Yara,</p>${P}I know you're busy.<br>Watched your episode.</p>${P}Context:</p><ul style="margin:0 0 1em"><li>Drive <b>~1M total YouTube views</b></li><li>Engineer &#60;their&#62; Short</li></ul>${P}You can <a href="https://easeus.media/">check our work here!</a></p></div>`,
  );
  assert.equal(plainText(body), "Hey Yara,\n\nI know you're busy.\nWatched your episode.\n\n\nContext:\n• Drive ~1M total YouTube views\n• Engineer <their> Short\n\nYou can check our work here!\n");
});

test("a copy brought in as plain words gets the house's links and bold, and the template's", () => {
  const copy = "• Drive ~1M total YouTube views\nNo increase in recording. No change in guests.\nYou can check our work here!\nI recorded a 5-minute audit for you.\nMessage me on LinkedIn.\n\nAshmit\nLinkedIn";
  const out = marked(copy);
  assert.equal(
    out,
    "• Drive **~1M total YouTube views**\n**No increase in recording. No change in guests.**\nYou can [check our work here!](https://easeus.media/)\nI recorded a **5-minute audit** for you.\nMessage me on LinkedIn.\n\nAshmit\n[LinkedIn](https://www.linkedin.com/in/ashmitshahi/)",
  );
  // already marked: nothing changes
  assert.equal(marked(out), out);
  // the template's own marks, on the same words in the copy; a few letters never
  assert.equal(marked("Our big launch is here", "Our **big launch** is [here](https://x.com)"), "Our **big launch** is here");
});
