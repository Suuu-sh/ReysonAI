import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { expandContinuationReasons } from "../src/estimated/continuation-reason-format.ts";
import { hands } from "../src/data.ts";
import { validateContinuationDataset } from "../src/estimated/continuation-responses.ts";
import { auditContinuationEstimates } from "../src/estimated/continuation-audit.ts";
import { checkRangeBalance, checkCrossStrengthInversion } from "../src/estimated/audit.ts";
import { isBlockingAuditFinding } from "../src/estimated/audit-policy.ts";
import { continuationReasonFingerprint } from "../scripts/lib/continuation-reasons.mjs";

const root = new URL("../src/estimated/", import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(`${name}.json`, root), "utf8"));
const datasets = Object.fromEntries(["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses"].map(name => [name, load(name)]));
const available = existsSync(new URL("continuation-responses.json", root));
const data = available ? load("continuation-responses") : null, equities = available ? load("continuation-call-equities") : null;
const publishedTest = (name, fn) => test(name, { skip: available ? false : "Run node scripts/build-continuations.mjs --install to verify generated publication artifacts" }, fn);

publishedTest("all 3,115 published continuation decisions pass strict sources, flow, EV and joint defense", () => {
  assert.equal(validateContinuationDataset(data, datasets), data);
  assert.equal(data.catalog_spot_count, 3115);
  assert.equal(data.spot_count, 1611);
  assert.equal(data.omitted_unreachable_count, 1504);
  assert.equal(data.entry_count, 272259);
  const actual = auditContinuationEstimates(data, datasets, equities, { checkRangeBalance, checkCrossStrengthInversion });
  assert.deepEqual(actual.findings.filter(isBlockingAuditFinding), []);
  assert.deepEqual(actual, load("continuation-audit-report"));
  assert.ok(actual.defense.length > 0);
  assert.ok(actual.defense.every(event => event.foldConfidence.upper <= event.threshold + (event.method === "exact" ? 1e-12 : 0) ||
    event.capacitySaturated && event.capacityConfidence.lower > event.threshold));
});

publishedTest("every published continuation reason covers 169 hands and pins the current complete sources", () => {
  const fingerprint = continuationReasonFingerprint({ data, datasets, equities });
  for (const spot of data.spots) {
    const reason = expandContinuationReasons(load(`reasons/${spot.id}`)), entry = equities.spots[spot.id];
    assert.equal(reason.spot_id, spot.id);
    assert.equal(reason.type, "continuation");
    assert.equal(reason.source_fingerprint, fingerprint, spot.id);
    // JSON object keys for numeric pairs (22..99) enumerate before strings.
    assert.deepEqual(Object.keys(reason.hands).sort(), [...hands].sort());
    for (const hand of hands) {
      const item = reason.hands[hand];
      assert.ok(typeof item.reason === "string" && item.reason.length > 0);
      if (entry.equities[hand] === null) {
        assert.equal(item.facts.reach_pct, 0);
        assert.equal(item.facts.call_ev_bb, null);
        assert.match(item.reason, /対象外/);
      } else {
        assert.ok(item.facts.reach_pct > 0);
        assert.equal(item.facts.equity_pct, entry.equities[hand] * 100);
        if (spot.bet_level === 5) assert.equal(item.facts.eqr, 1);
      }
    }
  }
});

publishedTest("published profiles never keep generic non-AA raises against exact AA-only live support", () => {
  let cases = 0;
  for (const spot of data.spots) {
    if (spot.bet_level === 5 || spot.unreachable || !equities.spots[spot.id].input.ranges.some(range => range.length === 1 && range[0][0] === "AA")) continue;
    cases++;
    assert.ok(spot.hands.every(row => row.hand === "AA" || row.all_in + row.four_bet === 0), spot.id);
  }
  assert.ok(cases > 0);
});

publishedTest("the production detailed-reason loader expands compact payloads and omits impossible histories", async () => {
  const { loadDetailedReasons, hasDetailedReasons } = await import("../src/estimated/detailed-reasons.ts");
  const { continuationSpots } = await import("../src/estimated/continuation-tree.ts");
  const first = data.spots[0];
  assert.deepEqual(await loadDetailedReasons(first.id), expandContinuationReasons(load(`reasons/${first.id}`)));
  const saved = new Set(data.spots.map(spot => spot.id));
  const impossible = continuationSpots.find(spot => !saved.has(spot.id));
  assert.equal(hasDetailedReasons(impossible.id), false);
  assert.equal(await loadDetailedReasons(impossible.id), null);
});
