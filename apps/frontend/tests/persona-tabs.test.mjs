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


test("narrow panels reflow instead of clipping their cards and full reasons", () => {
  const css = readFileSync(new URL("../src/site/site.css", import.meta.url), "utf8");
  const responsive = css.slice(css.indexOf("/* Shrink real content"));
  assert.match(responsive, /@media \(max-width: 359px\)/);
  assert.match(responsive, /\.site-persona-view.is-simple \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(responsive, /repeat\(13, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(responsive, /overflow: hidden|text-overflow|max-height:/);
});

test("hero mask follows the actual matrix rectangle after pin resize and hash navigation", () => {
  const source = readFileSync(new URL("../src/site/ServiceSite.tsx", import.meta.url), "utf8");
  assert.match(source, /querySelector\("\.site-matrix"\)\?\.getBoundingClientRect\(\)/);
  assert.match(source, /matrix\?\.bottom \?\? square.bottom/);
  assert.match(source, /requestAnimationFrame\(update\)/);
  assert.match(source, /addEventListener\("hashchange", schedule\)/);
  assert.match(source, /observer\?\.observe\(ending.current\)/);
});
