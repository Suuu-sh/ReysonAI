import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("HTML exposes the current approved mark as browser and touch icons", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const [file, size] of [["favicon-32.png", 32], ["icon-192.png", 192], ["apple-touch-icon.png", 180]]) {
    const png = readFileSync(new URL(`../public/${file}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  for (const file of ["favicon.ico", "icon-192.png", "apple-touch-icon.png"]) assert.ok(html.includes(`href="/${file}"`));
  const ico = readFileSync(new URL("../public/favicon.ico", import.meta.url));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.deepEqual(ico.subarray(22), readFileSync(new URL("../public/favicon-32.png", import.meta.url)));
});
