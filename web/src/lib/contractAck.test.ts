import { test } from "node:test";
import assert from "node:assert/strict";
import { acknowledgement, mime, type Intake } from "./contractAck.ts";

const form: Intake = {
  contactName: "Andrew Thomas",
  contactEmail: "andrew@example.com",
  whatsapp: "+44 7700 900123",
  entity: "Thomas <Media> Ltd",
  country: "United Kingdom",
  address: "1 High Street, London",
  signatory: { name: "Priya Shah", email: "priya@example.com" },
  paymentMethod: "Net banking",
};

test("the acknowledgement copies what they sent, safely, to them and the signer", () => {
  const a = acknowledgement(form, "GBP");
  assert.deepEqual(a.to, ["andrew@example.com"]);
  assert.deepEqual(a.cc, ["priya@example.com"]);
  assert.match(a.text, /^Hi Andrew,/);
  assert.match(a.text, /Mode of payment: Net banking/);
  assert.match(a.text, /Billing currency: GBP/);
  assert.match(a.text, /send it to priya@example\.com for e-signature/);
  // what they typed can't become markup
  assert.ok(a.html.includes("Thomas &lt;Media&gt; Ltd"));
  assert.ok(!a.html.includes("<Media>"));
  // no long dashes in the wording
  assert.ok(!/[—–]/.test(a.text));
});

test("signing it themselves: no copy to anyone else", () => {
  const a = acknowledgement({ ...form, signatory: null, whatsapp: "" }, "GBP");
  assert.deepEqual(a.cc, []);
  assert.match(a.text, /Signs the agreement: You/);
  assert.ok(!a.text.includes("WhatsApp"));
});

test("the email holds both versions, and encodes a header beyond ASCII", () => {
  const raw = mime({ from: "Easeus Media <easeus.media@gmail.com>", to: ["a@x.com"], cc: ["b@x.com"], subject: "Détails reçus", text: "hello", html: "<p>hello</p>" });
  assert.match(raw, /^From: Easeus Media <easeus\.media@gmail\.com>\r\nTo: a@x\.com\r\nCc: b@x\.com\r\n/);
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.match(raw, /text\/plain; charset=UTF-8/);
  assert.match(raw, /text\/html; charset=UTF-8/);
  assert.ok(raw.includes(Buffer.from("hello").toString("base64")));
});
