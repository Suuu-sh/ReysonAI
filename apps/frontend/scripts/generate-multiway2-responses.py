"""Author all 15 first decisions facing an open and exactly two cold calls.

Hand-group candidates are independent AI estimates, not solver frequencies.
The shared EV policy selects calls against the saved open / first call /
second *multiway* call ranges. Only a staging directory may be written.
"""
import json
import os
import subprocess
import sys
from itertools import combinations
from pathlib import Path

from call_policy import apply_call_policy
from sizing_rules import CONFIG, STACK_BB, open_size_bb, two_caller_squeeze_to

ROOT = Path(__file__).resolve().parents[1]
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]


def profile(spec, base=None):
    """Explicit call%, squeeze% candidates; unlisted classes fold 100%."""
    result = dict(base) if base is not None else dict.fromkeys(HANDS, (0, 0))
    seen = set()
    for line in spec.strip().splitlines():
        frequencies, names = line.split(':')
        call, squeeze = map(int, frequencies.split())
        assert 0 <= call <= 100 and 0 <= squeeze <= 100 and call + squeeze <= 100
        for hand in names.split():
            assert hand in HANDS and hand not in seen, hand
            seen.add(hand)
            result[hand] = call, squeeze
    return result


# BB closes action with 1.5BB to call. Four-way realization and three saved
# opponent ranges still penalize dominated offsuit hands. Protect passive
# ranges with AA/KK/AKs; the small wheel-ace squeeze component is deliberate.
# The EV gate may remove any candidate call, including a premium when the
# saved opponent ranges make that call negative EV. No minimum call is forced.
BB_UTG = profile('''
20 80: AA KK
40 60: QQ
60 35: JJ
70 15: TT
70 5: 99
65 0: 88
60 0: 77
55 0: 66
50 0: 55
45 0: 44
40 0: 33
35 0: 22
30 70: AKs
55 25: AQs
60 10: AJs
55 0: ATs
45 0: A9s
40 0: A8s
35 0: A7s
30 0: A6s
35 25: A5s
30 15: A4s
25 10: A3s
20 5: A2s
30 65: AKo
25 15: AQo
15 0: AJo
5 0: ATo
60 15: KQs
50 5: KJs
40 0: KTs
25 0: K9s
15 0: K8s
5 0: K7s
20 5: KQo
10 0: KJo
50 0: QJs JTs T9s
35 0: QTs
20 0: Q9s
10 0: Q8s
10 0: QJo JTo
30 0: J9s T8s
15 0: J8s T7s
45 0: 98s
25 0: 97s
10 0: 96s
40 0: 87s
20 0: 86s
35 0: 76s
15 0: 75s
30 0: 65s
10 0: 64s
25 0: 54s
10 0: 43s
''')

# HJ opens wider than UTG. This is a separate explicit authoring overlay,
# never a multiple of a heads-up strategy or a mechanically retained width.
BB_HJ = profile('''
30 70: QQ
50 45: JJ
65 25: TT
70 10: 99
70 0: 88
65 0: 77
60 0: 66
55 0: 55
50 0: 44
45 0: 33
40 0: 22
50 35: AQs
60 15: AJs
60 5: ATs
50 0: A9s
45 0: A8s
40 0: A7s
35 0: A6s
40 25: A5s
35 20: A4s
30 10: A3s
25 5: A2s
30 20: AQo
20 5: AJo
10 0: ATo
65 20: KQs
55 10: KJs
45 0: KTs
30 0: K9s
20 0: K8s
10 0: K7s
25 10: KQo
15 0: KJo
55 5: QJs
45 0: QTs
30 0: Q9s
15 0: Q8s
15 0: QJo JTo
55 0: JTs T9s
40 0: J9s T8s
20 0: J8s T7s
50 0: 98s
30 0: 97s
15 0: 96s
45 0: 87s
25 0: 86s
40 0: 76s
20 0: 75s
35 0: 65s
15 0: 64s
30 0: 54s
15 0: 43s
''', BB_UTG)

