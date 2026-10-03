"""Author the two saved responses after each of the 20 cold-4bet histories.

O opens -> X 3bets -> Y cold-4bets -> all other seats fold -> O responds,
with X behind; X's response is saved only after O folds. No range after O's
call or shove is implied. Frequencies are conditional on O's open or X's
3bet, not multiplied into them. Independent AI estimates, never solver GTO.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from call_policy import apply_call_policy
from sizing_rules import CONFIG, STACK_BB, four_bet_to, in_position, open_size_bb, three_bet_to

ROOT = Path(__file__).resolve().parents[1]
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; staging required.'))
if STAGING.resolve() == (ROOT / 'src/estimated').resolve():
    sys.exit('Generators never write src/estimated directly; staging required.')
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]
POSITIONS = CONFIG['positions']


def profile(spec, base=None):
    # "call all_in: hands"; all unlisted classes fold, or retain the base.
    result = dict(base) if base is not None else dict.fromkeys(HANDS, (0, 0))
    seen = set()
    for line in spec.strip().splitlines():
        frequencies, names = line.split(':')
        call, shove = map(int, frequencies.split())
        assert 0 <= call <= 100 and 0 <= shove <= 100 and call + shove <= 100
        for hand in names.split():
            assert hand in HANDS and hand not in seen, hand
            seen.add(hand)
            result[hand] = call, shove
    return result


# Candidate calls, not an EV claim. The opener faces the largest incremental
# price and an uncapped 3bettor still behind. Its shared EQR therefore includes
# the additional behind discount. X has already put in its 3bet and, after O
# folds, faces only Y, with O's open remaining as dead money.
#
# Y's saved cold-4bet range widens with the opener (UTG -> HJ -> CO -> BTN).
# Each role has its own explicit pair/broadway ladder; the IP overlays retain
# more medium calls, never change sizes, and preserve family strength order.
# AA/KK/AK have both flat and shove candidates in every profile. QQ mixes,
# lower pairs and dominated broadways continue less; small A5s blocker shoves
# are the only unpaired weak-ace exception. A5s is never promoted to a flat.
#
# apply_call_policy gates these candidates against Y's source.four_bet range:
# EV < -0.05BB removes calls; EV < +0.05BB caps them at 50%. These are 4bet
# pots, so positive EV alone never fills folds. A premium flat that fails the
# opener's behind-adjusted EV gate must not be forced back in: even KK is a
# negative-EV OOP call versus the tight early-seat cold-4bet ranges.
# All shoves are the existing total 100BB 5bet, not 100BB additional chips.
OPENER = {}
OPENER['UTG'] = profile('''
25 75: AA
35 65: KK
45 25: QQ
25 0: JJ
10 0: TT
55 45: AKs
45 55: AKo
20 0: AQs
5 0: AJs KQs
0 5: A5s
''')
OPENER['HJ'] = profile('''
50 25: QQ
35 5: JJ
20 0: TT
5 0: 99
30 5: AQs
10 0: AJs KQs
5 0: AQo
''', OPENER['UTG'])
OPENER['CO'] = profile('''
55 30: QQ
45 10: JJ
30 0: TT
15 0: 99
40 5: AQs
20 0: AJs KQs
10 0: ATs AQo
5 0: KJs QJs JTs
0 5: A4s
''', OPENER['HJ'])
OPENER['BTN'] = profile('''
55 45: QQ
50 20: JJ
40 5: TT
25 0: 99
10 0: 88
45 10: AQs
30 5: AJs
25 0: ATs KQs
20 0: AQo
15 0: KJs QJs JTs
5 0: AJo KTs QTs T9s
''', OPENER['CO'])

# O is IP to Y only when the cold-4bettor is a blind. The saved Y size can
# also be lower (20BB vs 26BB), so more calls are candidates; EV still decides.
OPENER_IP = {
    'UTG': '''
55 25: QQ
35 0: JJ
20 0: TT
30 0: AQs
10 0: AJs KQs
''',
    'HJ': '''
60 25: QQ
45 5: JJ
30 0: TT
15 0: 99
40 5: AQs
20 0: AJs KQs
10 0: AQo
''',
    'CO': '''
60 30: QQ
55 10: JJ
40 0: TT
25 0: 99
10 0: 88
50 5: AQs
30 0: AJs KQs
20 0: ATs AQo
10 0: KJs QJs JTs
''',
    # BTN is already IP in the only BTN-open history (SB 3bet, BB cold-4bet).
    'BTN': '''
55 45: QQ
''',
}

THREE_BETTOR = {}
THREE_BETTOR['UTG'] = profile('''
25 75: AA
30 70: KK
65 35: QQ
50 5: JJ
30 0: TT
10 0: 99
50 50: AKs
40 60: AKo
40 5: AQs
20 0: AJs KQs
5 0: ATs AQo QJs JTs
0 5: A5s
''')
THREE_BETTOR['HJ'] = profile('''
55 10: JJ
40 0: TT
20 0: 99
45 5: AQs
25 0: AJs KQs
15 0: ATs AQo
10 0: KJs QJs JTs
''', THREE_BETTOR['UTG'])
THREE_BETTOR['CO'] = profile('''
60 15: JJ
50 5: TT
30 0: 99
15 0: 88
50 10: AQs
35 5: AJs
30 0: ATs KQs AQo
20 0: KJs QJs JTs
10 0: AJo KTs QTs T9s
0 5: A4s
''', THREE_BETTOR['HJ'])
THREE_BETTOR['BTN'] = profile('''
60 20: JJ
55 10: TT
40 5: 99
25 0: 88
10 0: 77
55 15: AQs
45 5: AJs
40 0: ATs KQs AQo
30 0: KJs QJs JTs
20 0: AJo KTs QTs T9s
10 0: A9s J9s 98s
5 0: KQo
''', THREE_BETTOR['CO'])
THREE_BETTOR_IP = {
    'UTG': '''
60 5: JJ
40 0: TT
20 0: 99
50 5: AQs
30 0: AJs KQs
15 0: ATs AQo QJs JTs
10 0: KJs
''',
    'HJ': '''
65 10: JJ
50 0: TT
30 0: 99
10 0: 88
55 5: AQs
35 0: AJs KQs
25 0: ATs AQo
20 0: KJs QJs JTs
''',
    'CO': '''
65 15: JJ
60 5: TT
40 0: 99
25 0: 88
10 0: 77
55 10: AQs
45 5: AJs
40 0: ATs KQs AQo
30 0: KJs QJs JTs
20 0: AJo KTs QTs T9s
''',
}


def frequencies(opener, hero, four_bettor, prior_action):
    base = OPENER[opener] if prior_action is None else THREE_BETTOR[opener]
    overlays = OPENER_IP if prior_action is None else THREE_BETTOR_IP
    return profile(overlays[opener], base) if in_position(hero, four_bettor) else base


def build():
    openings = json.loads((STAGING / 'opening-ranges.json').read_text())
    responses = json.loads((STAGING / 'preflop-ranges.json').read_text())
    cold_three_bets = json.loads((STAGING / 'cold-three-bet-responses.json').read_text())
    result = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': STACK_BB,
            'open_size_bb': CONFIG['sizing']['open_sizes_bb'][0], 'ante_bb': CONFIG['ante_bb'],
            'scope': 'オープン→3bet→後ろの席のコールド4bet→他の席は全員フォールド。オープナー（3bettorが後ろに残る）と、オープナーがフォールドした後だけの3bettorの応答、計40局面。オープナーがコールまたはオールインした後の応答は含まない。',
            'source_of_truth': 'opening-ranges.jsonのopen、preflop-ranges.jsonのthree_bet、cold-three-bet-responses.jsonのfour_betを参照。前段の保存済みサイズを維持。',
            'legal_actions': ['fold', 'call', 'all_in'],
            'method': '役割・オープナー位置・IP/OOP別に手札グループを明示した整数%のAI概算。コール候補は保存済みコールド4betレンジに対する固定シード勝率×仮定EQR×レーキ後ポット−追加コール額で選別。オープナーには後ろの3bettorの割引を適用し、4betポットの自動コール追加は行わない。',
            'rake': {'rate': CONFIG['rake']['rate'], 'cap_bb': CONFIG['rake']['cap_bb'],
                     'no_flop_no_drop': CONFIG['rake']['no_flop_no_drop'], 'calibrated': True},
            'frequency_semantics': 'オープナーは保存open頻度、3bettorは保存three_bet頻度で到達。各行のfold+call+all_in=100は到達条件付き。到達0はfold100の非推奨プレースホルダー。',
            'sizing_semantics': '唯一の5betは合計100BBのall_in。追加100BBではない。頻度0なら行のall_in_size_bbはnull。',
            'warning': '独立したAI推定値。仮定EQRを用いたヒューリスティックで、ソルバー・GTO均衡・同時均衡や厳密なEVを保証しない。',
            'reference_note': '競合サービスのチャートや頻度は転用していない。',
        },
        'spot_count': 0, 'hand_classes_per_spot': len(HANDS), 'entry_count': 0, 'spots': [],
    }
    for opener in POSITIONS[:4]:
        opening = next(s for s in openings['spots'] if s['id'] == f'{opener}_open')
        for three_bettor in POSITIONS[POSITIONS.index(opener) + 1:-1]:
            response = next(s for s in responses['spots'] if s['id'] == f'{three_bettor}_vs_{opener}')
            for four_bettor in POSITIONS[POSITIONS.index(three_bettor) + 1:]:
                source_id = f'{four_bettor}_vs_{three_bettor}_3bet_{opener}open'
                source = next(s for s in cold_three_bets['spots'] if s['id'] == source_id)
                three_bet, four_bet = source['three_bet_size_bb'], source['four_bet_size_bb']
                assert three_bet == response['three_bet_size_bb'] == three_bet_to(opener, three_bettor)
                assert source['open_size_bb'] == opening['open_size_bb'] == open_size_bb(opener)
                assert four_bet == four_bet_to(four_bettor, three_bettor)
                assert 2 * three_bet - open_size_bb(opener) <= four_bet < STACK_BB
                for prior_action in (None, 'fold'):
                    hero = opener if prior_action is None else three_bettor
                    spot_id = (f'{opener}_vs_{four_bettor}_cold4bet_{three_bettor}3bet' if prior_action is None
                               else f'{three_bettor}_vs_{four_bettor}_cold4bet_{opener}open')
                    reach_action = 'open' if prior_action is None else 'three_bet'
                    reach = {r['hand']: r[reach_action] for r in (opening if prior_action is None else response)['hands']}
                    table = frequencies(opener, hero, four_bettor, prior_action)
                    rows = []
                    for hand in HANDS:
                        call, shove = table[hand] if reach[hand] > 0 else (0, 0)
                        rows.append({'hand': hand, 'fold': 100 - call - shove, 'call': call, 'all_in': shove,
                                     'all_in_size_bb': STACK_BB if shove else None})
                    result['spots'].append({
                        'id': spot_id, 'hero': hero, 'opener': opener, 'three_bettor': three_bettor,
                        'four_bettor': four_bettor, 'prior_action': prior_action,
                        'source_opening_id': opening['id'], 'source_response_id': response['id'],
                        'source_cold_three_bet_id': source['id'],
                        'open_size_bb': source['open_size_bb'], 'three_bet_size_bb': three_bet,
                        'four_bet_size_bb': four_bet, 'all_in_size_bb': STACK_BB,
                        'effective_stack_bb': STACK_BB, 'hands': rows,
                    })
    result['spot_count'] = len(result['spots'])
    result['entry_count'] = len(result['spots']) * len(HANDS)
    return result


if __name__ == '__main__':
    data = build()
    check = """
import fs from 'node:fs';
import { validateColdFourBetDataset } from './src/estimated/cold-four-bet-responses.ts';
const read = n => JSON.parse(fs.readFileSync(`${process.env.ESTIMATES_DIR}/${n}.json`, 'utf8'));
validateColdFourBetDataset(JSON.parse(fs.readFileSync(0, 'utf8')), read('cold-three-bet-responses'), read('preflop-ranges'), read('opening-ranges'));
"""
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT,
                   input=serialized, text=True, check=True)
    destination = STAGING / 'cold-four-bet-responses.json'
    destination.write_text(serialized)
    apply_call_policy('cold-four-bet-responses')
    # The shared policy may trim calls, but cannot weaken validation guarantees.
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT,
                   input=destination.read_text(), text=True, check=True)
    print(f"Generated and validated {data['spot_count']} spots / {data['entry_count']:,} hands")
