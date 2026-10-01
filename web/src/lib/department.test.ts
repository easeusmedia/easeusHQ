import { test } from "node:test";
import assert from "node:assert/strict";
import { departmentFromTitle, STARTING_WORDS } from "./department.ts";

const depts = Object.entries(STARTING_WORDS).map(([id, keywords]) => ({ id, keywords }));

// [title, where it should go, the person's departments (when it matters)]
type Case = [string, string | null, string[]?];

// Every kind of task the agency writes, by the department it belongs to.
// Titles are written the way the team writes them: "Client - Topic", a verb
// first, or a noun then the verb.
const CASES: Record<string, Case[]> = {
  production: [
    ["Edit the Glow Derma reel", "production"],
    ["Editor Inspection", "production"],
    ["Elle Sera -  Kelly Reel Curate", "production"],
    ["Colour grade the podcast", "production"],
    ["Export the final cut for Dr Tego", "production"],
    ["Render the trailer", "production"],
    ["Thumbnail for Ep 12", "production"],
    ["Design the launch carousel", "production"],
    ["Add subtitles to the Shorts", "production"],
    ["Sound mix for episode 4", "production"],
    ["Shoot B-roll at the clinic", "production"],
    ["Motion graphics for the intro", "production"],
    ["Voiceover sync for the FitFuel ad", "production"],
    ["Cut a teaser from the podcast", "production"],
    ["Revisions on the Golden Pill reel", "production"],
    ["Re-edit the reel", "production"],
    ["Banner and poster for the clinic", "production"],
  ],
  content: [
    ["Script: PCOS Diet Tips", "content"],
    ["Script for the GPL episode", "content"],
    ["Hooks for November reels", "content"],
    ["Content calendar for November", "content"],
    ["Research topics for Dr Kavya", "content"],
    ["Write captions for the carousel", "content"],
    ["Ideas for Diwali reels", "content"],
    ["Content strategy for FitFuel", "content"],
    ["Plan Diwali content for Glow Derma", "content"],
    ["Storyboard the trailer", "content"],
  ],
  distribution: [
    ["Upload Skin Talk Ep 11 to YouTube", "distribution"],
    ["Elle Sera Upload", "distribution"],
    ["Post the reel on Instagram", "distribution"],
    ["Schedule the posts for next week", "distribution"],
    ["Monthly analytics report for Elle Sera", "distribution"],
    ["Boost the ad campaign", "distribution"],
    ["SEO for the YouTube channel", "distribution"],
    ["LinkedIn posts this week", "distribution"],
    ["Reply to Instagram comments", "distribution"],
    ["Hashtags for the launch posts", "distribution"],
  ],
  sales: [
    ["Proposal for Urban Yoga Co", "sales"],
    ["Proposal for Skin Co", "sales"],
    ["Discovery call: Smile Dental Studio", "sales"],
    ["Follow up with the five leads from the expo", "sales"],
    ["Cold email to dermatologists", "sales"],
    ["Pitch deck for FitFuel", "sales"],
    ["Pricing for the podcast package", "sales"],
    ["Send the quote to Dr Mehra", "sales"],
    ["Find 20 new prospects", "sales"],
  ],
  "client-services": [
    ["Client call with Dr Tego", "client-services"],
    ["Call with Dr Tego about the plan", "client-services"],
    ["Onboarding call for FitFuel", "client-services"],
    ["Brief Riya on the FitFuel launch", "client-services"],
    ["Weekly update to Elle Sera", "client-services"],
    ["Get approval on the October calendar", "client-services"],
    ["Check in with Dr Kavya", "client-services"],
    ["Meeting notes from the town hall", "client-services"],
    ["Collect feedback on the trailer", "client-services"],
  ],
  finance: [
    ["Send the invoice to FitFuel", "finance"],
    ["October invoices", "finance"],
    ["October payroll", "finance"],
    ["GST filing for Q2", "finance"],
    ["Interview video editors", "finance"],
    ["Hire a graphic designer", "finance"],
    ["Job post for a video editor", "finance"],
    ["Approve leave for Karan", "finance"],
  ],
};

for (const [department, cases] of Object.entries(CASES)) {
  test(`${department}: its kinds of task land there`, () => {
    for (const [title, want, person] of cases) assert.equal(departmentFromTitle(title, depts, person), want, title);
  });
}

// A title that points two ways at once goes to the person's own department
// when it's one of them; otherwise to whichever word comes first.
test("a draw goes to the person's department, else to the first word", () => {
  // "Podcast" (Production) and "upload" (Distribution), once each
  assert.equal(departmentFromTitle("Podcast upload", depts, ["distribution"]), "distribution");
  assert.equal(departmentFromTitle("Podcast upload", depts, ["production"]), "production");
  assert.equal(departmentFromTitle("Podcast upload", depts), "production");
  // "Schedule" (Distribution) and "reels" (Production)
  assert.equal(departmentFromTitle("Schedule Glow Derma's reels for the week", depts, ["distribution"]), "distribution");
  // someone in several departments: the one of theirs that's in the draw
  assert.equal(departmentFromTitle("Podcast upload", depts, ["client-services", "distribution", "production"]), "distribution");
});

test("phrases outweigh single words", () => {
  // "discovery call" (Sales, two words) beats "call" (Client Services)
  assert.equal(departmentFromTitle("Discovery call", depts), "sales");
  // "client call" (Client Services) beats nothing else
  assert.equal(departmentFromTitle("Client call", depts), "client-services");
  // "video editor" in a hiring title is who's being hired, not the work
  assert.equal(departmentFromTitle("Hire a video editor", depts), "finance");
  // but on its own it's still Production's
  assert.equal(departmentFromTitle("Video editor inspection", depts), "production");
});

test("whole words only, any case and punctuation, and nothing matched is nothing", () => {
  assert.equal(departmentFromTitle("Poster", [{ id: "d", keywords: "post" }]), null);
  assert.equal(departmentFromTitle("EDIT THE REEL!!", depts), "production");
  assert.equal(departmentFromTitle("edit/upload", depts, ["distribution"]), "distribution");
  // a client and a topic, no task words: the person's department decides (null here)
  assert.equal(departmentFromTitle("Glow Derma - Acne Myths Busted", depts), null);
  assert.equal(departmentFromTitle("Demo", depts), null);
  assert.equal(departmentFromTitle("", depts), null);
});
