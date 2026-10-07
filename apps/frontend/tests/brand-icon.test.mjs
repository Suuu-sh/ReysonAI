import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
test("all brand surfaces use the approved abstract Ace mark, not a suit icon", () => {
  for (const path of ["../src/components/layout.tsx", "../src/components/Onboarding.tsx", "../src/site/ServiceSite.tsx"]) {
    const source = read(path);
    assert.match(source, /BrandIcon/);
    assert.doesNotMatch(source, /\bSpade\b/);
  }
  assert.match(read("../src/site/ServiceSite.tsx"), /<PlayingCard\b/);
});
test("the shared icon uses the approved abstract Ace PNG and is decorative beside brand text", () => {
  const source = read("../src/components/BrandIcon.tsx");
  assert.match(source, /reyson-abstract-ace\.png/);
  assert.match(source, /alt="" aria-hidden="true"/);
  const bytes = readFileSync(new URL("../src/assets/brand/reyson-abstract-ace.png", import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
});

test("combined brand marks share the service header's tight spacing", () => {
  const appCss = read("../src/styles.css");
  const siteCss = read("../src/site/site.css");
  assert.match(appCss, /--brand-lockup-gap: 2px;/);
  for (const selector of ["brand", "onboarding-brand"]) {
    assert.match(appCss, new RegExp(`\\.${selector} \\{[^}]*gap: var\\(--brand-lockup-gap\\)`));
  }
  assert.match(siteCss, /\.site-brand \{[^}]*gap: var\(--brand-lockup-gap\)/);
  const comparisonRules = siteCss.match(/\.site-compare-label > img \{[^}]*\}/g);
  assert.equal(comparisonRules.length, 2);
  for (const rule of comparisonRules) assert.match(rule, /right: calc\(100% \+ var\(--brand-lockup-gap\)\)/);
});
