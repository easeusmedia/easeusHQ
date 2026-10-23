import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsOf, emptyDetails, instagramUrl, linkedinName, linkedinUrl, namesIn, notionPageOf, pageOf, tiktokUrl, withPages, xUrl, type NotionPage } from "./linkedPages.ts";

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
  // kept apart, for a lead nobody else's Instagram is on
  assert.deepEqual(d.clinic, { instagram: ["https://www.instagram.com/barrettrecovery/"], websites: [] });
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
  assert.deepEqual(d, { name: "Dr. Sam Ellis", ...emptyDetails(), others: [], clinic: { instagram: [], websites: [] } });
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
  assert.equal(notionPageOf("https://www.notion.so:8443/089b6a208044827f9721814679a8773c"), null);
  assert.equal(xUrl("https://twitter.com/DrKim?lang=en"), "https://x.com/drkim");
  assert.equal(xUrl("https://x.com/intent/tweet?text=hi"), null);
  assert.equal(tiktokUrl("https://www.tiktok.com/@dr.kim"), "https://www.tiktok.com/@dr.kim");
  assert.equal(tiktokUrl("https://www.tiktok.com/@dr.kim/video/123"), null);
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
  // the CEO comes in as their own contact, with their role (every possible contact)
  assert.equal(r.contacts.length, 3);
  assert.deepEqual({ ...r.contacts[2], id: "" }, { id: "", name: "", role: "CEO", channels: [{ kind: "email", value: "ceo@chiswickclinic.com" }] });
  assert.deepEqual(r.added, ["email", "email"]);
  assert.equal(r.people, 1);

  // a lead with no name on its contact takes the page's
  const named = withPages([{ id: "c1", name: "", role: "", channels: [] }], [page]);
  assert.equal(named.contacts[0].name, "Dr. Bela Horvath");
  assert.equal(named.named, 1);
});

// pages as the Dream 300 doctors' are written (adorable-tower-3f9.notion.site)
const AUSTIN = detailsOf({ Name: "Austin-Weston, The Center for Cosmetic Surgery" }, [
  "Clinic’s IG:   https://www.instagram.com/austinwestonplasticsurgery/",
  "Austin-Weston, The Center for Cosmetic Surgery",
  "Medical Director:",
  "Email ID 1:   poindexter@austin-weston.com <mailto:poindexter@austin-weston.com>             magbrook@aol.com <mailto:magbrook@aol.com>",
  "Email Subject:",
  "LinkedIn Profile:   https://www.linkedin.com/in/byron-poindexter-50831721/",
  "Instagram Link: https://www.instagram.com/byronpoindextermd/",
  "Owner:",
  "Email ID 1:   jennawc@gmail.com <mailto:jennawc@gmail.com>             sigal@austin-weston.com <mailto:sigal@austin-weston.com>",
  "LinkedIn Profile:   https://www.linkedin.com/in/robertsigal/",
]);
const strip = (r: ReturnType<typeof withPages>) => r.contacts.map((c) => [c.name, c.role, c.channels.map((ch) => ch.value)]);

test("staff on a page are their own contacts with their roles, named from their LinkedIn when the page doesn't say", () => {
  // the clinic's name on a contact nothing came for isn't kept beside them
  const r = withPages([{ id: "c1", name: "Austin-Weston, The Center for Cosmetic Surgery", role: "", channels: [] }], [AUSTIN], [], "Austin-Weston, The Center for Cosmetic Surgery");
  assert.deepEqual(strip(r), [
    ["Byron Poindexter", "Medical Director", ["poindexter@austin-weston.com", "magbrook@aol.com", "https://www.linkedin.com/in/byron-poindexter-50831721/", "https://www.instagram.com/byronpoindextermd/"]],
    ["", "Owner", ["jennawc@gmail.com", "sigal@austin-weston.com", "https://www.linkedin.com/in/robertsigal/"]],
  ]);
  // someone on the lead already (by name, or by an address) gets their details and role, not a second contact
  const again = withPages([{ id: "c1", name: "Dr Poindexter", role: "", channels: [] }, { id: "c2", name: "Rob", role: "", channels: [{ kind: "email", value: "jennawc@gmail.com" }] }], [AUSTIN]);
  assert.deepEqual(
    again.contacts.map((c) => [c.name, c.role, c.channels.length]),
    [
      ["Dr Byron Poindexter", "Medical Director", 4],
      ["Rob", "Owner", 3],
    ],
  );
  // a doctor's name stays, and so does anyone when nobody can be reached
  assert.equal(withPages([{ id: "c1", name: "Dr Hanson", role: "", channels: [] }], [AUSTIN], [], "Dr Hanson").contacts[0].name, "Dr Hanson");
  assert.equal(withPages([{ id: "c1", name: "Glow", role: "", channels: [] }], [], [], "Glow").contacts.length, 1);
  // a website the channel gave the clinic's contact goes with the first person who can be reached
  const site: NotionPage = { ...emptyDetails(), websites: ["https://www.austin-weston.com/"], others: [], clinic: { instagram: [], websites: [] }, site: true };
  const moved = withPages([{ id: "c1", name: "Austin-Weston", role: "", channels: [] }], [AUSTIN, site], [], "Austin-Weston");
  assert.deepEqual(
    moved.contacts.map((c) => [c.name, c.channels.at(-1)?.value]),
    [
      ["Byron Poindexter", "https://www.austin-weston.com/"],
      ["", "https://www.linkedin.com/in/robertsigal/"],
    ],
  );
  assert.equal(linkedinName("https://www.linkedin.com/in/dustin-heringer-m-d-2bb071a8/"), "Dustin Heringer");
  assert.equal(linkedinName("https://www.linkedin.com/in/ersin-g%C3%B6n%C3%BCll%C3%BC-39442437/"), "Ersin Gönüllü");
  assert.equal(linkedinName("https://www.linkedin.com/in/alexander-l-blinski-md-86088258/"), "Alexander L Blinski");
  assert.equal(linkedinName("https://www.linkedin.com/in/robertsigal/"), "");
});

