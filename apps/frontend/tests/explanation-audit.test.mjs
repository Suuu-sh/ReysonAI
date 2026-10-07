import test from "node:test";
import assert from "node:assert/strict";
import { auditExplanationCase, enumerateOpponentOracle, evaluateBest, FINDING_KINDS, oracleDraws, oracleTier, parseOracleCards } from "../scripts/postflop-ai/audit-explanations-oracle.mjs";

const audit = (combo, board, text, extra = {}) => auditExplanationCase({ combo, board, locale: "en", rendered: { headline: text }, ...extra });
const has = (findings, kind) => assert.ok(findings.some(f => f.kind === kind), `Missing ${kind}: ${JSON.stringify(findings)}`);
const lacks = (findings, kind) => assert.ok(!findings.some(f => f.kind === kind), `Unexpected ${kind}: ${JSON.stringify(findings)}`);

test("independent evaluator selects actual best-five ranks, kickers and wheel", () => {
  const twoPair = evaluateBest("Kc3cKh8h8c3h");
  assert.equal(twoPair.category, "twoPair"); assert.deepEqual(twoPair.ranks.slice(0, 2), [11, 6]);
  assert.deepEqual(twoPair.cards.map(c => c >> 2).sort((a, b) => b - a), [11, 11, 6, 6, 1]);
  assert.equal(evaluateBest("Ah2c3d4h5sKdQc").ranks[0], 3);
  assert.equal(evaluateBest("KhKdKc5s5d2c2d").category, "fullHouse");
  assert.equal(evaluateBest("KhKdKcKs5d5c2d").ranks[1], 3);
  assert.equal(evaluateBest("AhKhQhJhTh2c3d").category, "straightFlush");
});

test("rank assertions understand every production plural including sixes and deuces", () => {
  const ranks = "23456789TJQKA", plurals = ["deuces", "threes", "fours", "fives", "sixes", "sevens", "eights", "nines", "tens", "jacks", "queens", "kings", "aces"];
  for (let r = 0; r < ranks.length; r++) {
    const rank = ranks[r], others = [...ranks].filter(card => card !== rank).slice(-2);
    lacks(audit(`${rank}c${rank}d`, `${rank}h${others[0]}s${others[1]}s`, `You hold a set of ${plurals[r]}.`), "made-hand-wrong");
  }
  lacks(audit("6c2c", "6h2dKs", "You hold two pair (sixes and deuces)."), "made-hand-wrong");
  has(audit("6c2c", "6h2dKs", "You hold two pair (sixes and threes)."), "made-hand-wrong");
  has(audit("7c7d", "Kh7s2c", "You hold a set of sixes."), "made-hand-wrong");
  lacks(audit("Ac3c", "4h5hKd", "You hold a gutshot (a deuce completes it)."), "draw-wrong");
  has(audit("Ac3c", "4h5hKd", "You hold a gutshot (a three completes it)."), "draw-wrong");
});

test("tier-mismatch checks updated paired-board participation and hero text, not opponent/range", () => {
  const cases = [["QcQd", "medium"], ["AcAd", "strong"], ["Kc2d", "monster"], ["AcQd", "air"]];
  for (const [combo, tier] of cases) {
    assert.equal(oracleTier(combo, "KhKd4s"), tier);
    lacks(audit(combo, "KhKd4s", "The opponent has a strong hand; the range can contain monster hands.", { observedTier: tier, expectedTier: tier }), "tier-mismatch");
    has(audit(combo, "KhKd4s", "Your hand is a monster hand.", { observedTier: tier, expectedTier: tier === "monster" ? "medium" : tier }), "tier-mismatch");
  }
  has(audit("QcQd", "KhKd4s", "Q♣Q♦ has a strong pair.", { observedTier: "medium", expectedTier: "medium" }), "tier-mismatch");
  lacks(audit("QcQd", "KhKd4s", "Your hand is not a strong pair.", { expectedTier: "medium" }), "tier-mismatch");
});

test("A1 counterfeit pairs: actual two selected pairs, own top-two claim and rank claim", () => {
  has(audit("Kc3c", "Kh8h8c3h", "You hold top two pair (kings and threes)."), "made-hand-wrong");
  has(audit("Kc3c", "Kh8h8c3h", "You hold two pair with the top pair."), "made-hand-wrong");
  lacks(audit("Kc3c", "Kh8h8c3h", "You hold two pair that leans on the board pair (kings and eights)."), "made-hand-wrong");
  has(audit("2d3c", "KdKs9c9h2c", "You hold top two pair."), "made-hand-wrong");
  lacks(audit("2d3c", "KdKs9c9h2c", "You hold only the two pair on the board."), "made-hand-wrong");
  has(audit("Kc3c", "Kh8h8c3h", "K♣3♣はトップペアを含むツーペアです。", { locale: "ja" }), "made-hand-wrong");
});

