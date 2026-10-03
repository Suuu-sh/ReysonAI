import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "esbuild";
import { LOCALE_KEY, productLocale, rememberLocale } from "../src/locale.ts";

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
  assert.equal(en.hero.title1, "Don't just play.");
  assert.equal(en.hero.title2, "Understand why.");
  assert.equal(ja.hero.title1, en.hero.title1);
  assert.equal(ja.hero.title2, en.hero.title2);
  assert.match(ja.preview.notGto, /GTO/);
  assert.equal(ja.pricing.plans[1].href, null);
});

test("Plus presents an approximate dollar price and daily value in English", async () => {
  const en = await loadCopy("content.ts", "en");
  assert.equal(en.pricing.plans[0].price, "$0");
  assert.equal(en.pricing.plans[1].price, "$3.70");
  assert.match(en.pricing.title2, /\$0\.12 a day/);
  assert.match(en.pricing.description, /US\$3\.70\/month.*US\$0\.12\/day.*30-day basis.*USD amount.*exchange rates/);
  assert.match(en.pricing.note, /isn't available yet/);
  assert.equal(en.pricing.plans[1].href, null);
});

test("Japanese Plus pricing shows the 30-day daily equivalent while billing remains unavailable", async () => {
  const ja = await loadCopy("content-ja.ts", "ja");
  assert.equal(ja.pricing.plans[1].price, "¥580");
  assert.match(ja.pricing.title2, /1日約19円/);
  assert.match(ja.pricing.description, /月額580円.*30日換算で1日あたり約19円/);
  assert.match(ja.pricing.note, /課金はまだ利用できません/);
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