# A second caller in SB comes from SB's protected multiway flat, which is
# much stronger than its (empty) heads-up call range. Reduce marginal squeezes
# and candidate flats against this condensed source, rather than making the
# entire history unreachable or substituting a heads-up SB call.
SB_SECOND = '''
45 55: QQ
55 30: JJ
60 10: TT
55 0: 99
50 0: 88
45 0: 77
40 0: 66
35 0: 55
30 0: 44
25 0: 33
20 0: 22
45 20: AQs
40 5: AJs
35 0: ATs
30 0: A9s
25 0: A8s
20 0: A7s A6s
25 20: A5s
20 15: A4s
15 10: A3s
10 5: A2s
20 60: AKo
10 10: AQo
0 0: AJo ATo KJo QJo JTo
40 10: KQs
30 0: KJs
20 0: KTs
10 0: K9s
0 0: K8s K7s
5 5: KQo
35 0: QJs JTs T9s
25 0: QTs
10 0: Q9s Q8s
20 0: J9s T8s
10 0: J8s T7s
30 0: 98s
20 0: 97s
10 0: 96s
30 0: 87s
15 0: 86s
25 0: 76s
10 0: 75s
20 0: 65s
10 0: 64s
20 0: 54s
5 0: 43s
'''
BB_UTG_SB = profile(SB_SECOND, BB_UTG)
BB_HJ_SB = profile('''
40 60: QQ
60 35: JJ
65 15: TT
60 5: 99
55 0: 88
50 0: 77
45 0: 66
40 0: 55
35 0: 44
30 0: 33
25 0: 22
50 25: AQs
45 10: AJs
40 0: ATs
15 15: AQo
45 15: KQs
35 5: KJs
25 0: KTs
15 0: K9s
''', BB_UTG_SB)
BB_CO_SB = profile('''
35 65: QQ
60 40: JJ
70 20: TT
65 10: 99
60 0: 88
55 0: 77
50 0: 66
45 0: 55
40 0: 44
35 0: 33
30 0: 22
50 35: AQs
50 15: AJs
45 5: ATs
35 0: A9s
30 0: A8s
25 0: A7s A6s
30 25: A5s
25 20: A4s
20 10: A3s
15 5: A2s
20 20: AQo
10 5: AJo
50 20: KQs
40 10: KJs
30 0: KTs
20 0: K9s
10 0: K8s
15 10: KQo
40 5: QJs
30 0: QTs
15 0: Q9s
40 0: JTs T9s 98s
25 0: J9s T8s
35 0: 87s
30 0: 76s
25 0: 65s 54s
''', BB_HJ_SB)

# SB pays 2BB and acts OOP with BB still behind. Keep a small protected flat
# and a value-heavy squeeze; weaker pairs/connected hands are only candidates
# until the four-way EQR + BB-behind discount has been applied.
SB_UTG = profile('''
20 80: AA KK
35 65: QQ
45 40: JJ
50 20: TT
40 5: 99
30 0: 88
20 0: 77
10 0: 66 55 44 33 22
30 70: AKs
40 30: AQs
30 10: AJs
15 0: ATs
5 0: A9s A8s A7s A6s
0 25: A5s
0 15: A4s
0 10: A3s
0 5: A2s
25 65: AKo
10 15: AQo
25 15: KQs
15 5: KJs
10 0: KTs QJs JTs T9s
5 0: QTs 98s 87s 76s 65s 54s
''')
SB_HJ = profile('''
30 70: QQ
45 45: JJ
55 25: TT
45 10: 99
35 0: 88
25 0: 77
15 0: 66 55
45 35: AQs
35 15: AJs
20 5: ATs
10 0: A9s A8s A7s A6s
0 30: A5s
0 20: A4s
15 20: AQo
30 20: KQs
20 10: KJs
15 0: KTs QJs JTs T9s
10 0: QTs 98s 87s 76s 65s 54s
''', SB_UTG)

# Only UTG → HJ → CO can leave BTN as Hero. BTN has position on every
# opponent, but its full 2.5BB call still faces both blinds behind it.
BTN_UTG_HJ_CO = profile('''
20 80: AA KK
35 65: QQ
55 40: JJ
65 20: TT
55 5: 99
45 0: 88
35 0: 77
30 0: 66
25 0: 55 44 33 22
30 70: AKs
45 35: AQs
45 15: AJs
35 5: ATs
25 0: A9s
20 0: A8s A7s A6s
15 25: A5s
10 15: A4s
5 10: A3s
5 5: A2s
30 60: AKo
20 20: AQo
10 0: AJo
45 20: KQs
30 5: KJs
20 0: KTs
10 0: K9s
10 5: KQo
30 0: QJs JTs T9s
20 0: QTs
10 0: Q9s J9s T8s
25 0: 98s 87s 76s
15 0: 65s 54s
''')


def source(dataset, identifier, action):
    matches = [spot for spot in dataset['spots'] if spot['id'] == identifier]
    if len(matches) != 1:
        raise ValueError(f'Missing or duplicate predecessor: {identifier}')
    spot = matches[0]
    if [row['hand'] for row in spot['hands']] != HANDS or any(
            not isinstance(row[action], int) or isinstance(row[action], bool) or not 0 <= row[action] <= 100
            for row in spot['hands']):
        raise ValueError(f'Malformed predecessor: {identifier}')
    return spot