test("A2 board-only full house/straight/flush/royal cannot claim value advantage", () => {
  const cases = [["2c2d", "KhKdKc5s5d", "full house"], ["2c2d", "Th9d8c7s6h", "straight"], ["Ac2c", "Ah7h2h5hKh", "flush"], ["2c2d", "AhKhQhJhTh", "straight flush"]];
  for (const [combo, board, name] of cases) {
    assert.equal(enumerateOpponentOracle(combo, board).playsBoard, true);
    has(audit(combo, board, `You hold a ${name} and raise for value.`), "made-hand-wrong");
    lacks(audit(combo, board, `You hold only the board's ${name} (a split); you do not raise for value.`), "made-hand-wrong");
  }
});

test("A3 legal opponent enumeration counts result classes and shape-based flush upgrades", () => {
  const o = enumerateOpponentOracle("5c5d", "KdJs9c9h");
  assert.equal(o.total, 46 * 45 / 2);
  assert.ok(o.tally.topPair.other > o.tally.topPair.loser);
  has(audit("5c5d", "KdJs9c9h", "You get paid by top pair."), "beats-claim");
  has(audit("TcJd", "Qh9d9c8s", "You get paid by sets."), "beats-claim");
  lacks(audit("7c7d", "Kh7s2c", "You get paid by one-pair hands."), "beats-claim");
  lacks(audit("5c5d", "KdJs9c9h", "You cannot get paid by top pair; the opponent's top pair beats you."), "beats-claim");
  const upgraded = enumerateOpponentOracle("AcAd", "Kh7h2h5h");
  // Non-heart Kx loses, Kx with a heart upgrades to a flush and wins. The
  // latter must remain in the *shape* class even when the majority still loses.
  assert.ok(upgraded.tally.topPair.other > 0);
  assert.ok(upgraded.tally.topPair.loser > 0);
  const withoutUpgrades = upgraded.tally.pair.other;
  assert.ok(upgraded.tally.topPair.other > withoutUpgrades);
  lacks(audit("3c3d", "Kh8h8c3h", "3♣3♦はフルハウスで相手のレンジを大きく上回り、ワンペアと劣るツーペアとトリップスとドローから払ってもらえるレイズです。", { locale: "ja" }), "beats-claim");
  lacks(audit("Jc3c", "Kh8h8c3h", "大きく打つとより強い手にレイズされる危険があるため、8と3のツーペアはこのサイズを使う頻度が低めです。", { locale: "ja" }), "beats-claim");
  lacks(audit("TcTd", "Ks7d2c8h", "An underpair (tens) is ahead of most holdings, though the flush and straight draws on this board can still overtake it."), "beats-claim");
});

test("named lower pairs retain hero pocket reference after set/flush/full-house upgrades", () => {
  const cases = [["KcKd", "Ah7h2h5hKs"], ["6c6d", "9h8d7c6s2d"], ["3c3d", "KhKdKc5s"], ["AcAh", "Kh7h2h5h3h"]];
  for (const [combo, board] of cases) {
    const o = enumerateOpponentOracle(combo, board);
    assert.ok(o.tally.lowerPair.loser > o.tally.lowerPair.other, JSON.stringify({ combo, board, counts: o.tally.lowerPair }));
    lacks(audit(combo, board, "Your hand beats lower pairs."), "beats-claim");
  }
  // Non-pocket flush has no pair reference: ordinary one-pair outcomes lose.
  lacks(audit("AhQh", "Kh7h2c5h", "Your hand beats lower pairs."), "beats-claim");
  has(audit("2c2d", "Kh8h8c3h", "Your hand beats lower pairs."), "beats-claim");
  // Preserve shape-based upgrades, not just the already-made category-one rows.
  const upgraded = enumerateOpponentOracle("AcAd", "Kh7h2h5h");
  assert.ok(upgraded.tally.lowerPair.other > 0);
});

