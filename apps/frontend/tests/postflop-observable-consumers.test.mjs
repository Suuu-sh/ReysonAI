import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { dataset } from '../src/estimated/datasets.ts';
import { referencePolicyFor, NODES, choose } from '../scripts/postflop-ai/policy.mjs';
import { referenceLaterPolicy } from '../scripts/postflop-ai/later-policy.mjs';
import { LATER_NODES } from '../scripts/postflop-ai/later-tree.mjs';
import { sha } from '../scripts/postflop-ai/browser-inputs.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { replayDecision } from '../scripts/postflop-ai/defence.mjs';
import { laterExplainContext, explainLaterCombo } from '../scripts/postflop-ai/explain-later.mjs';
import { laterMixRows } from '../scripts/postflop-ai/views.mjs';
import { laterRangeFacts } from '../scripts/postflop-ai/range-facts.mjs';
import { computeLaterExplain, computeLaterView } from '../src/estimated/postflop-compute.ts';
import { createAgent } from '../src/agent/policy.ts';
import { playHand } from '../src/agent/hand.ts';
import { buildAdvancedExplanation, renderAdvancedPlainText } from '../src/estimated/postflop-advanced.ts';
import { buildPostflopExplanation } from '../src/estimated/postflop-explanation.ts';
import { translateProductCopy } from '../src/i18n.ts';

const inputs = loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
// Explicit deterministic test policies; never installed as saved candidates.
const flopPolicy = referencePolicyFor(inputs.spot.tree), laterPolicy = referenceLaterPolicy();
const aliases = ['bet33', 'bet75', 'bet125', 'allin'];
const request = alias => ({ flop: 'Ac7d2h', flopActions: 'bet33,call', turn: '9h', turnActions: 'bet75,call', river: 'Jd', riverActions: `check,${alias}` });
const datasets = Object.fromEntries([...new Set(Object.values(inputs.spot.ranges).flat().map(factor => factor[0]))].map(name => [name, dataset(name)]));
const flopCandidate = { policy: flopPolicy, metadata: { source_hash: inputs.fingerprint, policy_hash: sha(flopPolicy) } };
const laterCandidate = { policy: laterPolicy, metadata: { source_hash: inputs.fingerprint, flop_policy_hash: sha(flopPolicy), policy_hash: sha(laterPolicy) } };

const facingFacts = (overrides = {}) => ({
  node: 'ip_vs_75', street: 'flop', role: 'ip', fallback: false,
  pot_before_bb: 79, bet_bb: 60.5, call_bb: 60.5, final_pot_bb: 200, rake_bb: 3,
  required_equity: 60.5 / 197, equity: .1, realization: 1, realized_equity: .1,
  margin: .1 - 60.5 / 197, call_share: 0, percentile: .1, defence_frequency: .4, mdf: 79 / 139.5,
  bettor_range: { value_weight: 82, bluff_weight: 18, value_pct: 82, bluff_pct: 18 },
  faced_action: { action: 'bet75', allIn: true, amountBb: 60.5, capped: false },
  blockers: { value_removed_pct: 0, bluff_removed_pct: 0 }, ...overrides,
});

test('imported river aliases share canonical view, facts and exact-combo explanation at every consumer', () => {
  let expected;
  for (const alias of aliases) {
    const context = laterExplainContext(request(alias), inputs);
    assert.deepEqual(context.riverPath, ['check', 'allin']);
    assert.equal(context.decision.node, 'river_oop_vs_allin');
    const options = { ...request(alias), spotId: inputs.spot.id, datasets, flopCandidate, laterCandidate };
    const result = {
      view: computeLaterView(options),
      explanation: computeLaterExplain({ ...options, cards: 'AsKs' }),
      facts: laterRangeFacts({ inputs, flopPolicy, laterPolicy, context }),
    };
    assert.equal(result.view.rows.length, 169);
    assert.deepEqual(Object.keys(result.view.rows[0].mix), ['fold', 'call']);
    assert.deepEqual(Object.keys(result.explanation.actions), ['call', 'fold']);
    assert.equal(result.explanation.defence.faced_action.allIn, true);
    assert.equal(result.explanation.defence.faced_action.amountBb, 41.32);
    if (!expected) expected = result; else assert.deepEqual(result, expected);
  }
  const context = laterExplainContext(request('allin'), inputs);
  assert.throws(() => laterMixRows({ actor: inputs.spot.ip, role: 'ip', board: context.board,
    node: context.decision.node, line: context.decision.line, inputs, flopPolicy, laterPolicy,
    paths: { flop: context.flopPath, turn: context.turnPath, river: context.riverPath } }), /actor does not match/);
  assert.throws(() => explainLaterCombo({ ...request('allin'), riverActions: 'check,allin,raise', cards: 'AsKs', inputs, flopPolicy, laterPolicy }), /Illegal/);
});

