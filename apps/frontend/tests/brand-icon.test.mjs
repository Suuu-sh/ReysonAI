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
