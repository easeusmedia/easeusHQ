import { test } from "node:test";
import assert from "node:assert/strict";
import { namesClient } from "./titles.ts";

test("a task's name that already says its client", () => {
  assert.equal(namesClient("Elle Sera - Golden Pill", "Elle Sera"), true);
  assert.equal(namesClient("FitFuel - Founder Story Ad", "FitFuel Nutrition"), true);
  assert.equal(namesClient("Glow Derma - Acne Myths Busted", "Glow Derma Clinic"), true);
  assert.equal(namesClient("Dr Kavya Rao - PCOS Diet Tips", "Dr Kavya Rao"), true);
  assert.equal(namesClient("Elle Sera x Kelly Trailer", "Elle Sera"), true);
  // doesn't say it: the client line stays
  assert.equal(namesClient("Tego - Microneedling", "Dr Tego"), false);
  assert.equal(namesClient("Editors Management (Video Analysis & Meetings)", "Admin tasks"), false);
  assert.equal(namesClient("Brief Riya on the FitFuel launch", "FitFuel Nutrition"), false);
  assert.equal(namesClient("Anything", null), false);
});