test('Agent samples raw profile mass without a second cap and addresses the canonical registry node', () => {
  const board = parseCards('Ac7d2h9hJd', 5);
  const table = replayDecision(inputs, board, { flop: ['bet33', 'call'], turn: ['bet75', 'call'], river: ['check'] });
  const raw = { check: 20, bet33: 10, bet75: 15, bet125: 30, allin: 24.999999 };
  const keys = [];
  const agent = createAgent({ registry: { lookup(query) { keys.push(query.key); return query.key.endsWith(":river_oop_vs_allin") ? { fold: 25, call: 75 } : raw; } } });
  const kit = { spotId: inputs.spot.id, inputs,
    defence: { baseMix: () => raw, mix: () => ({ check: 100, bet33: 0, bet75: 0, bet125: 0, allin: 0 }) } };
  const actions = LATER_NODES.river_ip_first;
  for (const random of [0, .2, .3, .45, .75, .999999999]) {
    const result = agent.postflop({ kit, table, street: 'river', node: 'river_ip_first', board, hole: parseCards('AsKs', 2), actions, random });
    assert.equal(result.action, choose(raw, random, actions));
    assert.deepEqual(result.mix, raw);
    assert.equal(result.source, 'profile');
  }
  const facing = replayDecision(inputs, board, { flop: ['bet33', 'call'], turn: ['bet75', 'call'], river: ['check', 'bet75'] });
  agent.postflop({ kit: { ...kit, defence: { baseMix: () => ({ fold: 0, call: 100 }), mix: (_t, _b, _n, _h, base) => base } },
    table: facing, street: 'river', node: 'river_oop_vs_75', board, hole: parseCards('AsKs', 2), actions: ['fold', 'call', 'raise'], random: .1 });
  assert.equal(keys.at(-1), `postflop:${inputs.spot.id}:river:river_oop_vs_allin`);
});

test('Agent hand offers one actual all-in, logs canonical chips and replays each equivalent human choice', () => {
  const rawBase = (_table, _board, node) => {
    const actions = NODES[node] ?? LATER_NODES[node];
    const selected = node === 'oop_first' ? 'bet33' : node === 'turn_oop_first' ? 'bet75'
      : node === 'river_oop_first' ? 'check' : actions.includes('call') ? 'call' : 'check';
    return Object.fromEntries(actions.map(action => [action, action === selected ? 100 : 0]));
  };
  const kit = { spotId: inputs.spot.id, inputs, defence: { baseMix: rawBase, mix: (_t, _b, _n, _h, base) => base } };
  const setup = { seed: 'hu-qa-2097|hand|0', human: 'HJ', agents: createAgent(), postflop: id => { assert.equal(id, inputs.spot.id); return kit; } };
  const prefix = ['call', 'call', 'call', 'call'];
  const awaiting = playHand({ ...setup, humanActions: prefix });
  assert.equal(awaiting.pending.street, 'river');
  assert.equal(awaiting.pending.pot, 120.36);
  assert.deepEqual(awaiting.pending.options, [{ key: 'check', to: undefined, allIn: false }, { key: 'allin', to: 41.32, allIn: true }]);
  let expected;
  for (const alias of aliases) {
    const result = playHand({ ...setup, humanActions: [...prefix, alias] });
    assert.equal(result.status, 'done'); assert.equal(result.showdown, true);
    const bet = result.log.find(entry => entry.street === 'river' && entry.pos === 'HJ');
    assert.equal(bet.action, 'allin'); assert.equal(bet.to, 41.32); assert.equal(bet.allIn, true);
    assert.equal(result.log.filter(entry => entry.street === 'preflop').at(-1).pot, 29);
    if (!expected) expected = result; else assert.deepEqual(result, expected);
  }
});

