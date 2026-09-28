import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "esbuild";
import { LOCALE_KEY, productLocale, rememberLocale } from "../src/locale.js";

async function loadCopy(file, exportName) {
  const source = readFileSync(new URL(`../src/site/${file}`, import.meta.url), "utf8");
  const { code } = await transform(source, { loader: "ts", format: "esm" });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return module[exportName];
}

function shapeOf(value) {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shapeOf(item)]));
  return typeof value;
}

test("Japanese service-site copy covers every English field", async () => {
  const en = await loadCopy("content.ts", "en");
  const ja = await loadCopy("content-ja.ts", "ja");
  assert.deepEqual(shapeOf(ja), shapeOf(en));
  assert.match(ja.hero.title1, /複雑/);
  assert.match(ja.pricing.note, /仮案/);
  assert.match(ja.preview.notGto, /GTO/);
  assert.equal(ja.pricing.plans[1].href, null);
});

test("the root site remembers its language without a separate route", () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  try {
    assert.equal(productLocale(), "en");
    rememberLocale("ja");
    assert.equal(values.get(LOCALE_KEY), "ja");
    assert.equal(productLocale(), "ja");
    rememberLocale("en");
    assert.equal(productLocale(), "en");
  } finally {
    globalThis.window = previousWindow;
  }
});
