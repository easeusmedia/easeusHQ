import { test } from "node:test";
import assert from "node:assert/strict";
import { clientLogoSrc, decodePicture, isStorablePicture, userPhotoSrc } from "./photos.ts";

test("a picture is its own cached address, which changes when the picture does", () => {
  const a = clientLogoSrc({ slug: "elle-sera", avatarUrl: "data:image/jpeg;base64,AAA" });
  const b = clientLogoSrc({ slug: "elle-sera", avatarUrl: "data:image/jpeg;base64,AAB" });
  assert.match(a!, /^\/clients\/elle-sera\/logo\?v=\w+$/);
  assert.notEqual(a, b);
  assert.match(userPhotoSrc({ id: "u1", avatarUrl: "data:image/png;base64,AAA=" })!, /^\/team\/u1\/photo\?v=\w+$/);
  assert.equal(userPhotoSrc({ id: "u1", avatarUrl: null }), null);
});

test("only a small image can be stored as a photo", () => {
  assert.equal(isStorablePicture("data:image/jpeg;base64,/9j/4AAQ=="), true);
  assert.equal(isStorablePicture("data:text/html;base64,PHNjcmlwdD4="), false);
  assert.equal(isStorablePicture("javascript:alert(1)"), false);
  assert.equal(isStorablePicture(`data:image/jpeg;base64,${"A".repeat(300_001)}`), false);
});

test("a stored picture decodes to its bytes and type", () => {
  const d = decodePicture("data:image/png;base64,aGk=");
  assert.equal(d?.type, "image/png");
  assert.equal(d?.bytes.toString(), "hi");
  assert.equal(decodePicture(null), null);
  // never served as anything but an image, whatever was stored
  assert.equal(decodePicture("data:text/html;base64,PHNjcmlwdD4="), null);
});
