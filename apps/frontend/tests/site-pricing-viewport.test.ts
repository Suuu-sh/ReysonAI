import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("desktop pricing fits below the header without clipping mobile content", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const desktopPricing = css.slice(css.indexOf("/* Keep desktop pricing readable"));

  assert.match(desktopPricing, /@media \(min-width: 721px\)/);
  assert.match(desktopPricing, /\.site-section\.site-pricing\s*\{[^}]*min-height: calc\(100svh - var\(--header-height\)\);[^}]*padding-block: clamp\(20px, 4svh, 44px\);/);
  assert.match(desktopPricing, /\.site-plans\s*\{[^}]*margin-top: clamp\(16px, 2\.4svh, 26px\);/);
  assert.match(desktopPricing, /\.site-plan\s*\{[^}]*padding: clamp\(18px, 2\.2svh, 24px\);/);
  assert.doesNotMatch(desktopPricing, /\.site-pricing[^}]*\b(?:max-height|overflow):|(?<![-\w])height:/);
  assert.doesNotMatch(desktopPricing, /\.site-plan[^}]*transform:/);

  const pricing = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.match(pricing, /<span>\{plan\.status\}<\/span>/);
  assert.match(pricing, /\{plan\.price\}/);
  assert.match(pricing, /\{plan\.features\.map/);
  assert.match(pricing, /\{c\.pricing\.note\}/);
});
