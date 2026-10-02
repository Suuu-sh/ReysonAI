import test from "node:test";
import assert from "node:assert/strict";
import { buildAdvancedExplanation, renderAdvancedPlainText } from "../src/estimated/postflop-advanced.ts";
import { computeBoard, computeLaterView } from "../src/estimated/postflop-compute.ts";
import { flopInput, laterInput, realContext, repetitionShare, sampleRows, spotId } from "./helpers/real-hands.mjs";

const defence = (o = {}) => ({ street: "flop", required_equity: 0.25, equity: 0.5, realized_equity: 0.45, percentile: 0.7,
  bettor_range: { value_pct: 45, bluff_pct: 55 }, faced_action: { action: "bet33", capped: false },
  blockers: { value_removed_pct: 10, bluff_removed_pct: 10 }, ...o });
const tiers = (monster, strong, draw, medium, air) => ({ monster, strong, draw, medium, air });
const rf = { street: "flop", role: "oop", pfr: "ip", spr: 17, tiers: { hero: tiers(0.04, 0.2, 0.08, 0.2, 0.48), opp: tiers(0.04, 0.2, 0.05, 0.2, 0.51) }, sizes: {} };
const texts = (locale, input) => { const e = buildAdvancedExplanation({ locale, ...input }); return { e, all: [e.headline, ...e.blocks.map(b => b.text), e.texture ?? ""].join("\n") }; };
const NUMBERS = /\d+(\.\d+)?\s*(%|bb|x\b|倍)/i;

const facingA4s = (cards) => ({ node: "bb_vs_33", hand: cards, cards, board: "6h5h2d", actionMix: { call: 0.55, raise: 0.45 }, tiers: { air: 1 }, texture: "wet",
  positions: { ip: "BTN", oop: "BB" }, explain: { equity: 0.6, defence: defence({ equity: 0.6, realized_equity: 0.5 }), range_facts: rf } });

test("A♠4♠ on 6♥5♥2♦ facing a bet is a semi-bluff gutshot with an overcard, never a value raise", () => {
  const ja = texts("ja", facingA4s("As4s")), en = texts("en", facingA4s("As4s"));
  assert.match(ja.all, /セミブラフ/);
  assert.match(ja.all, /ガットショット/);
  assert.match(ja.all, /オーバーカード/);
  assert.match(ja.all, /3で完成/);
  assert.doesNotMatch(ja.all, /バリューレイズ|バリューで/);
  assert.match(en.all, /semi-bluff/);
  assert.match(en.all, /gutshot/);
  assert.match(en.all, /overcard/);
  assert.doesNotMatch(en.all, /raises for value/);
  const raise = ja.e.blocks.find(b => b.action === "raise").text;
  assert.match(raise, /セミブラフ/);
  assert.doesNotMatch(ja.all + en.all, NUMBERS);
});

test("A♥4♥ is described as the nut flush draw plus a gutshot", () => {
  const ja = texts("ja", facingA4s("Ah4h")).all, en = texts("en", facingA4s("Ah4h")).all;
  assert.match(ja, /ナッツフラッシュドロー/);
  assert.match(ja, /コンボドロー/);
  assert.match(en, /nut flush draw/);
  assert.match(en, /combo draw/);
});

test("a set and two pair raise for value and name the worse hands that pay", () => {
  const raise = (cards, board) => ({ node: "bb_vs_75", hand: cards, cards, board, actionMix: { raise: 0.7, call: 0.3 }, tiers: { monster: 1 }, texture: "dry",
    positions: { ip: "BTN", oop: "BB" }, explain: { equity: 0.85, defence: defence({ equity: 0.85, realized_equity: 0.8, required_equity: 0.3 }), range_facts: rf } });
  const set = texts("en", raise("7c7d", "Kh7s2c")), setJa = texts("ja", raise("7c7d", "Kh7s2c"));
  assert.match(set.all, /set of sevens/);
  assert.match(set.e.blocks.find(b => b.action === "raise").text, /paid by one-pair hands/);
  assert.match(setJa.e.blocks.find(b => b.action === "raise").text, /バリュー|払って/);
  assert.match(setJa.all, /ワンペア/);
  const twoPair = texts("en", raise("Kc7d", "Kh7s2c"));
  assert.match(twoPair.all, /top two pair/);
  assert.match(twoPair.e.blocks.find(b => b.action === "raise").text, /paid by one-pair hands/);
});

test("a bluff names its blockers or backdoors, a river bluff has no draws", () => {
  const bet = (cards, board, node = "btn_first", extra = {}) => ({ node, hand: cards, cards, board, actionMix: { bet33: 0.5, check: 0.5 }, tiers: { air: 1 }, texture: "dry",
    positions: { ip: "BTN", oop: "BB" }, explain: { equity: 0.3, betting: { equity_vs_defender: 0.3 }, actions: { bet33: { foldShare: 0.5 } }, range_facts: rf, ...extra } });
  const heartsBoard = texts("en", bet("Ah9c", "Kh7h2d")).all;
  assert.match(heartsBoard, /blocks the nut flush/);
  const bd = texts("en", bet("Ah9h", "Kh7c2d")).all;
  assert.match(bd, /backdoor flush draw/);
  assert.match(texts("ja", bet("Ah9h", "Kh7c2d")).all, /バックドアフラッシュドロー/);
});

