import { test } from "node:test";
import assert from "node:assert/strict";
import { fitAcross } from "./fit.ts";

const trig = (left: number, width: number) => ({ left, right: left + width, width });

test("a menu lines up with its trigger when there's room", () => {
  assert.deepEqual(fitAcross(trig(100, 120), 1000, { width: 208 }), { left: 100, width: 208 });
  assert.deepEqual(fitAcross(trig(100, 300), 1000, { width: 208 }), { left: 100, width: 300 });
});

test("near the right edge it hangs from the trigger's right edge instead of running off", () => {
  // the Analytics sort pill: 120 wide, 30px from the edge, a 208px menu
  const f = fitAcross(trig(850, 120), 1000, { width: 208 });
  assert.equal(f.left + f.width, 970);
  assert.ok(f.left + f.width <= 992);
});

test("end alignment, and never off either side or wider than the window", () => {
  assert.deepEqual(fitAcross(trig(400, 80), 1000, { width: 176, align: "end" }), { left: 304, width: 176 });
  assert.deepEqual(fitAcross(trig(2, 40), 1000, { width: 176, align: "end" }), { left: 8, width: 176 });
  assert.deepEqual(fitAcross(trig(10, 100), 360, { width: 400 }), { left: 8, width: 344 });
});
