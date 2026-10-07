import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("comparison labels share typography and center the text with a directly attached icon", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const heading = css.slice(css.indexOf("/* Center the label itself"));
  assert.match(heading, /thead th, \.site-compare thead th.is-us \{ font-family: inherit; font-weight: 700; line-height: 1.4/);
  assert.match(heading, /site-compare-label \{ position: relative; display: inline-block/);
  assert.match(heading, /> img \{ position: absolute; right: calc\(100% \+ 6px\)/);
  assert.match(heading, /overflow-wrap: anywhere; text-align: center/);
});
