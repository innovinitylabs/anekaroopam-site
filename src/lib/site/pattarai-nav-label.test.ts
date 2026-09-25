import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PattaraiNavLabel } from "../../components/site/PattaraiNavLabel.tsx";
import {
  PATTARAI_ARIA_LABEL,
  PATTARAI_LABEL,
  PATTARAI_MOBILE_LABEL,
  PATTARAI_TAMIL,
} from "./pattarai-nav.ts";

test("desktop PattaraiNavLabel stacks English and Tamil without mid-dot", () => {
  const html = renderToStaticMarkup(
    createElement(PattaraiNavLabel, { variant: "desktop" }),
  );
  assert.match(html, new RegExp(PATTARAI_LABEL));
  assert.match(html, new RegExp(PATTARAI_TAMIL));
  assert.doesNotMatch(html, /·/);
  assert.match(html, /group-hover\/pattarai:opacity-0/);
  assert.match(html, /group-focus-visible\/pattarai:opacity-100/);
  assert.match(html, /font-anek-tamil/);
  assert.match(html, /aria-hidden/);
  assert.doesNotMatch(html, /sr-only/);
});

test("mobile PattaraiNavLabel keeps dual label for no-hover surfaces", () => {
  const html = renderToStaticMarkup(
    createElement(PattaraiNavLabel, { variant: "mobile" }),
  );
  assert.match(html, new RegExp(PATTARAI_LABEL));
  assert.match(html, new RegExp(PATTARAI_TAMIL));
  assert.match(html, /·/);
  assert.match(html, /font-anek-tamil/);
});

test("accessible name includes English and Tamil once", () => {
  assert.match(PATTARAI_ARIA_LABEL, /Pattarai/);
  assert.match(PATTARAI_ARIA_LABEL, /பட்டறை/);
  assert.equal(PATTARAI_MOBILE_LABEL, `${PATTARAI_LABEL} · ${PATTARAI_TAMIL}`);
});
