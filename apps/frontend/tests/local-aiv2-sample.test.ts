import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { localAiv2SampleMiddleware } from "../scripts/local-datasets.ts";
import { validateOpeningDataset } from "../src/estimated/opening-ranges.ts";
import baseline from "../src/estimated/opening-ranges.json" with { type: "json" };
import trackedSample from "../data/aiv2-preflop/samples/opening-ranges/UTG_open.json" with { type: "json" };

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
  assert.equal(trackedSample.metadata.scenario_id, "UTG_open");
  assert.equal(trackedSample.spot.hands.length, 169);
  assert.equal(new Set(trackedSample.spot.hands.map((row: any) => row.hand)).size, 169);
  assert.equal(trackedSample.spot.combo_mixes.length, 1326);
  assert.equal(new Set(trackedSample.spot.combo_mixes.map((row: any) => row.combo)).size, 1326);
  assert.equal(trackedSample.reasons.reasons.length, 169);
  assert.equal(new Set(trackedSample.reasons.reasons.map((row: any) => row.hand)).size, 169);
  assert.ok(trackedSample.reasons.reasons.every((row: any) => typeof row.text === "string" && row.text.length > 0 && typeof row.text_ja === "string" && row.text_ja.length > 0));
  assert.equal(createHash("sha256").update(JSON.stringify(trackedSample.reasons)).digest("hex"), trackedSample.metadata.reason_hash);

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
  assert.ok(Object.values(reasons.body.hands).every((hand: any) => typeof hand.reason === "string" && typeof hand.reason_ja === "string" && hand.reason_ja.length > 0));
  assert.match(reasons.body.hands.AA.reason, /Open 100%/);
  assert.match(reasons.body.hands.A2s.reason_ja, /^オープン45%、フォールド55%/);
  assert.match(reasons.body.hands.A9s.reason_ja, /^オープン90%、フォールド10%/);
  const a2s = trackedSample.reasons.reasons.find((row: any) => row.hand === "A2s")!;
  const a9s = trackedSample.reasons.reasons.find((row: any) => row.hand === "A9s")!;
  assert.equal(reasons.body.hands.A2s.reason, a2s.text);
  assert.equal(reasons.body.hands.A2s.reason_ja, a2s.text_ja);
  assert.equal(reasons.body.hands.A9s.reason, a9s.text);
  assert.equal(reasons.body.hands.A9s.reason_ja, a9s.text_ja);
  assert.equal(request("/v1/preflop/local/aiv2-sample/reasons/BTN_open").nextCalled, true);
  assert.equal(request("/v1/preflop/local/aiv2-sample/status", "POST").status, 405);
});
