"""Author BB estimates against a 2.5BB open and one 2.5BB cold caller.

This is an authoring-time, hand-group frequency table, not a solver result.
Only the staging directory used by build-estimates.mjs may be written.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from sizing_rules import three_bet_to

ROOT = Path(__file__).resolve().parents[1]
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.'))
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]


def profile(spec, base=None):
    # Unlisted classes are explicit fold=100; an overlay changes only named classes.
    result = dict(base) if base is not None else dict.fromkeys(HANDS, (0, 0))
    seen = set()
    for line in spec.strip().splitlines():
        frequencies, names = line.split(':')
        call, squeeze = map(int, frequencies.split())
        assert 0 <= call <= 100 and 0 <= squeeze <= 100 and call + squeeze <= 100
        for hand in names.split():
            assert hand in HANDS and hand not in seen
            seen.add(hand)
            result[hand] = call, squeeze
    return result


# call%, squeeze%. BB closes action at a good price, but realizes equity OOP
# against two ranges: pairs, suited aces and connected suited hands call more
# often than weak offsuit hands. Squeezes are intentionally value-heavy, with
# only a small wheel-ace blocker component. Frequencies are our rough estimates.
UTG_HJ = profile('''
0 100: AA
10 90: KK
45 55: QQ
70 25: JJ
85 10: TT
90 0: 99
90 0: 88 77 66 55
85 0: 44 33 22
25 75: AKs
65 30: AQs
80 10: AJs
80 0: ATs
70 0: A9s
60 0: A8s
50 0: A7s
40 0: A6s
50 10: A5s
40 5: A4s
35 5: A3s
30 5: A2s
35 65: AKo
50 20: AQo
40 0: AJo
25 0: ATo
10 0: A9o
80 15: KQs
75 5: KJs
70 0: KTs
55 0: K9s
40 0: K8s
25 0: K7s
10 0: K6s
40 0: KQo
25 0: KJo
10 0: KTo
80 0: QJs JTs T9s
70 0: QTs
55 0: Q9s
35 0: Q8s
15 0: Q7s
30 0: QJo
15 0: QTo
65 0: J9s
40 0: J8s
15 0: J7s
20 0: JTo
5 0: J9o
55 0: T8s
30 0: T7s
10 0: T9o
75 0: 98s
50 0: 97s
25 0: 96s
70 0: 87s
40 0: 86s
65 0: 76s
30 0: 75s
55 0: 65s
20 0: 64s
45 0: 54s
25 0: 43s
10 0: 32s
''')

# A later UTG caller is assumed somewhat wider and less likely to dominate the
# marginal suited/paired calls. Keep the value squeeze core unchanged.
UTG_CO = profile('''
95 0: 99
95 0: 88 77 66 55
90 0: 44 33 22
85 10: AJs
85 0: ATs
75 0: A9s
65 0: A8s
55 0: A7s
45 0: A6s
55 10: A5s
45 5: A4s
40 5: A3s
35 5: A2s
45 0: AJo
30 0: ATo
15 0: A9o
85 15: KQs
80 5: KJs
75 0: KTs
60 0: K9s
45 0: K8s
30 0: K7s
15 0: K6s
45 0: KQo
30 0: KJo
15 0: KTo
85 0: QJs JTs T9s
75 0: QTs
60 0: Q9s
40 0: Q8s
20 0: Q7s
35 0: QJo
20 0: QTo
70 0: J9s
45 0: J8s
20 0: J7s
25 0: JTo
10 0: J9o
60 0: T8s
35 0: T7s
15 0: T9o
80 0: 98s
55 0: 97s
30 0: 96s
75 0: 87s
45 0: 86s
70 0: 76s
35 0: 75s
60 0: 65s
25 0: 64s
50 0: 54s
30 0: 43s
15 0: 32s
''', UTG_HJ)

# BTN's wider cold-call assumption adds a little realization to the same
# suited/pair families; UTG remains the strong opener, so squeezes stay tight.
UTG_BTN = profile('''
95 0: 99 88 77 66 55 44 33 22
90 10: AJs
90 0: ATs
80 0: A9s
70 0: A8s
60 0: A7s
50 0: A6s
60 10: A5s
50 5: A4s
45 5: A3s
40 5: A2s
50 0: AJo
35 0: ATo
20 0: A9o
90 10: KQs
85 5: KJs
80 0: KTs
65 0: K9s
50 0: K8s
35 0: K7s
20 0: K6s
50 0: KQo
35 0: KJo
20 0: KTo
90 0: QJs JTs T9s
80 0: QTs
65 0: Q9s
45 0: Q8s
25 0: Q7s
40 0: QJo
25 0: QTo
75 0: J9s
50 0: J8s
25 0: J7s
30 0: JTo
15 0: J9o
65 0: T8s
40 0: T7s
20 0: T9o
85 0: 98s
60 0: 97s
35 0: 96s
80 0: 87s
50 0: 86s
75 0: 76s
40 0: 75s
65 0: 65s
30 0: 64s
55 0: 54s
35 0: 43s
20 0: 32s
''', UTG_CO)

# Versus HJ, BB can continue wider than versus UTG. CO's call is still
# relatively condensed, so the squeeze addition is primarily JJ+/AK/AQ.
HJ_CO = profile('''
0 100: AA
5 95: KK
30 70: QQ
60 35: JJ
75 20: TT
90 5: 99
95 0: 88 77 66 55
90 0: 44 33 22
15 85: AKs
55 40: AQs
80 15: AJs
85 5: ATs
80 0: A9s
70 0: A8s
60 0: A7s
50 0: A6s
55 15: A5s
45 10: A4s
40 5: A3s
35 5: A2s
25 75: AKo
50 35: AQo
50 5: AJo
35 0: ATo
20 0: A9o
10 0: A8o
75 20: KQs
80 10: KJs
80 0: KTs
70 0: K9s
55 0: K8s
40 0: K7s
25 0: K6s
10 0: K5s
55 5: KQo
40 0: KJo
25 0: KTo
10 0: K9o
85 5: QJs
85 0: QTs
70 0: Q9s
55 0: Q8s
35 0: Q7s
15 0: Q6s
45 0: QJo
30 0: QTo
15 0: Q9o
85 0: JTs
75 0: J9s
55 0: J8s
35 0: J7s
15 0: J6s
35 0: JTo
20 0: J9o
85 0: T9s
70 0: T8s
50 0: T7s
30 0: T6s
25 0: T9o
15 0: T8o
85 0: 98s
65 0: 97s
45 0: 96s
85 0: 87s
60 0: 86s
35 0: 85s
80 0: 76s
50 0: 75s
25 0: 74s
70 0: 65s
40 0: 64s
60 0: 54s
40 0: 43s
25 0: 32s
''')

# The BTN caller is less strong than CO on average; widen call branches rather
# than adding many squeeze bluffs into two players.
HJ_BTN = profile('''
95 5: 99
100 0: 88 77 66 55
95 0: 44 33 22
85 15: AJs
90 5: ATs
85 0: A9s
75 0: A8s
65 0: A7s
55 0: A6s
60 15: A5s
50 10: A4s
45 5: A3s
40 5: A2s
55 5: AJo
40 0: ATo
25 0: A9o
15 0: A8o
80 20: KQs
85 10: KJs
85 0: KTs
75 0: K9s
60 0: K8s
45 0: K7s
30 0: K6s
15 0: K5s
60 5: KQo
45 0: KJo
30 0: KTo
15 0: K9o
90 5: QJs
90 0: QTs
75 0: Q9s
60 0: Q8s
40 0: Q7s
20 0: Q6s
50 0: QJo
35 0: QTo
20 0: Q9o
90 0: JTs
80 0: J9s
60 0: J8s
40 0: J7s
20 0: J6s
40 0: JTo
25 0: J9o
90 0: T9s
75 0: T8s
55 0: T7s
35 0: T6s
30 0: T9o
20 0: T8o
90 0: 98s
70 0: 97s
50 0: 96s
90 0: 87s
65 0: 86s
40 0: 85s
85 0: 76s
55 0: 75s
30 0: 74s
75 0: 65s
45 0: 64s
65 0: 54s
45 0: 43s
30 0: 32s
''', HJ_CO)

# CO open + BTN call is the loosest of the six histories. BB can realize more
# suited/paired equity but still trims weak offsuit hands, and squeeze combos
# remain below the CO heads-up 3bet width.
CO_BTN = profile('''
0 100: AA
0 100: KK
20 80: QQ
50 50: JJ
70 30: TT
85 15: 99
90 5: 88
95 0: 77 66 55 44 33 22
10 90: AKs
45 55: AQs
70 30: AJs
80 15: ATs
85 5: A9s
80 0: A8s
70 0: A7s
60 0: A6s
65 20: A5s
55 15: A4s
50 10: A3s
45 10: A2s
15 85: AKo
40 55: AQo
55 25: AJo
55 5: ATo
35 0: A9o
25 0: A8o
15 0: A7o
65 30: KQs
75 20: KJs
85 10: KTs
80 0: K9s
65 0: K8s
50 0: K7s
35 0: K6s
20 0: K5s
65 15: KQo
55 5: KJo
45 0: KTo
25 0: K9o
10 0: K8o
80 15: QJs
85 10: QTs
85 0: Q9s
70 0: Q8s
50 0: Q7s
30 0: Q6s
60 5: QJo
50 0: QTo
30 0: Q9o
15 0: Q8o
85 10: JTs
85 0: J9s
70 0: J8s
50 0: J7s
30 0: J6s
50 0: JTo
35 0: J9o
15 0: J8o
90 5: T9s
85 0: T8s
65 0: T7s
45 0: T6s
40 0: T9o
25 0: T8o
95 0: 98s
80 0: 97s
60 0: 96s
95 0: 87s
75 0: 86s
50 0: 85s
90 0: 76s
65 0: 75s
40 0: 74s
85 0: 65s
55 0: 64s
75 0: 54s
55 0: 43s
40 0: 32s
''')


def widen_calls(base, spec):
    """Cap fold frequency by moving only the released share into calls.

    The review's 18.8% three-way price is a guide, not a solver threshold:
    suited hands/pairs realize better out of position than weak offsuit hands.
    Squeeze frequencies stay with the original value-heavy profiles.
    """
    result = dict(base)
    seen = set()
    for line in spec.strip().splitlines():
        maximum_fold, names = line.split(':')
        maximum_fold = int(maximum_fold)
        for hand in names.split():
            assert hand in HANDS and hand not in seen
            seen.add(hand)
            call, squeeze = result[hand]
            result[hand] = max(call, 100 - maximum_fold - squeeze), squeeze
    return result


# Claude's three-way equity review highlighted hands that were folding too
# often. These are fold ceilings, not exact frequency targets. In particular,
# Kx/Ax/Qx suited hands and connected suited hands gain calls, while the small
# pairs (22–44) retain their existing set-mining calls. The additional call
# bands below also keep each spot near at least 80% of its heads-up defense
# width; neither the opener nor the caller's frequencies are multiplied in.
UTG_HJ = widen_calls(UTG_HJ, '''
10: KJs KTs
40: A7s A4s K9s K8s K7s K6s K5s Q9s T8s 54s
''')
UTG_CO = widen_calls(UTG_CO, '''
10: ATs KJs KTs QJs JTs
40: A7s A6s A4s A3s K8s K7s K6s K5s K4s J8s
''')
UTG_BTN = widen_calls(UTG_BTN, '''
10: A9s A8s KTs K9s AQo QTs Q9s J9s
40: A6s A4s A3s A2s K8s K7s K6s K5s K4s K3s K2s KQo Q8s Q7s Q6s AJo J8s J7s ATo T7s 96s 86s 75s 54s
''')
HJ_CO = widen_calls(HJ_CO, '''
10: A9s A8s A7s A5s KTs K9s AQo QTs JTs J9s T9s
40: A6s A4s A3s A2s K8s K7s K6s K5s K4s K3s K2s Q8s Q7s Q5s AJo KJo J8s ATo T7s T6s 96s
''')
HJ_BTN = widen_calls(HJ_BTN, '''
10: A9s A8s A7s A6s A5s A4s A3s A2s KTs K9s K8s AQo Q9s AJo J9s T8s
40: K7s K6s K5s K4s K3s K2s Q7s Q6s Q5s Q4s Q3s KJo J7s J6s ATo KTo T7s T6s 96s 85s 75s 74s 64s 53s
''')
CO_BTN = widen_calls(CO_BTN, '''
10: A8s A7s A6s A5s A4s A3s A2s K9s K8s K7s K6s K5s K4s KQo Q9s Q8s AJo J9s J8s ATo T8s T7s
40: K3s K2s Q7s Q6s Q5s Q4s Q3s Q2s J7s J6s J5s J4s KTo QTo JTo T6s T4s A9o 95s A8o 85s A7o 64s
''')

# The review's named hands alone do not restore enough combo-weighted BB
# defense. Add connected/one-gap suited hands and selected broadway offsuit
# calls (at more cautious frequencies), still with no extra squeeze bluffs.
UTG_HJ = widen_calls(UTG_HJ, '''
20: A9s A8s A7s A6s A5s A4s A3s A2s K9s K8s K7s K6s K5s QTs Q9s Q8s J9s T8s 98s 87s 76s 65s 54s
40: K4s K3s K2s Q7s Q6s Q5s J8s J7s J6s T7s T6s 97s 96s 86s 75s 64s 43s AJo ATo KQo KJo QJo JTo
''')
UTG_CO = widen_calls(UTG_CO, '''
20: A9s A8s A7s A6s A5s A4s A3s A2s K9s K8s K7s K6s K5s K4s QTs Q9s Q8s J9s J8s T8s 98s 87s 76s 65s 54s
40: K3s K2s Q7s Q6s Q5s J7s J6s T7s T6s 97s 96s 86s 75s 64s 43s AJo ATo KQo KJo QJo JTo
''')
UTG_BTN = widen_calls(UTG_BTN, '''
0: AQs
20: A9s A8s A7s A6s A5s A4s A3s A2s K9s K8s K7s K6s K5s K4s Q9s Q8s J9s J8s T8s 98s 87s 76s 65s 54s
40: K3s K2s Q7s Q6s Q5s J7s J6s T7s T6s 97s 96s 86s 75s 64s 43s AJo ATo KQo KJo QJo JTo
''')
HJ_CO = widen_calls(HJ_CO, '''
20: A9s A8s A7s A6s A5s A4s A3s A2s K9s K8s K7s K6s K5s K4s K3s K2s Q9s Q8s Q7s Q6s Q5s J9s J8s J7s T8s T7s 98s 87s 76s 65s 54s
40: Q4s Q3s J6s J5s T6s T5s 97s 96s 86s 85s 75s 74s 64s 53s AJo ATo KQo KJo KTo QJo QTo JTo
''')
HJ_BTN = widen_calls(HJ_BTN, '''
0: AQs
20: A9s A8s A7s A6s A5s A4s A3s A2s K9s K8s K7s K6s K5s K4s K3s K2s Q9s Q8s Q7s Q6s Q5s J9s J8s J7s T8s T7s 98s 87s 76s 65s 54s
40: Q4s Q3s J6s J5s T6s T5s 97s 96s 86s 85s 75s 74s 64s 53s AJo ATo KQo KJo KTo QJo QTo JTo
''')
CO_BTN = widen_calls(CO_BTN, '''
20: K9s K8s K7s K6s K5s K4s K3s K2s Q9s Q8s Q7s Q6s Q5s Q4s Q3s Q2s J9s J8s J7s J6s J5s J4s T8s T7s T6s T5s T4s 98s 97s 87s 86s 76s 75s 65s 64s 54s 53s
40: J3s T3s 96s 95s 85s 84s 74s 73s 63s 52s A9o A8o A7o KTo QTo JTo K9o Q9o T9o
''')

PROFILES = {
    ('UTG', 'HJ'): UTG_HJ, ('UTG', 'CO'): UTG_CO, ('UTG', 'BTN'): UTG_BTN,
    ('HJ', 'CO'): HJ_CO, ('HJ', 'BTN'): HJ_BTN, ('CO', 'BTN'): CO_BTN,
}


def build():
    # Read both persisted predecessors from staging. The caller's capped call
    # range and the opener's RFI range inform the estimates; neither frequency
    # is multiplied into BB's conditional response.
    opening = json.loads((STAGING / 'opening-ranges.json').read_text())
    responses = json.loads((STAGING / 'preflop-ranges.json').read_text())
    result = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': 100,
            'open_size_bb': 2.5, 'ante_bb': 0,
            'scope': 'オープナー2.5BB→1人が2.5BBコール→間は全員フォールド→BBの初回応答。指定6局面のみ。',
            'source_of_truth': '先行するopening-ranges.jsonとpreflop-ranges.jsonを参照。スクイーズ額はconfigs/cash-6max-100bb.jsonの固定サイズ。',
            'legal_actions': ['fold', 'call', 'squeeze'],
            'method': '手札群と6つの位置履歴ごとに手作業で設計した整数%のAI概算。安いコールでもOOPの3人ポットを考慮し、スクイーズはバリュー中心。',
            'rake': {'rate': None, 'cap_bb': None, 'calibrated': False},
            'frequency_semantics': 'その履歴でBBが当該ハンドを持つ条件付き割合。fold+call+squeeze=100。前段のオープン・コール頻度を再乗算しない。',
            'sizing_semantics': 'スクイーズ額は追加額ではなくBBの合計投入額。頻度0なら行のsqueeze_size_bbはnull。',
            'warning': '独立したAI推定値。ソルバー出力・GTO均衡・EV計算ではなく、レーキやカード除去、前段レンジとの同時均衡も未検証。',
            'reference_note': '競合サービスのチャートや頻度は転用していない。',
        },
        'spot_count': 6, 'hand_classes_per_spot': 169,
        'entry_count': 1014, 'spots': [],
    }
    for (opener, caller), frequencies in PROFILES.items():
        assert any(s['hero'] == opener for s in opening['spots'])
        assert any(s['opener'] == opener and s['hero'] == caller for s in responses['spots'])
        size = three_bet_to(opener, 'BB', caller_count=1)
        rows = []
        for hand in HANDS:
            call, squeeze = frequencies[hand]
            rows.append({'hand': hand, 'fold': 100-call-squeeze,
                         'call': call, 'squeeze': squeeze,
                         'squeeze_size_bb': size if squeeze else None})
        result['spots'].append({
            'id': f'BB_vs_{opener}_{caller}call', 'opener': opener,
            'callers': [caller], 'hero': 'BB', 'open_size_bb': 2.5,
            'squeeze_size_bb': size, 'effective_stack_bb': 100, 'hands': rows,
        })
    return result


if __name__ == '__main__':
    data = build()
    check = """
import fs from 'node:fs';
import { validateOpeningDataset } from './src/estimated/opening-ranges.js';
import { validateDataset } from './src/estimated/ranges.js';
import { validateMultiwayDataset } from './src/estimated/multiway-responses.js';
const read = n => JSON.parse(fs.readFileSync(`${process.env.ESTIMATES_DIR}/${n}.json`, 'utf8'));
validateOpeningDataset(read('opening-ranges'));
validateDataset(read('preflop-ranges'));
validateMultiwayDataset(JSON.parse(fs.readFileSync(0, 'utf8')));
"""
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT,
                   input=serialized, text=True, check=True)
    (STAGING / 'multiway-responses.json').write_text(serialized)
    print('Generated and validated 6 spots / 1,014 hands')
