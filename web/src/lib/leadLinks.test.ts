import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchable, fromContacts, hinted, linkToRead, personOf, publicIp, publicLookup, readLeads, realEmail, siteDetails, toContacts, youtubeAbout } from "./leadLinks.ts";
import { detailsOf } from "./linkedPages.ts";

test("only public addresses are fetched: no network's own, no other port, no login", () => {
  for (const ip of ["8.8.8.8", "104.18.32.7", "2606:4700::1111", "2a00:1450:4009:81f::200e"]) assert.equal(publicIp(ip), true, ip);
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "64:ff9b::7f00:1",
    "2001:db8::1",
    "2002:7f00:1::",
    "not an ip",
  ])
    assert.equal(publicIp(ip), false, ip);
  assert.equal(fetchable("https://www.glowclinic.com/contact?x=1")?.hostname, "www.glowclinic.com");
  assert.ok(fetchable("http://8.8.8.8/"));
  for (const url of [
    "http://localhost:3000/",
    "http://localhost/",
    "http://printer.local/",
    "http://db.internal/",
    "http://intranet/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://[::1]/",
    "http://[::ffff:7f00:1]/",
    "http://169.254.169.254/latest/meta-data/",
    "https://glowclinic.com:8443/",
    "https://user:pass@glowclinic.com/",
    "ftp://glowclinic.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ])
    assert.equal(fetchable(url), null, url);
});

test("a name is checked as the connection looks it up, so it can't answer differently in between", async () => {
  const ask = (all: boolean) => new Promise<string | undefined>((ok) => publicLookup("localhost", { all }, (err) => ok(err?.code)));
  assert.equal(await ask(false), "EACCES");
  assert.equal(await ask(true), "EACCES");
});

test("which links are read, and as what", () => {
  assert.deepEqual(linkToRead("https://adorable-tower-3f9.notion.site/3bfb6a20804480d49ccde48bb0028c23"), { kind: "notion", url: "https://adorable-tower-3f9.notion.site/3bfb6a20804480d49ccde48bb0028c23" });
  assert.deepEqual(linkToRead("https://www.youtube.com/@Doctorly/videos"), { kind: "youtube", url: "https://www.youtube.com/@Doctorly/about" });
  assert.deepEqual(linkToRead("https://docs.google.com/document/d/1AbC-d_9/edit?usp=sharing"), { kind: "doc", url: "https://docs.google.com/document/d/1AbC-d_9/export?format=txt" });
  assert.deepEqual(linkToRead("https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0"), { kind: "doc", url: "https://docs.google.com/spreadsheets/d/1XyZ/export?format=csv" });
  assert.deepEqual(linkToRead("https://linktr.ee/drkim"), { kind: "site", url: "https://linktr.ee/drkim" });
  // sign-in walls, videos and posts, a Notion page without an id
  for (const url of ["https://www.instagram.com/drkim/", "https://www.linkedin.com/in/drkim/", "https://x.com/drkim", "https://www.tiktok.com/@drkim", "https://www.facebook.com/drkim", "https://www.youtube.com/watch?v=abc", "https://youtu.be/abc", "https://www.notion.so/", "mailto:a@b.com", "YT 1"])
    assert.equal(linkToRead(url), null, url);
});

