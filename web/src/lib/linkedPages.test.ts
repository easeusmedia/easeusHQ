import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsOf, instagramUrl, linkedinUrl, notionPageOf, pageOf, withPages } from "./linkedPages.ts";

test("several emails on one line, each label read, links made profile addresses", () => {
  const d = detailsOf({ Country: "USA", Name: "Alexander L Blinski MD" }, [
    "Email ID 1:   ablinskimd@gmail.com           drb@getplump.com      info@getplump.com",
    "Email Subject:",
    "Email Copy:",
    "LinkedIn Profile:  https://www.linkedin.com/in/alexander-l-blinski-md-86088258/?utm_source=share",
    "LinkedIn Copy:",
    "Instagram Link:  https://www.instagram.com/DoctorBlinski/reels/?hl=en",
    "Instagram DM:",
  ]);
  assert.equal(d.name, "Alexander L Blinski MD");
  assert.equal(d.country, "USA");
  assert.deepEqual(d.emails, ["ablinskimd@gmail.com", "drb@getplump.com", "info@getplump.com"]);
  assert.deepEqual(d.linkedin, ["https://www.linkedin.com/in/alexander-l-blinski-md-86088258/"]);
  assert.deepEqual(d.instagram, ["https://www.instagram.com/doctorblinski/"]);
  assert.deepEqual(d.others, []);
});

test("mailto links, a YouTube channel, a website and a phone; the clinic's Instagram left out", () => {
  const d = detailsOf({ Name: "Dr. Daniel Barrett" }, [
    "Clinic’s IG:https://www.instagram.com/barrettrecovery/",
    "Phone No: +44 1132783344",
    "Website: Best Rated Plastic Surgeon - Barrett Plastic Surgery <https://www.drdanielbarrett.com/>",
    "YT: Barrett Plastic Surgery - YouTube <https://www.youtube.com/@barrettplasticsurgery/videos>",
    "Email ID 1:danielbarrettmd@gmail.com <mailto:danielbarrettmd@gmail.com>",
    "LinkedIn Profile:https://www.linkedin.com/in/drdanielbarrett/",
    "Instagram Link: https://www.instagram.com/drdanielbarrett/tagged/\nhttps://www.instagram.com/barrettbeverlyhills/",
    "Instagram DM:",
    "Hey Dr Barrett, loved your reel: https://www.instagram.com/p/abc123/ and wanted to reach out",
  ]);
  assert.deepEqual(d.emails, ["danielbarrettmd@gmail.com"]);
  assert.deepEqual(d.instagram, ["https://www.instagram.com/drdanielbarrett/", "https://www.instagram.com/barrettbeverlyhills/"]);
  assert.deepEqual(d.youtube, ["https://www.youtube.com/@barrettplasticsurgery"]);
  assert.deepEqual(d.websites, ["https://www.drdanielbarrett.com/"]);
  assert.deepEqual(d.phones, ["+44 1132783344"]);
});

test("staff under their own heading are kept out of the doctor", () => {
  const d = detailsOf({ Name: "The Chiswick Clinic" }, [
    "Clinic’s IG:  https://www.instagram.com/chiswick.clinic.aesthetics/",
    "Chiswick Clinic",
    "Email ID 1:  drbela@chiswickclinic.com <mailto:drbela@chiswickclinic.com>",
    "LinkedIn Profile: https://www.linkedin.com/in/bela-horvath-doctor/",
    "Instagram Link:   https://www.instagram.com/drbelahorvath/",
    "Instagram DM:",
    "Marketing Executive:",
    "Email ID 1:    priyanka@chiswickclinic.com <mailto:priyanka@chiswickclinic.com>",
    "LinkedIn Profile:  https://www.linkedin.com/in/priyanka-gadhe-30956617b/",
    "Instagram Link: N/F",
  ]);
  assert.deepEqual(d.emails, ["drbela@chiswickclinic.com"]);
  assert.deepEqual(d.instagram, ["https://www.instagram.com/drbelahorvath/"]);
  assert.equal(d.others.length, 1);
  assert.equal(d.others[0].role, "Marketing Executive");
  assert.deepEqual(d.others[0].emails, ["priyanka@chiswickclinic.com"]);
  assert.deepEqual(d.others[0].linkedin, ["https://www.linkedin.com/in/priyanka-gadhe-30956617b/"]);
});

test("a manager on one line, and doctors named in the labels, are their own people", () => {
  const d = detailsOf({ Name: "Dr. Ross Kopelman  Dr. Joel Kopelman" }, [
    "Email ID 1:  drroham@yahoo.com",
    "Manager:  sara.h@drroham.com <mailto:sara.h@drroham.com>",
    "Email ID Dr. Ross Kopelman: rosskopelman@gmail.com <mailto:rosskopelman@gmail.com> \nEmail ID Dr. Joel Kopelman: jkopelmanmd@aol.com",
    "Instagram Link Dr. Ross Kopelman: https://www.instagram.com/doctor.ross/  \nIG of Dr. Joel Kopelman: https://www.instagram.com/doctorkopelman/?hl=en",
  ]);
  assert.equal(d.name, "Dr. Ross Kopelman Dr. Joel Kopelman");
  assert.deepEqual(d.emails, ["drroham@yahoo.com"]);
  assert.deepEqual(
    d.others.map((o) => [o.role, o.name, o.emails, o.instagram]),
    [
      ["Manager", undefined, ["sara.h@drroham.com"], []],
      ["", "Dr. Ross Kopelman", ["rosskopelman@gmail.com"], ["https://www.instagram.com/doctor.ross/"]],
      ["", "Dr. Joel Kopelman", ["jkopelmanmd@aol.com"], ["https://www.instagram.com/doctorkopelman/"]],
    ],
  );
});

