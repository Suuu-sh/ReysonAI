import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { advantages, buildAdvancedExplanation, renderAdvancedPlainText, sizeKind } from "../src/estimated/postflop-advanced.ts";
import { artifactPaths, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../scripts/postflop-ai/generate.mjs";
import { computeBoard, computeLaterExplain, computeLaterRangeFacts, computeLaterView, computeRangeFacts } from "../src/estimated/postflop-compute.ts";
import opening from "../src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../src/estimated/preflop-ranges.json" with { type: "json" };
import threeBets from "../src/estimated/three-bet-responses.json" with { type: "json" };
import fourBets from "../src/estimated/four-bet-responses.json" with { type: "json" };
import limp from "../src/estimated/limp-responses.json" with { type: "json" };

const defence = (o = {}) => ({ street: "flop", required_equity: 0.3, equity: 0.58, realized_equity: 0.45, percentile: 0.85,
  bettor_range: { value_pct: 75, bluff_pct: 25 }, faced_action: { action: "bet75", capped: false },
  blockers: { value_removed_pct: 20, bluff_removed_pct: 10 }, ...o });
const tiers = (monster, strong, draw, medium, air) => ({ monster, strong, draw, medium, air });
const rf = (hero, opp, sizes = {}, extra = {}) => ({ street: "flop", role: "ip", pfr: "ip", spr: 17, tiers: { hero, opp }, sizes, ...extra });
const polar = { share: 0.1, tiers: tiers(0.2, 0.1, 0.05, 0.05, 0.6) };
const merged = { share: 0.55, tiers: tiers(0.04, 0.3, 0.02, 0.32, 0.32) };
const bt = a => ({ equity_vs_defender: 0.62, actions: a });
export const cases = {
  flopAKo: { node: "btn_first", hand: "AKo", actionMix: { check: 0.2, bet33: 0.6, bet75: 0.2 }, tiers: { strong: 1 }, texture: "dry",
    explain: { equity: 0.7, actions: { bet33: { foldShare: 0.15 }, bet75: { foldShare: 0.4 } },
      bet_table: { actions: { bet33: { calledEquity: 0.66 }, bet75: { calledEquity: 0.6 } } }, betting: bt([]),
      range_facts: rf(tiers(0.05, 0.22, 0.02, 0.2, 0.51), tiers(0.04, 0.17, 0.02, 0.19, 0.58), { bet33: merged, bet75: polar }) } },
  flopKQo: { node: "bb_vs_75", hand: "KQo", actionMix: { call: 0.9, fold: 0.1 }, tiers: { strong: 1 }, texture: "wet",
    explain: { equity: 0.58, defence: defence(), range_facts: rf(tiers(0.03, 0.2, 0.05, 0.2, 0.52), tiers(0.12, 0.3, 0.05, 0.1, 0.43), {}, { role: "oop" }) } },
  flop92s: { node: "bb_vs_75", hand: "92s", actionMix: { fold: 0.8, raise: 0.2 }, tiers: { air: 1 }, texture: "wet",
    explain: { equity: 0.2, defence: defence({ equity: 0.2, realized_equity: 0.15, percentile: 0.05, blockers: { value_removed_pct: 3, bluff_removed_pct: 12 } }),
      range_facts: rf(tiers(0.03, 0.2, 0.05, 0.2, 0.52), tiers(0.12, 0.3, 0.05, 0.1, 0.43), {}, { role: "oop" }) } },
  turnAQs: { node: "turn_ip_first", hand: "AQs", actionMix: { check: 0.3, bet33: 0.1, bet75: 0.4, bet125: 0.2 }, tiers: { draw: 1 }, texture: "flush", 
    explain: { equity: 0.45, line: "checked", betting: { equity_vs_defender: 0.45, actions: [] }, actions: { bet33: { foldShare: 0.2 }, bet75: { foldShare: 0.5 }, bet125: { foldShare: 0.7 } },
      bet_table: { actions: { bet33: { calledEquity: 0.5 }, bet75: { calledEquity: 0.45 }, bet125: { calledEquity: 0.4 } } },
      range_facts: rf(tiers(0.05, 0.2, 0.05, 0.2, 0.5), tiers(0.05, 0.2, 0.05, 0.2, 0.5), { bet33: merged, bet75: polar, bet125: polar }, { street: "turn", runout_shift: { hero: 0.06, opp: 0 } }) } },
  riverA9s: { node: "river_oop_first", hand: "A9s", actionMix: { check: 0.5, bet75: 0.3, allin: 0.2 }, tiers: { medium: 1 }, texture: "over", 
    explain: { equity: 0.4, line: "checked", actions: { bet75: { foldShare: 0.3 }, allin: { foldShare: 0.5 } },
      bet_table: { actions: { bet75: { calledEquity: 0.6 }, allin: { calledEquity: 0.3 } } }, betting: { equity_vs_defender: 0.4, actions: [] },
      range_facts: rf(tiers(0.05, 0.2, 0, 0.25, 0.5), tiers(0.05, 0.2, 0, 0.25, 0.5), { bet75: polar, allin: polar }, { street: "river", role: "oop", spr: 2.5 }) } },
};
const sentences = text => text.split(/(?<=[.。])\s*/).map(s => s.trim()).filter(Boolean);

for (const locale of ["en", "ja"]) test(`advanced text has no numbers and distinct paragraphs and sentences (${locale})`, () => {
  for (const [name, c] of Object.entries(cases)) {
    const e = buildAdvancedExplanation({ locale, ...c });
    const played = Object.entries(c.actionMix).filter(([, f]) => f >= 0.05).map(([a]) => a);
    for (const a of played) assert.ok(e.blocks.some(b => b.action === a && b.text.length > 20), `${name} ${a}`);
    const texts = [e.headline, ...e.blocks.map(b => b.text)];
    assert.equal(new Set(texts).size, texts.length, name);
    const all = sentences(texts.join(locale === "en" ? " " : ""));
    assert.equal(new Set(all).size, all.length, `${name}: repeated sentence`);
    for (const t of [...texts, e.texture ?? ""]) {
      assert.doesNotMatch(t, /\d+(\.\d+)?\s*(%|bb|x\b|倍)/i, `${name}: ${t}`);
      assert.doesNotMatch(t, /GTO|\bEV\b|MDF/);
    }
    if (locale === "ja") for (const t of texts) assert.doesNotMatch(t, /\b(check|bet|call|fold|raise|value|bluff)\b/i, t);
    for (const b of e.blocks) assert.ok(sentences(b.text).length <= 5, `${name} ${b.action} too long`);
  }
});

test("Japanese copy uses the expected poker jargon", () => {
  const ja = name => { const e = buildAdvancedExplanation({ locale: "ja", ...cases[name] }); return [e.headline, ...e.blocks.map(b => b.text), e.texture ?? ""].join("\n"); };
  assert.match(ja("flopAKo"), /レンジアドバンテージ/);
  assert.match(ja("flopKQo"), /キャップ|レンジアドバンテージ/);
  assert.match(ja("turnAQs") + ja("riverA9s"), /ポラライズ/);
  const capped = { ...cases.flopKQo, explain: { ...cases.flopKQo.explain, range_facts: rf(tiers(0.005, 0.2, 0.05, 0.25, 0.495), tiers(0.1, 0.3, 0.05, 0.1, 0.45), {}, { role: "oop" }) } };
  assert.match(buildAdvancedExplanation({ locale: "ja", ...capped }).blocks.map(b => b.text).join(""), /キャップ/);
  assert.match(buildAdvancedExplanation({ locale: "en", ...capped }).blocks.map(b => b.text).join(" "), /capped/);
  assert.match(ja("flop92s"), /ブロッカー|ブラフレイズ/);
});

test("range and nut advantage statements follow the computed tier shares", () => {
  const text = (hero, opp, locale = "en") => {
    const e = buildAdvancedExplanation({ locale, ...cases.flopAKo, explain: { ...cases.flopAKo.explain, range_facts: rf(hero, opp, { bet33: merged, bet75: polar }) } });
    return [e.headline, ...e.blocks.map(b => b.text)].join(" ");
  };
  const moreNuts = text(tiers(0.12, 0.2, 0.02, 0.15, 0.51), tiers(0.03, 0.2, 0.02, 0.2, 0.55));
  assert.match(moreNuts, /nut advantage/);
  assert.match(text(tiers(0.12, 0.2, 0.02, 0.15, 0.51), tiers(0.03, 0.2, 0.02, 0.2, 0.55), "ja"), /ナッツアドバンテージ/);
  const fewerNuts = text(tiers(0.03, 0.2, 0.02, 0.2, 0.55), tiers(0.12, 0.2, 0.02, 0.15, 0.51));
  assert.doesNotMatch(fewerNuts, /nut advantage/);
  assert.doesNotMatch(text(tiers(0.03, 0.2, 0.02, 0.2, 0.55), tiers(0.12, 0.2, 0.02, 0.15, 0.51), "ja"), /ナッツアドバンテージ/);
  assert.match(fewerNuts, /opponent's range is ahead/);
  assert.match(text(tiers(0.05, 0.3, 0, 0.15, 0.5), tiers(0.04, 0.2, 0, 0.2, 0.56)), /range advantage/);
  const a = advantages(rf(tiers(0.05, 0.3, 0, 0.15, 0.5), tiers(0.05, 0.3, 0, 0.15, 0.5)));
  assert.deepEqual([a.range, a.nuts], ["even", "even"]);
  assert.equal(sizeKind(polar.tiers), "polar");
  assert.equal(sizeKind(merged.tiers), "merged");
  assert.equal(sizeKind(tiers(0.3, 0.5, 0, 0.1, 0.1)), "value");
});

test("renders the reference cases", () => {
  const out = [];
  for (const locale of ["ja", "en"]) for (const [n, c] of Object.entries(cases)) out.push(`## ${locale} ${n}\n${renderAdvancedPlainText(buildAdvancedExplanation({ locale, ...c }))}`);
  if (process.env.SHOW_ADVANCED) console.log(out.join("\n\n"));
});

const spotId = "BTN_open_BB_call";
const paths = artifactPaths(loadInputs(spotId).spot);
test("real BTN_open_BB_call facts produce grounded range facts and jargon", { skip: !existsSync(paths.candidate) || !existsSync(paths.laterCandidate) }, () => {
  const datasets = { opening, responses, threeBets, fourBets, limp };
  const inputs = loadInputs(spotId);
  const flopCandidate = loadCandidate(inputs), laterCandidate = loadLaterCandidate(inputs, flopCandidate);
  const board = "As7d2c";
  const view = computeBoard({ spotId, board, datasets, flopCandidate, laterCandidate });
  const row = view.nodes.btn_first.rows.find(r => r.hand === "AKo");
  const combos = row.combos.map(c => ({ cards: c.cards, weight: c.reachWeight ?? c.weight })).filter(c => c.weight > 0);
  const range_facts = computeRangeFacts({ spotId, board, node: "btn_first", prev: "bet33", history: [], datasets, flopCandidate });
  assert.ok(range_facts?.tiers?.hero && range_facts.sizes.bet33);
  const explain = { equity: 0.7, range_facts };
  const e = buildAdvancedExplanation({ locale: "ja", node: "btn_first", hand: "AKo", actionMix: row.mix, tiers: row.tiers, texture: view.texture, explain });
  assert.match(e.headline, /レンジアドバンテージ/);
  const later = { spotId, flop: "As7d2c", flopActions: "check", turn: "3s", turnActions: "check,check", river: "9h", riverActions: "", datasets, flopCandidate, laterCandidate };
  const lv = computeLaterView(later);
  const lrow = lv.rows.find(r => r.hand === "A9s");
  const lexplain = computeLaterExplain({ ...later, combos: lrow.combos.map(c => ({ cards: c.cards, weight: c.weight })).filter(c => c.weight > 0) });
  assert.equal("range_facts" in lexplain, false, "stored/parity payloads stay unchanged");
  const lfacts = computeLaterRangeFacts(later);
  assert.equal(lfacts.street, "river");
  assert.ok(lfacts.runout_shift);
});

test("the hand detail shows no detailed-number section or action table for any level", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/estimated/PostflopTrial.tsx", import.meta.url), "utf8");
  for (const marker of ["postflop-detailed-numbers", "ActionTableView", "explanation.facing.rows"]) assert.equal(src.includes(marker), false, marker);
});