test("a contact naming several people together gives way to them, each matched on its own", () => {
  const page = detailsOf({ Name: "Dr. Muneeb Shah & Dr. Luke Maxfield" }, [
    "Clinic’s IG:",
    "YT Page: https://www.youtube.com/@Doctorly/videos",
    "Email ID of Dr. Muneeb Shah: drshah@gmail.com <mailto:drshah@gmail.com>",
    "LinkedIn Profile Dr. Muneeb Shah: https://www.linkedin.com/in/dermdoctor/",
    "Instagram Link of Dr. Luke Maxfield: https://www.instagram.com/dr.ljmaxfield",
  ]);
  assert.deepEqual(namesIn("Dr Shah & Dr Maxfield"), ["Dr Shah", "Dr Maxfield"]);
  assert.deepEqual(namesIn("Dr. Shah, Dr. Maxfield"), ["Dr. Shah", "Dr. Maxfield"]);
  assert.deepEqual(namesIn("VIVIFY plastic surgery & medspa"), []);
  assert.deepEqual(namesIn("Angela Sturm, M.D"), []);
  const r = withPages([{ id: "c1", name: "Dr Shah & Dr Maxfield", role: "", channels: [] }], [page], ["https://www.youtube.com/@Doctorly"], "Doctorly");
  assert.deepEqual(strip(r), [
    ["Dr. Muneeb Shah", "", ["drshah@gmail.com", "https://www.linkedin.com/in/dermdoctor/"]],
    ["Dr. Luke Maxfield", "", ["https://www.instagram.com/dr.ljmaxfield/"]],
  ]);
  // with an address of its own it stays, and takes each person's details
  const kept = withPages([{ id: "c1", name: "Dr Shah & Dr Maxfield", role: "", channels: [{ kind: "email", value: "hi@doctorly.com" }] }], [page], ["https://www.youtube.com/@Doctorly"]);
  assert.equal(kept.contacts.length, 1);
  assert.equal(kept.contacts[0].channels.length, 4);
});

test("a greeting is no name, and a shorter form of the page's name takes the fuller one", () => {
  const page = detailsOf({ Name: "Dr. Jane Kim" }, ["Email ID 1: jane@kim.com"]);
  assert.equal(withPages([{ id: "c1", name: "there", role: "", channels: [] }], [page]).contacts[0].name, "Dr. Jane Kim");
  assert.equal(withPages([{ id: "c1", name: "Dr Kim", role: "", channels: [] }], [page]).contacts[0].name, "Dr. Jane Kim");
  assert.equal(withPages([{ id: "c1", name: "Sam Lee", role: "", channels: [] }], [page]).contacts[0].name, "Sam Lee");
  // only the person's part of a page's name, the contact's title kept
  const najera = detailsOf({ Name: "Robert Najera, M.D. - Dr. Dallas" }, ["Email ID 1: rn@drdallas.com"]);
  assert.equal(withPages([{ id: "c1", name: "Dr Najera", role: "", channels: [] }], [najera]).contacts[0].name, "Dr Robert Najera");
});

test("the clinic's Instagram only when nobody on the lead has one; a site's details only for what nobody has", () => {
  const center = detailsOf({ Name: "The Skin Center" }, ["Clinic’s IG:  https://www.instagram.com/theskincentermd/reels/", "CEO:", "Email ID 1:  gregsanker@gmail.com", "LinkedIn Profile: https://www.linkedin.com/in/gsanker/"]);
  const r = withPages([{ id: "c1", name: "The Skin Center", role: "", channels: [] }], [center], [], "The Skin Center");
  assert.deepEqual(strip(r)[0], ["The Skin Center", "Clinic", ["https://www.instagram.com/theskincentermd/"]]);
  // the Medical Director's Instagram is there: the clinic's stays off
  assert.ok(!withPages([], [AUSTIN], [], "Austin-Weston").contacts.some((c) => c.role === "Clinic"));

  const site: NotionPage = { ...emptyDetails(), emails: ["a@c.com", "b@c.com", "c@c.com", "d@c.com"], instagram: ["https://www.instagram.com/clinic/"], x: ["https://x.com/clinic"], others: [], clinic: { instagram: [], websites: [] }, site: true };
  const s = withPages([{ id: "c1", name: "Dr Kim", role: "", channels: [{ kind: "instagram", value: "@drkim" }] }], [site], [], "Kim Clinic");
  assert.deepEqual(s.contacts[0].channels.map((ch) => ch.value), ["@drkim", "a@c.com", "b@c.com", "c@c.com", "https://x.com/clinic"]);
  // a lead with nobody on it yet gets a contact named after it, and an unnamed one takes its name
  assert.equal(withPages([], [site], [], "Kim Clinic").contacts[0].name, "Kim Clinic");
  assert.equal(withPages([{ id: "c1", name: "there", role: "", channels: [] }], [site], [], "Kim Clinic").contacts[0].name, "Kim Clinic");
});