test("a site's emails, phones and profiles; junk addresses, share links and the platforms' own left out", () => {
  const html = `<html><head><script>var dsn="https://abc123@o1.ingest.sentry.io/1"; var u = "user@domain.com";</script>
    <script type="application/ld+json">{"@type":"MedicalClinic","email":"hello@glowclinic.com","sameAs":["https:\\/\\/www.linkedin.com\\/in\\/jane-kim-md\\/"]}</script></head>
    <body><img src="logo@2x.png"><a href="mailto:Info@GlowClinic.com?subject=Hi">Email us</a>
    <a href="tel:+44%2020%207946%200958">Call</a> Write to jane [at] glowclinic [dot] com or noreply@glowclinic.com
    <a href="https://www.instagram.com/glowclinic/">IG</a> <a href="https://www.instagram.com/p/Cx1/">a post</a> <a href="https://twitter.com/intent/tweet?url=x">share</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a> <a href="https://www.instagram.com/wix">made with Wix</a> <a href="https://x.com/GlowClinic">X</a>
    <a href="https://www.tiktok.com/@glowclinic">TikTok</a> <a href="/about-us">About</a> <a href="/contact#form">Contact us</a></body></html>`;
  const s = siteDetails(html, "https://www.glowclinic.com/");
  assert.deepEqual(s.details.emails, ["info@glowclinic.com", "jane@glowclinic.com", "hello@glowclinic.com"]);
  assert.deepEqual(s.details.phones, ["+442079460958"]);
  assert.deepEqual(s.details.instagram, ["https://www.instagram.com/glowclinic/"]);
  assert.deepEqual(s.details.linkedin, ["https://www.linkedin.com/in/jane-kim-md/"]);
  assert.deepEqual(s.details.x, ["https://x.com/glowclinic"]);
  assert.deepEqual(s.details.tiktok, ["https://www.tiktok.com/@glowclinic"]);
  // it gave an email: no other page is read
  assert.equal(s.next, undefined);
  // with none, its contact page (same site, before about)
  assert.equal(siteDetails(`<a href="https://other.com/contact">c</a><a href="/about">About</a><a href="/contact#form">Contact us</a>`, "https://www.glowclinic.com/").next, "https://www.glowclinic.com/contact");
  assert.equal(siteDetails(`<a href="/features/contact-forms">Contact</a>`, "https://linktr.ee/drkim").next, undefined);
  for (const e of ["logo@2x.png", "a@example.com", "abc123@o1.ingest.sentry.io", "x@sentry-next.wixpress.com", "noreply@glow.com", "user@domain.com", "0123456789abcdef0123456789abcdef@x.com"]) assert.equal(realEmail(e), false, e);
  assert.equal(realEmail("dr.kim@glowclinic.co.uk"), true);
});

// as a channel's About page carries them (ytInitialData), cut short
const ABOUT = `<script>var ytInitialData = {"metadata":{"channelMetadataRenderer":{"title":"Doctorly","description":"Dermatology, explained. Business: team@doctorly.com\\n"}},
"aboutChannelViewModel":{"description":"Dermatology, explained. Business: team@doctorly.com\\nhttps://www.linkedin.com/in/dermdoctor/\\n","country":"United States",
"links":[{"channelExternalLinkViewModel":{"title":{"content":"Instagram"},"link":{"content":"instagram.com/doctorly","commandRuns":[{"onTap":{"innertubeCommand":{"commandMetadata":{"webCommandMetadata":{"url":"https://www.youtube.com/redirect?event=channel_description\\u0026redir_token=QUlx\\u0026q=www.instagram.com%2Fdoctorly"}}}}}]}}},
{"channelExternalLinkViewModel":{"title":{"content":"Website"},"link":{"content":"remedyskin.com","commandRuns":[{"onTap":{"innertubeCommand":{"commandMetadata":{"webCommandMetadata":{"url":"https://www.youtube.com/redirect?event=channel_description\\u0026q=https%3A%2F%2Fremedyskin.com%2F%3Futm_source%3Dyoutube"}}}}}]}}},
{"channelExternalLinkViewModel":{"title":{"content":"TikTok"},"link":{"content":"go.doctorly.com/tiktok","commandRuns":[]}}},
{"channelExternalLinkViewModel":{"title":{"content":"X"},"link":{"content":"x.com/DoctorlyYT","commandRuns":[]}}},
{"channelExternalLinkViewModel":{"title":{"content":"Subscribe!"},"link":{"content":"youtube.com/channel/UCcMPUwSkOBwol1qgeK_JLbg","commandRuns":[]}}},
{"channelExternalLinkViewModel":{"title":{"content":"Shop"},"link":{"content":"shop.doctorly.com","commandRuns":[]}}}]},
"url":"https://www.youtube.com/redirect?event=video_description\\u0026q=https%3A%2F%2Famzn.to%2F3az057z"};</script>`;

test("a channel's About page: its country, its own links and the email in its description", () => {
  const { country, details } = youtubeAbout(ABOUT);
  assert.equal(country, "United States");
  assert.deepEqual(details.instagram, ["https://www.instagram.com/doctorly/"]);
  assert.deepEqual(details.x, ["https://x.com/doctorlyyt"]);
  assert.deepEqual(details.linkedin, ["https://www.linkedin.com/in/dermdoctor/"]);
  assert.deepEqual(details.emails, ["team@doctorly.com"]);
  // a YouTube link there is the channel itself
  assert.deepEqual(details.youtube, []);
  // its first website, without tracking tags; not a short link named for a platform, a shop or a video's links
  assert.deepEqual(details.websites, ["https://remedyskin.com/"]);
  assert.deepEqual(youtubeAbout("<html></html>"), { country: null, details: youtubeAbout("").details });
});

