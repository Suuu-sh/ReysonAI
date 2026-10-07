import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("comparison labels share typography and center independently of their icon", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const heading = css.slice(css.indexOf("/* Center the comparison labels themselves"));
  assert.match(heading, /thead th, \.site-compare thead th.is-us \{ font-family: inherit; font-weight: 700; line-height: 1.4/);
  assert.match(heading, /padding-inline: 24px/);
  assert.match(heading, /> img \{ position: absolute; left: 0/);
  assert.match(heading, /overflow-wrap: anywhere; text-align: center/);
});
