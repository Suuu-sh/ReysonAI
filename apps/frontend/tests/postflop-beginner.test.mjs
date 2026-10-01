import test from "node:test";
import assert from "node:assert/strict";
import { buildBeginnerExplanation, renderBeginnerPlainText } from "../src/estimated/postflop-beginner.ts";

const defence = (o = {}) => ({ street: "flop", required_equity: 0.3, equity: 0.58, realized_equity: 0.45, percentile: 0.85,
  bettor_range: { value_pct: 75, bluff_pct: 25 }, faced_action: { action: "bet75", capped: false },
  blockers: { value_removed_pct: 20, bluff_removed_pct: 10 }, ...o });
const bt = a => ({ equity_vs_defender: 0.62, actions: a });
export const cases = {
  flopAKo: { node: "btn_first", hand: "AKo", actionMix: { check: 0.2, bet33: 0.6, bet75: 0.2 }, tiers: { strong: 1 }, texture: "dry",
    explain: { equity: 0.7, actions: { bet33: { foldShare: 0.15 }, bet75: { foldShare: 0.4 } },
      bet_table: { actions: { bet33: { calledEquity: 0.66 }, bet75: { calledEquity: 0.6 } } }, betting: bt([]) } },
  flopKQo: { node: "bb_vs_75", hand: "KQo", actionMix: { call: 0.9, fold: 0.1 }, tiers: { strong: 1 }, texture: "wet",
    explain: { equity: 0.58, defence: defence() } },
  flop92s: { node: "bb_vs_75", hand: "92s", actionMix: { fold: 0.8, raise: 0.2 }, tiers: { air: 1 }, texture: "wet",
    explain: { equity: 0.2, defence: defence({ equity: 0.2, realized_equity: 0.15, percentile: 0.05, blockers: { value_removed_pct: 3, bluff_removed_pct: 12 } }) } },
  turnAQs: { node: "turn_ip_first", hand: "AQs", actionMix: { check: 0.3, bet33: 0.1, bet75: 0.4, bet125: 0.2 }, tiers: { draw: 1 }, texture: "flush",
    explain: { equity: 0.45, betting: { equity_vs_defender: 0.45, actions: [] }, actions: { bet33: { foldShare: 0.2 }, bet75: { foldShare: 0.5 }, bet125: { foldShare: 0.7 } },
      bet_table: { actions: { bet33: { calledEquity: 0.5 }, bet75: { calledEquity: 0.45 }, bet125: { calledEquity: 0.4 } } }, } },
  riverA9s: { node: "river_oop_first", hand: "A9s", actionMix: { check: 0.5, bet75: 0.3, allin: 0.2 }, tiers: { medium: 1 }, texture: "over",
    explain: { equity: 0.4, actions: { bet75: { foldShare: 0.3 }, allin: { foldShare: 0.5 } },
      bet_table: { actions: { bet75: { calledEquity: 0.6 }, allin: { calledEquity: 0.3 } } }, betting: { equity_vs_defender: 0.4, actions: [] } } },
};

for (const locale of ["en", "ja"]) test(`beginner text has no numbers and one distinct paragraph per action (${locale})`, () => {
  for (const [name, c] of Object.entries(cases)) {
    const e = buildBeginnerExplanation({ locale, ...c });
    const played = Object.entries(c.actionMix).filter(([, f]) => f >= 0.05).map(([a]) => a);
    for (const a of played) assert.ok(e.blocks.some(b => b.action === a && b.text.length > 20), `${name} ${a}`);
    const texts = [e.headline, ...e.blocks.map(b => b.text)];
    assert.equal(new Set(texts).size, texts.length, name);
    for (const t of [...texts, e.texture ?? ""]) {
      assert.doesNotMatch(t, /\d+(\.\d+)?\s*(%|bb)/i, `${name}: ${t}`);
      assert.doesNotMatch(t, /GTO|\bEV\b|MDF/);
    }
    if (locale === "ja") for (const t of texts) assert.doesNotMatch(t, /\b(check|bet|call|fold|raise|value|bluff)\b/i, t);
  }
});

test("renders the five reference cases", () => {
  const out = [];
  for (const locale of ["ja", "en"]) for (const [n, c] of Object.entries(cases)) out.push(`## ${locale} ${n}\n${renderBeginnerPlainText(buildBeginnerExplanation({ locale, ...c }))}`);
  if (process.env.SHOW_BEGINNER) console.log(out.join("\n\n"));
});

test("detailed numbers are rendered only for the advanced level", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/estimated/PostflopTrial.tsx", import.meta.url), "utf8");
  assert.match(src, /const advanced = loadProfile\(\)\?\.level === "advanced"/);
  assert.match(src, /\{advanced && <details[^>]*postflop-detailed-numbers/);
  const detailsAt = src.indexOf("postflop-detailed-numbers");
  for (const marker of ["explanation.facing.rows", "ActionTableView table="]) assert.ok(src.indexOf(marker, detailsAt) > detailsAt, marker);
});
