import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPattaraiPath,
  PATTARAI_ARIA_LABEL,
  PATTARAI_HREF,
  PATTARAI_LABEL,
  PATTARAI_MOBILE_LABEL,
  PATTARAI_TAMIL,
  PATTARAI_TITLE,
} from "./pattarai-nav.ts";

test("Pattarai nav preserves English default and Tamil enhancement", () => {
  assert.equal(PATTARAI_LABEL, "Pattarai");
  assert.equal(PATTARAI_TAMIL, "பட்டறை");
  assert.match(PATTARAI_MOBILE_LABEL, /Pattarai/);
  assert.match(PATTARAI_MOBILE_LABEL, /பட்டறை/);
  assert.match(PATTARAI_ARIA_LABEL, /Perception tools/);
  assert.match(PATTARAI_ARIA_LABEL, /Artwork preparation/);
  assert.match(PATTARAI_TITLE, /பட்டறை/);
  assert.equal(PATTARAI_HREF, "/perceive");
});

test("Pattarai active path matches /perceive workspace", () => {
  assert.equal(isPattaraiPath("/perceive"), true);
  assert.equal(isPattaraiPath("/perceive/tools/prepare"), true);
  assert.equal(isPattaraiPath("/archive"), false);
});