const ctx = realContext();
const opts = { skip: ctx ? false : "postflop artifacts are not built" };

test("real hands: computed facts render the four reference spots (JA and EN) without numbers", opts, () => {
  const spots = [
    flopInput(ctx, { board: "6h5h2d", node: "bb_vs_33", hand: "A4s", cards: "As4s" }),
    flopInput(ctx, { board: "6h5h2d", node: "bb_vs_33", hand: "A4s", cards: "Ah4h" }),
    flopInput(ctx, { board: "KhTh4s", node: "bb_vs_75", hand: "KQo" }),
    flopInput(ctx, { board: "KhTh4s", node: "bb_vs_75", hand: "92s" }),
    flopInput(ctx, { board: "As7d2c", node: "btn_first", hand: "AKo" }),
    flopInput(ctx, { board: "As7d2c", node: "btn_first", hand: "65s" }),
    laterInput(ctx, { flop: "As7d2c", flopActions: "check", turn: "3s", turnActions: "check,check", river: "9h", hand: "A9s" }),
  ];
  const out = [];
  for (const input of spots) {
    assert.ok(input);
    for (const locale of ["ja", "en"]) {
      const e = buildAdvancedExplanation({ locale, ...input });
      out.push(`## ${input.hand} ${input.node} ${locale}\n${renderAdvancedPlainText(e)}`);
      const text = [e.headline, ...e.blocks.map(b => b.text), e.texture ?? ""].join("\n");
      assert.doesNotMatch(text, NUMBERS);
      assert.doesNotMatch(text, /GTO|\bEV\b|MDF/);
    }
  }
  const a4s = buildAdvancedExplanation({ locale: "ja", ...spots[0] });
  assert.match(a4s.blocks.map(b => b.text).join(""), /ガットショット/);
  assert.doesNotMatch(a4s.blocks.find(b => b.action === "raise")?.text ?? "", /バリューレイズ|バリューで/);
  const combo = buildAdvancedExplanation({ locale: "ja", ...spots[1] }).blocks.map(b => b.text).join("");
  assert.match(combo, /ナッツフラッシュドロー/);
  if (process.env.SHOW_ADVANCED) console.log(out.join("\n\n"));
});

test("real hands: fewer than a quarter of the sentences are shared with another hand at the same node", opts, () => {
  const text = (input, locale) => { const e = buildAdvancedExplanation({ locale, ...input }); return [e.headline, ...e.blocks.map(b => b.text), ...(e.texture ? [e.texture] : [])].join(locale === "en" ? " " : ""); };
  const nodes = {
    "flop bb_vs_75 KhTh4s": () => sampleRows(computeBoard({ spotId, board: "KhTh4s", ...ctx }).nodes.bb_vs_75.rows, 10).map(r => flopInput(ctx, { board: "KhTh4s", node: "bb_vs_75", hand: r.hand })),
    "flop btn_first As7d2c": () => sampleRows(computeBoard({ spotId, board: "As7d2c", ...ctx }).nodes.btn_first.rows, 10).map(r => flopInput(ctx, { board: "As7d2c", node: "btn_first", hand: r.hand })),
    "turn 3s": () => { const b = { flop: "As7d2c", flopActions: "check", turn: "3s", turnActions: "" }; return sampleRows(computeLaterView({ spotId, ...b, ...ctx }).rows, 10).map(r => laterInput(ctx, { ...b, hand: r.hand })); },
    "river 9h": () => { const b = { flop: "As7d2c", flopActions: "check", turn: "3s", turnActions: "check,check", river: "9h" }; return sampleRows(computeLaterView({ spotId, ...b, ...ctx }).rows, 10).map(r => laterInput(ctx, { ...b, hand: r.hand })); },
  };
  const report = [];
  for (const [label, make] of Object.entries(nodes)) for (const locale of ["ja", "en"]) {
    const inputs = make().filter(Boolean);
    assert.ok(inputs.length >= 8, `${label}: sampled ${inputs.length} hands`);
    const ex = inputs.map(i => ({ name: i.hand, text: text(i, locale) }));
    const literal = repetitionShare(ex).mean, masked = repetitionShare(ex, { mask: true }).mean;
    report.push(`${label} ${locale} literal ${literal.toFixed(3)} masked ${masked.toFixed(3)}`);
    assert.ok(literal < 0.25 && masked < 0.25, `${label} ${locale}: ${literal} / ${masked}`);
    for (const x of ex) assert.doesNotMatch(x.text, NUMBERS);
  }
  if (process.env.SHOW_ADVANCED) console.log(report.join("\n"));
});
