import test from "node:test";
import assert from "node:assert/strict";
import { localAiv2SampleMiddleware } from "../scripts/local-datasets.ts";
import { validateOpeningDataset } from "../src/estimated/opening-ranges.ts";
import baseline from "../src/estimated/opening-ranges.json" with { type: "json" };

function request(path: string, method = "GET") {
  let body = "";
  let status = 200;
  let nextCalled = false;
  const headers = new Map<string, string>();
  const res = {
    setHeader: (key: string, value: string) => headers.set(key, value),
    writeHead: (value: number) => { status = value; return res; },
    end: (value = "") => { body = value; return res; },
  };
  localAiv2SampleMiddleware({ url: path, method }, res, () => { nextCalled = true; });
  return { body: body ? JSON.parse(body) : null, status, nextCalled, headers };
}

test("local AIv2 endpoint exposes only the validated UTG-open sample", () => {
  const status = request("/v1/preflop/local/aiv2-sample/status");
  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { available: true, scenario: "UTG_open", method: "llm-range-wide-combo-v3" });

  const opening = request("/v1/preflop/local/aiv2-sample/opening-ranges");
  const baseSpot = baseline.spots.find(spot => spot.id === "UTG_open")!;
  const sampleSpot = opening.body.spots.find((spot: any) => spot.id === "UTG_open");
  assert.equal(sampleSpot.hands.length, 169);
  assert.equal(validateOpeningDataset(opening.body).spots.find(spot => spot.id === "UTG_open")?.hands.length, 169);
  assert.equal(sampleSpot.combo_mixes.length, 1326);
  assert.equal(opening.body.metadata.aiv2_local_sample.concrete_combo_count, 1326);
  assert.ok(sampleSpot.hands.some((row: any, index: number) => row.open !== baseSpot.hands[index].open), "sample should visibly differ from AIv1");
  assert.deepEqual(opening.body.spots.filter((spot: any) => spot.id !== "UTG_open"), baseline.spots.filter(spot => spot.id !== "UTG_open"));

  const reasons = request("/v1/preflop/local/aiv2-sample/reasons/UTG_open");
  assert.equal(Object.keys(reasons.body.hands).length, 169);
  assert.match(reasons.body.hands.AA.reason, /Open 100%/);
  assert.equal(request("/v1/preflop/local/aiv2-sample/reasons/BTN_open").nextCalled, true);
  assert.equal(request("/v1/preflop/local/aiv2-sample/status", "POST").status, 405);
});