test("a name two contacts share is neither's, unless an address or its LinkedIn says whose", () => {
  const kopelmans = () => [
    { id: "r", name: "Dr. Ross Kopelman", role: "", channels: [] },
    { id: "j", name: "Dr. Joel Kopelman", role: "", channels: [] },
  ];
  const page = (lines: string[]) => detailsOf({ Name: "Dr. Kopelman" }, lines);
  assert.deepEqual(strip(withPages(kopelmans(), [page(["Email ID 1: joel@drkopelman.com"])])), [
    ["Dr. Ross Kopelman", "", []],
    ["Dr. Joel Kopelman", "", []],
    ["Dr. Kopelman", "", ["joel@drkopelman.com"]],
  ]);
  const byLinkedin = withPages(kopelmans(), [page(["Email ID 1: joel@drkopelman.com", "LinkedIn Profile: https://www.linkedin.com/in/dr-joel-kopelman/"])]);
  assert.deepEqual(strip(byLinkedin).slice(0, 2), [
    ["Dr. Ross Kopelman", "", []],
    ["Dr. Joel Kopelman", "", ["joel@drkopelman.com", "https://www.linkedin.com/in/dr-joel-kopelman/"]],
  ]);
  // a title naming both with only a space between is two people, never one fuller name
  assert.deepEqual(namesIn("Dr. Ross Kopelman  Dr. Joel Kopelman"), ["Dr. Ross Kopelman", "Dr. Joel Kopelman"]);
  const both = detailsOf({ Name: "Dr. Ross Kopelman  Dr. Joel Kopelman" }, ["Email ID Dr. Joel Kopelman: jkopelmanmd@aol.com"]);
  assert.deepEqual(strip(withPages(kopelmans(), [both])), [
    ["Dr. Ross Kopelman", "", []],
    ["Dr. Joel Kopelman", "", ["jkopelmanmd@aol.com"]],
  ]);
});

test("a site's details, the clinic's Instagram and the placeholder rule never land on a staff member or a person's name", () => {
  // nobody on the lead but staff: the site's details are the clinic's, on a contact named after the lead
  const staff = detailsOf({ Name: "The Skin Center" }, ["Marketing Director:", "Email ID 1: sonja@theskincenter.com"]);
  const site: NotionPage = { ...emptyDetails(), instagram: ["https://www.instagram.com/theskincentermd/"], websites: ["https://theskincenter.com/"], others: [], clinic: { instagram: [], websites: [] }, site: true };
  assert.deepEqual(strip(withPages([], [staff, site], [], "The Skin Center")), [
    ["", "Marketing Director", ["sonja@theskincenter.com"]],
    ["The Skin Center", "", ["https://www.instagram.com/theskincentermd/", "https://theskincenter.com/"]],
  ]);
  // the doctor a lead is named after stays, with their own channels
  const zelken = detailsOf({ Name: "Zelken Institute" }, ["Office Manager: sara@zelkeninstitute.com"]);
  const doctor = { id: "c1", name: "Jonathan Zelken", role: "", channels: [{ kind: "youtube" as const, value: "https://www.youtube.com/@drzelken" }] };
  assert.deepEqual(strip(withPages([doctor], [zelken], [], "Jonathan Zelken, MD")), [
    ["Jonathan Zelken", "", ["https://www.youtube.com/@drzelken"]],
    ["", "Office Manager", ["sara@zelkeninstitute.com"]],
  ]);
  // the clinic's Instagram: never a doctor's contact made the clinic, never a second contact with the lead's business name
  const glow = detailsOf({ Name: "Dr Jane Kim" }, ["Clinic’s IG: https://www.instagram.com/glowclinic/"]);
  assert.deepEqual(strip(withPages([{ id: "c1", name: "Dr Jane Kim", role: "", channels: [] }], [glow], [], "Dr Jane Kim")), [
    ["Dr Jane Kim", "", []],
    ["", "Clinic", ["https://www.instagram.com/glowclinic/"]],
  ]);
  const clinic = { id: "c1", name: "Glow Clinic", role: "", channels: [{ kind: "email" as const, value: "hi@glow.com" }] };
  assert.deepEqual(strip(withPages([clinic], [glow], [], "Glow Clinic")), [["Glow Clinic", "Clinic", ["hi@glow.com", "https://www.instagram.com/glowclinic/"]]]);
});
