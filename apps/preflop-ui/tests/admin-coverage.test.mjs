import test from "node:test";
import assert from "node:assert/strict";
import { coverageCatalog, formatBacklog } from "../src/admin/coverage.js";

test("every persisted spot maps onto the enumerated preflop tree", () => {
  const catalog = coverageCatalog();
  const offTree = catalog.categories.flatMap(c => c.rows).filter(row => row.path.startsWith("（"));
  assert.deepEqual(offTree.map(row => row.id), []);
  const byKey = Object.fromEntries(catalog.categories.map(c => [c.key, c]));
  assert.equal(byKey.open.todo, 0);
  assert.equal(byKey.response.total, 15);
  assert.equal(byKey.squeeze.total, 60);
  assert.equal(catalog.done + catalog.todo, catalog.total);
});

test("format backlog marks only built formats as done", () => {
  const formats = formatBacklog(10);
  assert.equal(formats.filter(format => format.built).length, 1);
  assert.ok(formats.filter(format => !format.built).every(format => format.spots === 10));
});