test("A4 meaningful straight completions: zero outs, wrong completion rank, river and negation", () => {
  assert.deepEqual(oracleDraws(enumerateOpponentOracle("2c4c", "9h8d7c6s")).ranks, []);
  has(audit("2c4c", "9h8d7c6s", "You hold a gutshot (a five completes it)."), "draw-wrong");
  has(audit("As4s", "6h5h2d", "You hold a gutshot (a seven completes it)."), "draw-wrong");
  lacks(audit("As4s", "6h5h2d", "You hold a gutshot (a three completes it)."), "draw-wrong");
  has(audit("As4s", "6h5h2d9cKs", "You hold a flush draw."), "draw-wrong");
  lacks(audit("As4s", "6h5h2d9cKs", "You have no flush draw. The opponent missed a flush draw."), "draw-wrong");
  lacks(audit("Ah4h", "Kh7h7d2c", "You hold a flush draw."), "draw-wrong"); // documented paired-board flush-outs approximation
  has(audit("As4s", "6h5h2d", "A♠4♠はガットショット（7で完成）です。", { locale: "ja" }), "draw-wrong");
});

test("A5 overpairs also lose to two pair, A6 absent inferior top-pair kickers", () => {
  has(audit("AcAd", "Kh7d2c", "Your overpair only loses to sets or better."), "made-hand-wrong");
  lacks(audit("AcAd", "Kh7d2c", "Your overpair loses to two pair or better."), "made-hand-wrong");
  has(audit("4cKh", "3sKcKd2c", "You get paid by top pair with inferior kickers."), "beats-claim");
  lacks(audit("AcKh", "3sKcKd2c", "You get paid by top pair with inferior kickers."), "beats-claim");
  lacks(audit("4cKh", "3sKcKd2c", "There is no top pair with inferior kickers that pays you."), "beats-claim");
});

test("made-hand claims are scoped to hero; named set ranks and impossible flush overtakes checked", () => {
  has(audit("7c7d", "Kh7s2c", "You hold a set of eights."), "made-hand-wrong");
  lacks(audit("7c7d", "Kh7s2c", "You hold a set of sevens; the opponent may hold a flush draw or top pair."), "made-hand-wrong");
  lacks(audit("AcQd", "KhKd4s", "The opponent has a full house. The range can contain top pair and flushes."), "made-hand-wrong");
  lacks(audit("Kc7h", "Kh8h8cKs", "K♣7♥ has a full house and gets paid by weaker two pair and lower full houses."), "made-hand-wrong");
  lacks(audit("AdKd", "Ah7c2s9h", "A♦K♦はAのトップペア（Kキッカー）ですが、フラッシュドローやストレートドローに無料でカードを見せるリスクがあります。", { locale: "ja" }), "draw-wrong");
  lacks(audit("Jc2c", "JhJd2s4c", "J♣2♣はフルハウスでトリップスには勝っているのでベットします。", { locale: "ja" }), "made-hand-wrong");
  lacks(audit("AcKs", "Ah7c2s9h", "A♣K♠はAのトップペア（Kキッカー）でキッカーの劣るトップペアとセカンドペアや下位のペアとドローには勝っているのでベットします。", { locale: "ja" }), "made-hand-wrong");
  has(audit("3c3d", "Kh8h8c3h", "Your full house can be beaten by an ordinary flush."), "made-hand-wrong");
  lacks(audit("3c3d", "Kh8h8c3h", "Your full house is strong, though flush draws on this board can still overtake it."), "made-hand-wrong");
  // AhAc is a flush draw here; Ad makes AAA88 and beats hero's 88833.
  assert.ok(evaluateBest("AhAcKh8h8c3hAd").score > evaluateBest("3c3dKh8h8c3hAd").score);
  lacks(audit("3c3d", "Kh8h8c3h", "Flush draws cannot overtake your full house by completing an ordinary flush."), "made-hand-wrong");
  lacks(audit("QcJc", "QhJhQdTh", "Your full house is strong, though flush draws on this board can still overtake it."), "made-hand-wrong"); // AhK♥ straight-flush completion remains possible
});

test("made subtypes distinguish top/second/bottom/pocket pair, sets, trips and board-only ranks", () => {
  has(audit("7cQd", "Kh7s2c", "You hold top pair."), "made-hand-wrong");
  lacks(audit("7cQd", "Kh7s2c", "You hold second pair."), "made-hand-wrong");
  has(audit("2dQd", "Kh7s2c", "You hold second pair."), "made-hand-wrong");
  lacks(audit("2dQd", "Kh7s2c", "You hold bottom pair."), "made-hand-wrong");
  has(audit("QcQd", "Kh7s2c", "You hold an overpair."), "made-hand-wrong");
  lacks(audit("QcQd", "Kh7s2c", "You hold an underpair."), "made-hand-wrong");
  has(audit("AcAd", "Kh7s2c", "You hold top pair."), "made-hand-wrong");
  lacks(audit("AcAd", "Kh7s2c", "You hold an overpair."), "made-hand-wrong");
  has(audit("Kc2d", "KhKd4s", "You hold a set."), "made-hand-wrong");
  lacks(audit("Kc2d", "KhKd4s", "You hold trips."), "made-hand-wrong");
  has(audit("7c7d", "Kh7s2c", "You hold trips."), "made-hand-wrong");
  lacks(audit("7c7d", "Kh7s2c", "You hold a set."), "made-hand-wrong");
  has(audit("Kc2d", "Kh7s2c", "You hold top two pair."), "made-hand-wrong");
  has(audit("Kc7d", "Kh7s2c2h", "You hold only the two pair on the board."), "made-hand-wrong");
  has(audit("Kc2d", "KhKd4s", "You hold only the trips on the board."), "made-hand-wrong");
  lacks(audit("Ac2d", "KhKdKs4s", "You hold only the trips on the board."), "made-hand-wrong");
  lacks(audit("2c2d", "Th9d8c7s6h", "The opponent raises for value."), "made-hand-wrong");
});