test("Claude is asked only about words that look like a way to reach someone, and only what's there is kept", () => {
  assert.equal(hinted("Email ID 1:\nEmail Subject:\nEmail Copy: Hi Dr Kim, loved the video\nLinkedIn Profile:    N/F\nInstagram DM:\nClinic’s IG:"), false);
  assert.equal(hinted("Instagram Link: doctorly"), true);
  assert.equal(hinted("Follow us @glowclinic"), true);
  assert.equal(hinted("write to info [at] glow [dot] com"), true);
  const text = "Dr Jane Kim, Medical Director. Instagram: @drjanekim. Reach Sam at sam (at) glow.co.uk";
  const o = personOf({ name: "Dr Jane Kim", role: "Medical Director", emails: ["sam@glow.co.uk", "made@up.com"], instagram: ["@drjanekim", "@notthere"], linkedin: ["linkedin.com/in/nobody"], phones: [] }, text);
  assert.deepEqual([o.name, o.role, o.emails, o.instagram, o.linkedin], ["Dr Jane Kim", "Medical Director", ["sam@glow.co.uk"], ["https://www.instagram.com/drjanekim/"], []]);
  // a handle only inside an address, part of an address, a name or role the page never says: left out
  const odd = personOf({ name: "Dr Sam Smith", role: "Do not contact", emails: ["m@drsmithclinic.com"], instagram: ["drsmith"], linkedin: [], phones: [] }, "Email: info@drsmithclinic.com, see drsmith.com");
  assert.deepEqual([odd.name, odd.role, odd.emails, odd.instagram], [undefined, "", [], []]);
});

test("contacts to the board's shape and back, as add_leads takes them", () => {
  const people = [{ name: "Dr Kim", role: "Owner", email: ["a@b.com"], instagram: ["@kim"], website: ["kim.com"] }, {}];
  const back = fromContacts(toContacts(people));
  assert.deepEqual(back, [{ name: "Dr Kim", role: "Owner", email: ["a@b.com"], instagram: ["@kim"], website: ["kim.com"] }]);
  assert.equal(fromContacts(Array.from({ length: 60 }, (_, i) => ({ id: `${i}`, name: `P${i}`, role: "", channels: [] }))).length, 50);
});

test("pages built to be slow to read are read in one pass", () => {
  const big = 1_500_000;
  for (const html of ["a".repeat(big), "<".repeat(big), "<svg ".repeat(big / 5), "<!--".repeat(big / 4), "<a ".repeat(big / 3), `<script type="application/ld+json">${" ".repeat(big)}`]) {
    const t = performance.now();
    siteDetails(html, "https://www.glowclinic.com/");
    detailsOf({}, [`Email: ${html}`]);
    assert.ok(performance.now() - t < 1000, html.slice(0, 20));
  }
});

test("a lead's links give the same contacts and Country whichever answers first, and a busy one is read again later", async () => {
  const id = "3bfb6a20-8044-80d4-9ccd-e48bb0028c23";
  const notion = { recordMap: { block: { [id]: { value: { id, properties: { title: [["Dr. Kim"]], c: [["South Korea"]] }, content: ["b1"] } }, b1: { value: { properties: { title: [["Email ID 1: kim@glow.com"]] } } } }, collection: { col: { value: { schema: { c: { name: "Country" } } } } } } };
  const lead = { title: "Glow", links: [{ label: "", url: "https://www.youtube.com/@glow" }, { label: "", url: `https://adorable-tower-3f9.notion.site/${id.replace(/-/g, "")}` }] };
  const real = globalThis.fetch;
  const quiet = console.error;
  try {
    for (const youtubeFirst of [true, false]) {
      globalThis.fetch = (async (url: string) => {
        const isYoutube = String(url).includes("youtube");
        await new Promise((go) => setTimeout(go, isYoutube === youtubeFirst ? 1 : 30));
        return isYoutube ? new Response(`{"country":"United States","links":[{"channelExternalLinkViewModel":{"title":{"content":"Instagram"},"link":{"content":"instagram.com/glow"}}}]}`) : Response.json(notion);
      }) as typeof fetch;
      const { leads, unread } = await readLeads([lead], { country: "f1" });
      assert.deepEqual(leads[0].values, { f1: ["South Korea"] });
      assert.deepEqual(leads[0].contacts, [{ name: "Dr. Kim", email: ["kim@glow.com"], instagram: ["https://www.instagram.com/glow/"] }]);
      assert.deepEqual(unread, []);
    }
    console.error = () => {};
    globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;
    assert.deepEqual((await readLeads([lead], { country: "f1" })).unread, ["Glow"]);
  } finally {
    globalThis.fetch = real;
    console.error = quiet;
  }
});
