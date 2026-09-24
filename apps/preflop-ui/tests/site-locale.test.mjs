import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transform } from "esbuild";

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
