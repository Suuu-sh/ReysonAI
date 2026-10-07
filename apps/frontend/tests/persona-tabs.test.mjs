import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("all three responsive persona choices fit and wrap without clipping or horizontal scroll", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const tabs = css.slice(css.indexOf("/* Every responsive persona choice"));
  assert.match(tabs, /@media \(max-width: 960px\)/);
  assert.match(tabs, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(tabs, /min-height: 44px/);
  assert.match(tabs, /overflow: visible/);
  assert.match(tabs, /display: block; min-width: 0;[^}]*white-space: normal; overflow-wrap: anywhere/);
  assert.doesNotMatch(tabs, /overflow-x: auto|overflow: hidden|text-overflow/);
});
