import assert from "node:assert/strict";
import test from "node:test";
import {
  isSiteNavScrolled,
  SITE_NAV_SCROLL_THRESHOLD_PX,
} from "./site-nav-scroll.ts";

test("site nav stays transparent at and below the threshold", () => {
  assert.equal(SITE_NAV_SCROLL_THRESHOLD_PX, 32);
  assert.equal(isSiteNavScrolled(0), false);
  assert.equal(isSiteNavScrolled(32), false);
});

test("site nav uses scrolled surface above the threshold", () => {
  assert.equal(isSiteNavScrolled(33), true);
  assert.equal(isSiteNavScrolled(320), true);
});
