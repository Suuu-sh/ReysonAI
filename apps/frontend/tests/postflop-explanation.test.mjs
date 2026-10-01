import test from "node:test";
import assert from "node:assert/strict";
import { buildPostflopExplanation, renderExplanationPlainText } from "../src/estimated/postflop-explanation.ts";

function facingFacts(overrides = {}) {
  return { node: "bb_vs_75", street: "flop", role: "oop", fallback: false,
    pot_before_bb: 5.5, bet_bb: 4.1, call_bb: 4.1, final_pot_bb: 13.7, rake_bb: 0.7,
    required_equity: 0.3, equity: 0.58, realization: 0.59, realized_equity: 0.34,
    margin: 0.04, call_share: 0.88, percentile: 0.85, defence_frequency: 0.63, mdf: 0.57,
    bettor_range: { value_pct: 75, bluff_pct: 25 },
    faced_action: { action: "bet75", alpha: 0.3, capped: true, bluff_share_before_pct: 38, bluff_share_after_pct: 30 },
    blockers: { value_removed_pct: 20, bluff_removed_pct: 10 }, ...overrides };
}

test("facing explanation presents fraction facts as whole percentages and gives beginner tooltips", () => {
  const result = buildPostflopExplanation({ locale: "en", node: "bb_vs_75", hand: "KQo",
    actionMix: { call: 0.95, fold: 0.05 }, tiers: { strong: 1 }, texture: "wet",
    positions: { ip: "BTN", oop: "BB" }, explain: { equity: 0.58, defence: facingFacts() } });
  const text = renderExplanationPlainText(result);
  assert.match(result.headline, /^Call 95%/);
  assert.match(result.headline, /58% equity \(34% realized\).*BTN's 75% bet.*30% needed/);
  assert.match(result.headline, /within 4% of break-even/);
  assert.match(text, /Call 4\.1bb to win 8\.9bb → need 30%/);
  assert.match(text, /Top 15%/);
  assert.match(text, /Continues 63% vs MDF 57%/);
  assert.match(text, /75% value \/ 25% bluffs/);
  assert.match(text, /capped at 30%/);
  assert.match(text, /Removes 20% of value, 10% of bluffs → blocks more value than bluffs/);
  assert.ok(result.facing.rows.every(row => row.tooltip.length > 10));
  assert.doesNotMatch(text, /GTO/i);
});

test("river betting explanation prices sizes and flags a material EV disagreement", () => {
  const result = buildPostflopExplanation({ locale: "en", node: "river_oop_first", hand: "AKo",
    actionMix: { check: 0.25, bet33: 0, bet75: 0.25, bet125: 0, allin: 0.5 },
    tiers: { medium: 1 }, texture: "over", positions: { ip: "BTN", oop: "BB" },
    explain: { street: "river", equity: 0.42, actions: { bet75: { foldShare: 0.3 }, allin: { foldShare: 0.45 }, bet33: { foldShare: 0.2 } },
      betting: { equity_vs_defender: 0.4, actions: [
        { action: "bet33", alpha: 0.17, bluffs_per_100_value: 20, capped: false },
        { action: "bet75", alpha: 0.3, bluffs_per_100_value: 43, capped: false },
        { action: "bet125", alpha: 0.38, bluffs_per_100_value: 61, capped: false },
        { action: "allin", alpha: 0.49, bluffs_per_100_value: 96, capped: false },
      ] } },
    handEv: { ev_bb: { check: 0.4, bet33: 1.2, bet75: 1.5, bet125: 0.2, allin: 0.8 } } });
  const text = renderExplanationPlainText(result);
  assert.match(text, /Betting plan · Protection/);
  assert.match(text, /Bet 75% ★ \| 25% \| 30% \| — \| \+1\.5bb/);
  assert.match(text, /The shown strategy mainly uses All-in 50%; by EV alone, Bet 75% is slightly better \(\+0\.7bb\)/);
  assert.match(text, /Overcard runout/);
  assert.doesNotMatch(text, /GTO/i);
});

test("Japanese explanation localizes the recommendation and numeric facts naturally", () => {
  const result = buildPostflopExplanation({ locale: "ja", node: "bb_vs_75", hand: "KQo",
    actionMix: { call: 0.95, fold: 0.05 }, tiers: { strong: 1 }, texture: "wet",
    positions: { ip: "BTN", oop: "BB" }, explain: { equity: 0.58, defence: facingFacts() } });
  const text = renderExplanationPlainText(result);
  assert.match(result.headline, /^コール 95%/);
  assert.match(result.headline, /勝率58%（実現勝率34%）/);
  assert.match(text, /4\.1bbをコールして8\.9bbを獲得 → 必要勝率30%（レーキ込み）/);
  assert.match(text, /上位15%/);
  assert.match(text, /バリューを20%、ブラフを10%除去/);
  assert.doesNotMatch(text, /GTO/i);
});

test("a capped all-in fold explains why positive pot-odds equity still stays outside the range budget", () => {
  const facts = facingFacts({ street: "river", equity: 0.5234, required_equity: 0.4937,
    realized_equity: 0.5234, realization: 1, percentile: 0.8821, defence_frequency: 0.0534, mdf: 0.0534,
    faced_action: { action: "allin", alpha: 0.4937, capped: true, bluff_share_before_pct: 74.2, bluff_share_after_pct: 49.37 } });
  const input = { node: "river_ip_vs_allin", hand: "AKo", actionMix: { fold: 1, call: 0 }, tiers: { strong: 1 },
    explain: { street: "river", equity: 0.5234, defence: facts }, positions: { ip: "BTN", oop: "BB" } };
  const en = renderExplanationPlainText(buildPostflopExplanation({ ...input, locale: "en" }));
  const ja = renderExplanationPlainText(buildPostflopExplanation({ ...input, locale: "ja" }));
  assert.match(en, /Fold 100%.*52% equity \(52% realized\).*above the 49% needed.*continues only 5%.*top 12%.*outside the top 5% continuation budget/);
  assert.match(ja, /フォールド 100%.*勝率52%（実現勝率52%）.*必要な49%を上回ります.*続行は5%まで.*上位12%に位置し.*続行枠の上位5%には届きません/);
});

test("first-node check and bet mixes use the value role and do not repeat fold projections", () => {
  const result = buildPostflopExplanation({ locale: "en", node: "river_oop_first", hand: "AKo",
    actionMix: { check: 0.75, bet33: 0.2, bet75: 0.05, bet125: 0, allin: 0 }, tiers: { strong: 1 }, texture: "blank",
    explain: { street: "river", equity: 0.95, actions: { bet33: { foldShare: 0.49 }, bet75: { foldShare: 0.3 } },
      betting: { equity_vs_defender: 0.95, actions: [
        { action: "bet33", alpha: 0.21, bluffs_per_100_value: 27, capped: true },
        { action: "bet75", alpha: 0.3, bluffs_per_100_value: 43, capped: false },
      ] } } });
  const text = renderExplanationPlainText(result);
  assert.match(result.headline, /^Check 75% \/ Bet 33% 20% \/ Bet 75% 5%: At 95% equity/);
  assert.match(result.headline, /policy checks more often and mixes value-bet sizes/);
  assert.match(text, /Betting plan · Value: This hand has 95% equity/);
  assert.equal((text.match(/49%/g) ?? []).length, 2); // once in the table, once in the sentence
  assert.doesNotMatch(text, /top pair or better has/);
  assert.equal((text.match(/This hand has 95% equity against the defender's range, supporting a value bet\./g) ?? []).length, 1);
  assert.match(text, /Bet 33% gets folds 49% of the time/);
});

test("fold and raise mixtures identify the bluff-raise branch", () => {
  const facts = facingFacts({ equity: 0.22, realized_equity: 0.1, realization: 0.47, required_equity: 0.32,
    faced_action: { action: "bet75", alpha: 0.32, capped: false, bluff_share_before_pct: 30, bluff_share_after_pct: 30 } });
  const result = buildPostflopExplanation({ locale: "en", node: "bb_vs_75", hand: "92s",
    actionMix: { fold: 0.93, call: 0, raise: 0.07 }, tiers: { air: 1 },
    explain: { equity: 0.22, defence: facts, betting: { equity_vs_defender: 0.22 },
      actions: { raise: { foldShare: 0.43 } } } });
  assert.match(result.headline, /Fold 93% \/ Raise 3× 7%/);
  assert.match(result.headline, /mixes a bluff-raise with folds/);
  assert.match(renderExplanationPlainText(result), /This hand has 22% equity.*raise 3× relies on fold equity/);
  assert.match(renderExplanationPlainText(result), /Raise 3× \| 7% \| 43% \| — \| —/);
});

test("an exact combo is named as that combo, not as its hand-class average", () => {
  const facts = facingFacts({ equity: 0.5234, required_equity: 0.4937, realized_equity: 0.5234, realization: 1,
    percentile: 0.8821, defence_frequency: 0.0534, mdf: 0.0534,
    faced_action: { action: "allin", alpha: 0.4937, capped: true, bluff_share_before_pct: 74.2, bluff_share_after_pct: 49.37 } });
  const result = buildPostflopExplanation({ locale: "en", node: "river_ip_vs_allin", hand: "AdKc",
    actionMix: { fold: 1, call: 0 }, tiers: { strong: 1 },
    explain: { street: "river", equity: 0.5234, defence: facts }, positions: { ip: "BTN", oop: "BB" } });
  assert.match(result.headline, /^Fold 100%: AdKc has 52% equity/);
  assert.match(result.headline, /BB's all-in/);
  assert.doesNotMatch(result.headline, /AdKc hand class/);
});

test("later-street node prefixes identify the actual bettor", () => {
  const cases = [["turn_ip_vs_75", "BB"], ["river_oop_vs_allin", "BTN"]];
  for (const [node, bettor] of cases) {
    const result = buildPostflopExplanation({ locale: "en", node, hand: "KQo", actionMix: { call: 1, fold: 0 },
      tiers: { strong: 1 }, positions: { ip: "BTN", oop: "BB" },
      explain: { equity: 0.58, defence: facingFacts({ node, street: node.startsWith("turn") ? "turn" : "river" }) } });
    assert.match(result.headline, new RegExp(`${bettor}'s 75% bet|${bettor}'s all-in`));
  }
});

function betTableInput(locale, handEv) {
  return { locale, node: "btn_first", hand: "AKo", actionMix: { check: 0.4, bet33: 0, bet75: 0.35, bet125: 0.25, allin: 0 },
    tiers: { strong: 1 }, texture: "dry", positions: { ip: "BTN", oop: "BB" },
    explain: { equity: 0.6, betting: { equity_vs_defender: 0.6 },
      actions: { bet33: { foldShare: 0.3 }, bet75: { foldShare: 0.65 }, bet125: { foldShare: 0.7 }, allin: { foldShare: 0.8 } },
      bet_table: { actions: { check: { calledEquity: 0.6 }, bet33: { calledEquity: 0.5 }, bet75: { calledEquity: 0.41 },
        bet125: { calledEquity: 0.33 }, allin: { calledEquity: null } } } },
    handEv };
}

test("betting table lists every action, marks the best EV, and the sentences compare EVs", () => {
  const ev = { ev_bb: { check: 7.1, bet33: 5, bet75: 6.3, bet125: 6.9, allin: 4 } };
  const en = buildPostflopExplanation(betTableInput("en", ev));
  assert.deepEqual(en.betting.table.rows.map(row => row.action), ["check", "bet33", "bet75", "bet125", "allin"]);
  assert.deepEqual(en.betting.table.rows.filter(row => row.best).map(row => row.action), ["check"]);
  const text = renderExplanationPlainText(en);
  assert.match(text, /Check ★ \| 40% \| — \| 60% \| \+7\.1bb/);
  assert.match(text, /Bet 75% \| 35% \| 65% \| 41% \| \+6\.3bb/);
  assert.match(text, /Bet 75% gets folds 65% of the time and is called mostly by better hands \(your equity when called 41%\), so it earns \+6\.3bb\./);
  assert.match(text, /Checking keeps their bluffs in and earns \+7\.1bb, the most\./);
  assert.equal(en.betting.sizes.length <= 4, true);
  assert.doesNotMatch(text, /GTO/i);
  const ja = renderExplanationPlainText(buildPostflopExplanation(betTableInput("ja", ev)));
  assert.match(ja, /ベット 75%は相手が65%フォールドします。コールしてくるのは主に自分より強い手です（コールされた時の勝率41%）。EVは\+6\.3bbです。/);
  assert.match(ja, /チェックなら相手のブラフが残り、EVは\+7\.1bbで最大です。/);
  assert.doesNotMatch(ja, /GTO/i);
});

test("close EVs are called close; a single combo shows no EV and no EV sentences", () => {
  const close = renderExplanationPlainText(buildPostflopExplanation(betTableInput("en",
    { ev_bb: { check: 6.2, bet33: 5, bet75: 6.3, bet125: 4, allin: 3 } })));
  assert.match(close, /differ by only 0\.1bb in EV, which is why the strategy mixes them/);
  const combo = buildPostflopExplanation(betTableInput("en", null));
  assert.ok(combo.betting.table.rows.every(row => row.ev === null && !row.best));
  assert.equal(combo.betting.sizes.length, 1);
  assert.doesNotMatch(renderExplanationPlainText(combo), /earns \+.*the most/);
});

test("a draw that bets is a semi-bluff even near 50% equity, in English and Japanese", () => {
  const input = locale => ({ locale, node: "turn_ip_first", hand: "AQs",
    actionMix: { check: 0.45, bet33: 0.25, bet75: 0.2, bet125: 0.1 }, tiers: { draw: 1 }, texture: "blank",
    explain: { street: "turn", equity: 0.5, actions: { bet33: { foldShare: 0.32 } },
      betting: { equity_vs_defender: 0.5, actions: [] } } });
  const en = renderExplanationPlainText(buildPostflopExplanation(input("en")));
  const ja = renderExplanationPlainText(buildPostflopExplanation(input("ja")));
  assert.match(en, /Betting plan · Semi-bluff: This draw has 50% equity/);
  assert.doesNotMatch(en, /Betting plan · Value/);
  assert.match(ja, /セミブラフ/);
});