def build(staging):
    opening, responses, multiway = [json.loads((staging / f'{name}.json').read_text())
        for name in ('opening-ranges', 'preflop-ranges', 'multiway-responses')]
    result = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': STACK_BB,
            'open_size_bb': 2.5, 'ante_bb': 0,
            'scope': '2.5BBオープン→1人目コール→2人目コール→後続Heroの初回応答。間の席はフォールド。2コーラーの15履歴のみ。',
            'source_of_truth': 'openerはopening-rangesのopen、c1はpreflop-rangesのcall、c2はmultiway-responsesの当該1コーラー履歴のcall。c2にheads-up callを代用しない。',
            'legal_actions': ['fold', 'call', 'squeeze'],
            'method': '明示した手札群のAI候補頻度を、保存された3相手レンジとの固定seed勝率・4人EQR・レーキ後call EVで選別。AA/KK/AKsの受け身候補と少量のwheel blocker squeezeを持つ。',
            'rake': {**CONFIG['rake'], 'calibrated': True},
            'frequency_semantics': 'Heroは初回応答なので全169手が到達。前段の頻度をHeroの頻度へ掛けない。履歴全体が到達不能の場合だけunreachable=trueかつ全手fold100の非推奨placeholder。',
            'sizing_semantics': '固定policyのcaller_count=2。BTNは14.5BB、SB/BBは15.5BBへの合計raise-to。頻度0の行サイズはnull。',
            'warning': '独立したAI推定値。ソルバー・GTO均衡や前段との同時均衡を保証しない。',
            'reference_note': '競合サービスのチャートや頻度は転用していない。',
        },
        'spot_count': 15, 'hand_classes_per_spot': 169, 'entry_count': 15 * 169, 'spots': [],
    }
    for opener in CONFIG['positions'][:3]:
        following = CONFIG['positions'][CONFIG['positions'].index(opener) + 1:]
        for c1, c2, hero in combinations(following, 3):
            open_id = f'{opener}_open'
            caller_ids = [f'{c1}_vs_{opener}', f'{c2}_vs_{opener}_{c1}call']
            predecessors = [(source(opening, open_id, 'open'), 'open'),
                            (source(responses, caller_ids[0], 'call'), 'call'),
                            (source(multiway, caller_ids[1], 'call'), 'call')]
            unreachable = any(not any(row[action] > 0 for row in spot['hands']) for spot, action in predecessors)
            if hero == 'BTN':
                frequencies = BTN_UTG_HJ_CO
            elif hero == 'SB':
                frequencies = {'UTG': SB_UTG, 'HJ': SB_HJ}[opener]
            elif c2 == 'SB':
                frequencies = {'UTG': BB_UTG_SB, 'HJ': BB_HJ_SB, 'CO': BB_CO_SB}[opener]
            else:
                frequencies = {'UTG': BB_UTG, 'HJ': BB_HJ}[opener]
            size = two_caller_squeeze_to(opener, hero)
            rows = []
            for hand in HANDS:
                call, squeeze = (0, 0) if unreachable else frequencies[hand]
                rows.append({'hand': hand, 'fold': 100-call-squeeze, 'call': call,
                             'squeeze': squeeze, 'squeeze_size_bb': size if squeeze else None})
            result['spots'].append({
                'id': f'{hero}_vs_{opener}_{c1}call_{c2}call', 'hero': hero, 'opener': opener,
                'callers': [c1, c2], 'source_opening_id': open_id, 'source_caller_ids': caller_ids,
                'open_size_bb': open_size_bb(opener), 'squeeze_size_bb': size,
                'effective_stack_bb': STACK_BB, 'unreachable': unreachable, 'hands': rows,
            })
    return result


if __name__ == '__main__':
    directory = os.environ.get('ESTIMATES_DIR')
    if not directory or Path(directory).resolve() == (ROOT / 'src/estimated').resolve():
        sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.')
    staging = Path(directory)
    data = build(staging)
    check = """
import fs from 'node:fs';
import { validateMultiway2Dataset } from './src/estimated/multiway2-responses.ts';
const read = n => JSON.parse(fs.readFileSync(`${process.env.ESTIMATES_DIR}/${n}.json`, 'utf8'));
validateMultiway2Dataset(JSON.parse(fs.readFileSync(0, 'utf8')), read('multiway-responses'), read('preflop-ranges'), read('opening-ranges'));
"""
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT,
                   input=serialized, text=True, check=True)
    (staging / 'multiway2-responses.json').write_text(serialized)
    apply_call_policy('multiway2-responses')
    # Verify the final policy-selected file as well as the authored candidate.
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT,
                   input=(staging / 'multiway2-responses.json').read_text(), text=True, check=True)
    print(f"Generated and validated {data['spot_count']} spots / {data['entry_count']:,} hands")