test("a page with nothing on it", () => {
  const d = detailsOf({ Name: "Dr. Sam Ellis" }, ["Clinic’s IG:", "Email ID 1:", "Email Subject:", "LinkedIn Profile:    N/F", "Instagram DM:"]);
  assert.deepEqual(d, { name: "Dr. Sam Ellis", emails: [], linkedin: [], instagram: [], youtube: [], phones: [], websites: [], others: [] });
  assert.deepEqual(detailsOf({}, []).emails, []);
});

test("profile addresses and Notion links", () => {
  assert.equal(instagramUrl("instagram.com/simonourianmd1"), "https://www.instagram.com/simonourianmd1/");
  assert.equal(instagramUrl("https://www.instagram.com/reels/abc/"), null);
  assert.equal(instagramUrl("https://www.youtube.com/redirect?q=https://www.instagram.com/x/"), null);
  assert.equal(linkedinUrl("https://www.linkedin.com/company/kao-aesthetics/people/"), null);
  assert.deepEqual(notionPageOf("https://adorable-tower-3f9.notion.site/089b6a208044827f9721814679a8773c"), {
    origin: "https://adorable-tower-3f9.notion.site",
    id: "089b6a20-8044-827f-9721-814679a8773c",
  });
  assert.equal(notionPageOf("https://www.notion.so/Dr-Kim-089b6a208044827f9721814679a8773c?pvs=4")?.id, "089b6a20-8044-827f-9721-814679a8773c");
  assert.equal(notionPageOf("https://example.com/089b6a208044827f9721814679a8773c"), null);
});

test("a loadPageChunk answer, into properties by name and lines", () => {
  const id = "089b6a20-8044-827f-9721-814679a8773c";
  const rm = {
    block: {
      [id]: { value: { value: { id, parent_id: "col", properties: { title: [["Dr. Kim"]], "a:b": [["USA"]] }, content: ["b1"] } } },
      b1: { value: { value: { properties: { title: [["Email ID 1: ", []], ["kim@x.com", [["a", "mailto:kim@x.com"]]]] } } } },
    },
    collection: { col: { value: { value: { id: "col", schema: { "a:b": { name: "Country" }, title: { name: "Name" } } } } } },
  };
  assert.deepEqual(pageOf(rm, id), { props: { Name: "Dr. Kim", Country: "USA" }, lines: ["Email ID 1: kim@x.com <mailto:kim@x.com>"] });
  assert.equal(pageOf(rm, "nope"), null);
});

test("details onto a lead: the matching contact, nothing twice, staff as their own contact", () => {
  const page = detailsOf({ Name: "Dr. Bela Horvath" }, [
    "Email ID 1: drbela@chiswickclinic.com KIM@x.com",
    "YT: https://www.youtube.com/@drbela/videos",
    "Instagram Link: https://www.instagram.com/drbelahorvath/reels/",
    "CEO:",
    "Email ID 1: ceo@chiswickclinic.com",
  ]);
  const r = withPages(
    [
      { id: "c1", name: "Kim", role: "", channels: [{ kind: "email", value: "kim@x.com" }] },
      { id: "c2", name: "Bela Horvath Dr.", role: "", channels: [{ kind: "instagram", value: "@DrBelaHorvath" }] },
    ],
    [page],
    ["https://www.youtube.com/@drbela"],
  );
  assert.deepEqual(r.contacts[1].channels, [
    { kind: "instagram", value: "@DrBelaHorvath" },
    { kind: "email", value: "drbela@chiswickclinic.com" },
  ]);
  assert.equal(r.contacts[0].channels.length, 1);
  // the CEO stays off by default (they'd get the doctor's whole sequence)
  assert.equal(r.contacts.length, 2);
  assert.deepEqual(r.added, ["email"]);
  // asked for, they come in as their own contact with their role
  const withStaff = withPages(r.contacts.slice(0, 2).map((c) => ({ ...c, channels: c.channels.filter((ch) => ch.value !== "drbela@chiswickclinic.com") })), [page], ["https://www.youtube.com/@drbela"], true);
  assert.equal(withStaff.contacts.length, 3);
  assert.deepEqual({ ...withStaff.contacts[2], id: "" }, { id: "", name: "", role: "CEO", channels: [{ kind: "email", value: "ceo@chiswickclinic.com" }] });

  // a lead with no name on its contact takes the page's
  const named = withPages([{ id: "c1", name: "", role: "", channels: [] }], [page]);
  assert.equal(named.contacts[0].name, "Dr. Bela Horvath");
  assert.equal(named.named, 1);
});