test("number-wrong uses actual judgment odds, pot, sizing and saved mix", () => {
  const decision = { defence: { required_equity: .25, call_bb: 5, pot_before_bb: 10, bet_bb: 5, rake_bb: 0 }, actionSizing: { bet33: { amount_bb: 3.3, pot_fraction: .33 } } };
  has(audit("AcAd", "Kh7d2c", "Call 7bb to win 12bb → need 40% (rake included).", { decision }), "number-wrong");
  lacks(audit("AcAd", "Kh7d2c", "Call 5bb to win 15bb → need 25% (rake included).", { decision }), "number-wrong");
  const rendered = { headline: "Your overpair bets for value.", actionReasons: [{ action: "bet33", label: "Bet 5 (50%)", frequency: .6, text: "You get paid by top pair." }] };
  has(audit("AcAd", "Kh7d2c", "", { decision, rendered, actionMix: { bet33: .6 } }), "number-wrong");
  rendered.actionReasons[0].label = "Bet 3.3 (33%)";
  lacks(audit("AcAd", "Kh7d2c", "", { decision, rendered, actionMix: { bet33: .6 } }), "number-wrong");
  has(audit("AcAd", "Kh7d2c", "", { decision, rendered, actionMix: { bet33: .8 } }), "number-wrong");
});

test("forbidden numeric EV and affirmative solver/GTO/optimal preserve disclaimers", () => {
  for (const text of ["EV +1.2bb.", "The optimal GTO solver strategy bets.", "これはソルバーの最適戦略です。", "期待値は1.2bbです。"])
    has(audit("AcAd", "Kh7d2c", text), "forbidden");
  for (const text of ["This is an AI estimate, not GTO or solver output.", "This is not optimal strategy.", "GTOではなくAIの推定です。", "EV is not displayed."])
    lacks(audit("AcAd", "Kh7d2c", text), "forbidden");
});

test("locale-leak and empty-or-generic inspect supplied actual rendered strings", () => {
  has(audit("AcAd", "Kh7d2c", "これはトップペアです。"), "locale-leak");
  has(audit("AcAd", "Kh7d2c", "This hand raises for value.", { locale: "ja" }), "locale-leak");
  lacks(audit("AcAd", "Kh7d2c", "A♣A♦は強いペアです。Bet 10 (33%) / Call / BTN", { locale: "ja" }), "locale-leak");
  has(audit("AcAd", "Kh7d2c", ""), "empty-or-generic");
  has(audit("AcAd", "Kh7d2c", "Follow the saved strategy."), "empty-or-generic");
  const rendered = { headline: "A♣A♦ has an overpair.", actionReasons: [{ action: "check", text: "The saved strategy recommends this action." }, { action: "bet33", text: "The saved strategy recommends this action." }] };
  has(audit("AcAd", "Kh7d2c", "", { rendered }), "empty-or-generic");
  lacks(audit("AcAd", "Kh7d2c", "Your overpair checks to keep weaker holdings in the pot."), "empty-or-generic");
  assert.equal(FINDING_KINDS.length, 8);
});

test("averages use supplied actual representative and weighted tier, never absent exact cards", () => {
  const input = { board: "KhKd4s", selection: "hand-class-average", representativeCombo: parseOracleCards("QcQd"), combos: [{ cards: "QcQd", weight: 3 }, { cards: "QhQs", weight: 1 }], observedTier: "medium", locale: "en", rendered: { headline: "QQ has two pair from a pocket pair and the board pair." } };
  lacks(auditExplanationCase(input), "tier-mismatch");
  lacks(auditExplanationCase(input), "made-hand-wrong");
  has(auditExplanationCase({ ...input, observedTier: "monster" }), "tier-mismatch");
});
