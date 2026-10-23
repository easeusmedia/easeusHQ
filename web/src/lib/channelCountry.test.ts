import { test } from "node:test";
import assert from "node:assert/strict";
import { aboutUrlOf, boardCountry, countryIn } from "./channelCountry.ts";

test("a country takes the board's own name where it has one", () => {
  assert.equal(boardCountry("United States"), "USA");
  assert.equal(boardCountry("United Kingdom"), "UK");
  assert.equal(boardCountry("United Arab Emirates"), "UAE");
  assert.equal(boardCountry("Türkiye"), "Türkiye");
  assert.equal(boardCountry(" Australia "), "Australia");
});

test("the country an About page names", () => {
  assert.equal(countryIn('…"countryCode":"IN",…"country":"United States",…'), "United States");
  assert.equal(countryIn('"country":"T\\u00fcrkiye"'), "Türkiye");
  assert.equal(countryIn('"countryCode":"IN"'), null);
  assert.equal(countryIn('"country":""'), null);
});

test("a lead's channel, from its Links or a contact's YouTube", () => {
  const fields = [
    { id: "l", kind: "links" },
    { id: "c", kind: "contacts" },
  ];
  const links = (...urls: string[]) => urls.map((url) => ({ label: "", url }));
  const yt = (value: string) => [{ id: "1", name: "A", role: "", channels: [{ kind: "youtube", value }] }];
  assert.equal(aboutUrlOf({ l: links("https://www.youtube.com/watch?v=x", "https://www.youtube.com/@dramirkaram/videos?si=1") }, fields), "https://www.youtube.com/@dramirkaram/about");
  assert.equal(aboutUrlOf({ l: links("youtube.com/channel/UC123") }, fields), "https://www.youtube.com/channel/UC123/about");
  assert.equal(aboutUrlOf({ c: yt("@PCHMedSpa") }, fields), "https://www.youtube.com/@PCHMedSpa/about");
  assert.equal(aboutUrlOf({ c: yt("https://m.youtube.com/user/someone") }, fields), "https://www.youtube.com/user/someone/about");
  assert.equal(aboutUrlOf({ l: links("https://www.youtube.com/watch?v=x", "YT 1") }, fields), null);
  assert.equal(aboutUrlOf({}, fields), null);
});

test("a channel written as an old youtube.com/name, a channel id or just the name", () => {
  const fields = [
    { id: "l", kind: "links" },
    { id: "c", kind: "contacts" },
  ];
  const links = (...urls: string[]) => urls.map((url) => ({ label: "", url }));
  const yt = (value: string) => [{ id: "1", name: "A", role: "", channels: [{ kind: "youtube", value }] }];
  assert.equal(aboutUrlOf({ l: links("https://www.youtube.com/PCHMedSpa") }, fields), "https://www.youtube.com/PCHMedSpa/about");
  assert.equal(aboutUrlOf({ l: links("youtube.com/PCHMedSpa/videos?si=1") }, fields), "https://www.youtube.com/PCHMedSpa/about");
  assert.equal(aboutUrlOf({ c: yt("UCabcdefghijklmnopqrstuv") }, fields), "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/about");
  assert.equal(aboutUrlOf({ l: links("UCabcdefghijklmnopqrstuv") }, fields), "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/about");
  assert.equal(aboutUrlOf({ c: yt(" PCHMedSpa ") }, fields), "https://www.youtube.com/@PCHMedSpa/about");
  // a bare name is a channel only in a contact's YouTube, and only when it is one
  assert.equal(aboutUrlOf({ l: links("PCHMedSpa") }, fields), null);
  assert.equal(aboutUrlOf({ c: yt("none") }, fields), null);
  assert.equal(aboutUrlOf({ c: yt("PCH Med Spa") }, fields), null);
  // video, search and feed links aren't channels
  for (const url of ["https://youtube.com/shorts/abc", "https://www.youtube.com/playlist?list=1", "https://www.youtube.com/results?search_query=x", "https://www.youtube.com/feed/subscriptions", "https://www.youtube.com/embed/x", "https://youtu.be/abc"])
    assert.equal(aboutUrlOf({ l: links(url) }, fields), null, url);
});