test('transport size tokens describe physical all-ins in all four explanation locales', () => {
  const explain = { equity: .7, betting: { equity_vs_defender: .7, actions: [{ action: 'bet75', allIn: true, amountBb: 60.5 }] } };
  for (const locale of ['en', 'ja', 'zh-CN', 'es']) {
    const result = buildAdvancedExplanation({ locale, node: 'oop_first', hand: 'AA', actionMix: { check: 0, bet75: 1 }, tiers: { strong: 1 }, explain });
    assert.doesNotMatch(renderAdvancedPlainText(result), /75%|large bet|bets big|overbet|大きく(?:打|ベット)|大きなベット|オーバーベット/);
    assert.equal(result.blocks[0].action, 'bet75', 'transport key stays canonical');
    assert.equal(result.blocks[0].label, { en: 'All-in', ja: 'オールイン', 'zh-CN': '全下', es: 'All-in' }[locale]);
  }
  for (const locale of ['en', 'ja']) {
    const betting = buildPostflopExplanation({ locale, node: 'oop_first', hand: 'AA', actionMix: { bet75: 1 }, explain });
    assert.match(betting.headline, locale === 'en' ? /All-in/ : /オールイン/);
    const facing = buildPostflopExplanation({ locale, node: 'ip_vs_75', hand: 'KK', actionMix: { fold: 1 }, explain: {
      defence: facingFacts(),
    } });
    assert.doesNotMatch(facing.headline, /75%/);
    assert.match(facing.headline, locale === 'en' ? /all-in/ : /オールイン/);
  }
});

test('observable cap copy reports under-bluffed and reduced pools without claiming saturation in all four locales', () => {
  const localized = {
    en: { pool: /pooled bluff share 18%/, reduced: /Component caps reduced bluff weight/, untouched: /No component cap reduced bluff weight/, below: /can remain below.*30%/ },
    ja: { pool: /統合したブラフ比率18%/, reduced: /個別の上限によってブラフの重みが減りました/, untouched: /個別の上限によるブラフの削減はなく/, below: /30%.*下回る/ },
    'zh-CN': { pool: /合并后的诈唬比例为18%/, reduced: /各分项上限降低了诈唬权重/, untouched: /各分项上限没有降低诈唬权重/, below: /仍可能低于.*30%/ },
    es: { pool: /proporción de faroles combinada del 18%/, reduced: /Los límites individuales redujeron el peso de los faroles/, untouched: /Ningún límite individual redujo el peso de los faroles/, below: /puede quedar por debajo.*30%/ },
  };
  for (const wasReduced of [false, true]) {
    const faced = { action: 'bet75', aliases: ['bet75', 'bet125'], allIn: true, amountBb: 60.5,
      alpha: .3, capped: wasReduced, wasReduced, removed_bluff: wasReduced ? 7 : 0,
      bluff_share_before_pct: wasReduced ? 25 : 18, bluff_share_after_pct: 18 };
    for (const locale of ['en', 'ja', 'zh-CN', 'es']) {
      const result = buildPostflopExplanation({ locale: locale === 'ja' ? 'ja' : 'en', node: 'ip_vs_75', hand: 'KK',
        actionMix: { fold: 1 }, explain: { defence: facingFacts({ faced_action: faced }) } });
      const row = result.facing.rows[5];
      const value = translateProductCopy(row.value, locale), tooltip = translateProductCopy(row.tooltip, locale);
      assert.match(value, localized[locale].pool);
      assert.match(tooltip, localized[locale][wasReduced ? 'reduced' : 'untouched']);
      assert.match(tooltip, localized[locale].below);
      assert.doesNotMatch(`${value} ${tooltip}`, /capped at 30%|held at|損益分岐の30%に制限|損益分岐α（30%）に抑え/);
      if (locale === 'zh-CN' || locale === 'es') assert.doesNotMatch(`${value} ${tooltip}`, /pooled|component|Value hands|break-even/);
      assert.doesNotMatch(`${value} ${tooltip}`, /bet75|bet125/);
    }
  }
  const legacy = buildPostflopExplanation({ locale: 'en', node: 'ip_vs_75', hand: 'KK', actionMix: { fold: 1 },
    explain: { defence: facingFacts({ faced_action: { action: 'bet75', alpha: .3, capped: true, bluff_share_after_pct: 30 } }) } });
  assert.match(legacy.facing.rows[5].value, /bluff share capped at 30%/);
  assert.match(legacy.facing.rows[5].tooltip, /held at the caller's break-even/);
});
