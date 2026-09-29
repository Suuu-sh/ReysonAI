"""Author a later seat's cold call / cold 4bet versus a 3bet.

History: O opens (2.5BB) → everyone between folds → X 3bets (saved
three_bet frequency and size from preflop-ranges.json) → everyone between X and
Y folds → Y decides fold / call / 4bet. O and any seats after Y are still to act.
Spot id `{Y}_vs_{X}_3bet_{O}open`; 20 spots (X = HJ / CO / BTN / SB).

This is an authoring-time, hand-group frequency table, not a solver result.
Only the staging directory used by build-estimates.mjs may be written.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from call_policy import apply_call_policy
from sizing_rules import CONFIG, four_bet_to, open_size_bb, three_bet_to

ROOT = Path(__file__).resolve().parents[1]
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.'))
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]
POSITIONS = CONFIG['positions']


def profile(spec, base=None):
    # "call four_bet: hands". Unlisted classes fold 100 (or keep the base's value
    # when overlaying); an overlay changes only the named classes.
    result = dict(base) if base is not None else dict.fromkeys(HANDS, (0, 0))
    seen = set()
    for line in spec.strip().splitlines():
        frequencies, names = line.split(':')
        call, four = map(int, frequencies.split())
        assert 0 <= call <= 100 and 0 <= four <= 100 and call + four <= 100
        for hand in names.split():
            assert hand in HANDS and hand not in seen, hand
            seen.add(hand)
            result[hand] = call, four
    return result


# How the tables are authored
# ---------------------------
# Y faces a 3bet it has not acted on, with the uncapped opener (and any later
# seats) still to act, so it continues far less than in its heads-up response
# to the same 3bettor's open (Y_vs_X in preflop-ranges.json). The call EV uses
# OPENER_BEHIND_EQR (0.85) on top of the IP/OOP table versus X's saved 3bet
# range: calling 8BB into 20BB needs ~47% raw equity for a pair IP, and ~51% for
# a blind out of position, so versus a 4-7% 3bet only QQ+/AK (and JJ in
# position) are profitable flats; TT/AQs/AJs/KQs become +EV only against the
# wider CO/BTN-open 3bets.
#
# Base tiers by the opener, i.e. by how wide X's 3bet is:
#   UTG opened (X 3bets ~4-5%): QQ+/AK 4bet core, JJ flats in position,
#       A5s/A4s as the only blocker 4bets.
#   HJ opened (5-7%): a little JJ/AQs 4bet, TT/AQs flat candidates.
#   CO opened (9-11%): JJ/TT/AQs/AQo 4bets, 99/AJs flat candidates, A3s bluffs.
#   BTN opened, SB 3bet (~17%): widest; 77+, ATs+/KQs/AJo+ flats, A5s-A2s bluffs.
# Seat adjustments: the IP base is used by CO/BTN and by BB versus an SB 3bet.
# SB and BB versus a non-SB 3bettor are out of position with players behind:
# BLIND_OOP drops the marginal flats (AKo, TT, AQs) to 4bet-or-fold and keeps
# JJ as a partial flat only where the price allows it. SB_THREE_BETTOR widens
# the BB-vs-SB 4bet a little because SB's 3bet is the widest for each opener.
# Every tier keeps AA/KK/AKs calls so the flat range is not capped (QQ never
# folds: its call is +EV everywhere), and pairs /
# suited aces mix calls with 4bets rather than splitting purely.
# The listed call cells are candidates; apply_call_policy then applies the
# shared EV rule to the calls only: below -0.05bb no call, [-0.05, +0.05) at
# most 50%, >= +0.50bb the whole non-4bet share (THREE_BET_FILL_EV). Unlisted
# hands fold unless that fill applies.
IP = {}
IP['UTG'] = profile('''
20 80: AA
25 75: KK
65 35: QQ
70 5: JJ
45 55: AKs
45 40: AKo
0 15: A5s
0 10: A4s
''')
IP['HJ'] = profile('''
75 10: JJ
45 0: TT
60 5: AQs
''', IP['UTG'])
IP['CO'] = profile('''
60 40: QQ
70 20: JJ
70 5: TT
60 0: 99
45 45: AKo
60 15: AQs
50 10: AQo
60 5: AJs
50 0: KQs
0 20: A5s
0 15: A4s
0 5: A3s
''', IP['HJ'])
IP['BTN'] = profile('''
55 45: QQ
65 25: JJ
75 10: TT
80 0: 99
70 0: 88
50 0: 77
40 60: AKs
45 55: AKo
65 30: AQs
70 15: AQo
80 10: AJs
60 0: AJo
70 5: ATs
70 5: KQs
40 0: KJs
0 30: A5s
0 25: A4s
0 15: A3s
0 10: A2s
''', IP['CO'])
BLIND_OOP = {
    'UTG': '''
0 5: JJ
0 45: AKo
''',
    'HJ': '''
40 5: JJ
0 0: TT
0 5: AQs
0 45: AKo
''',
    'CO': '''
70 15: JJ
55 0: TT
30 0: 99
60 10: AQs
0 5: AQo
40 0: AJs
0 0: KQs
''',
}
SB_THREE_BETTOR = {
    'UTG': '''
70 10: JJ
0 5: AQs
0 20: A5s
0 15: A4s
''',
    'HJ': '''
70 15: JJ
60 10: AQs
0 20: A5s
0 15: A4s
0 5: A3s
''',
    'CO': '''
65 25: JJ
60 20: AQs
0 25: A5s
0 20: A4s
0 10: A3s
''',
}


def frequencies(opener, three_bettor, hero):
    table = IP[opener]
    if three_bettor == 'SB':
        return profile(SB_THREE_BETTOR[opener], table) if opener in SB_THREE_BETTOR else table
    return profile(BLIND_OOP[opener], table) if hero in ('SB', 'BB') else table


def build():
    responses = json.loads((STAGING / 'preflop-ranges.json').read_text())
    result = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': 100,
            'open_size_bb': 2.5, 'ante_bb': 0,
            'scope': 'オープン2.5BB→間は全員フォールド→後ろの席が3bet→3bettorとHeroの間は全員フォールド→まだ行動していないHero（3bettorより後ろの席）の初回判断。オープナーとHeroより後ろの席はまだ残る。20局面。',
            'source_of_truth': 'preflop-ranges.jsonの3bet頻度とサイズ（three_bet_to）を参照。4bet額はconfigs/cash-6max-100bb.jsonの固定サイズ（four_bet_to(Hero, 3bettor)）。',
            'legal_actions': ['fold', 'call', 'four_bet'],
            'method': '手札群ごとに設計した整数%のAI概算（オープナーの位置で4段階の基本プロファイル＋ブラインドの調整）。コールは3betレンジに対する固定シード勝率×仮定EQR（OPENER_BEHIND_EQRを含む）×レーキ後ポット−コール額で選別。',
            'rake': {'rate': CONFIG['rake']['rate'], 'cap_bb': CONFIG['rake']['cap_bb'],
                     'no_flop_no_drop': CONFIG['rake']['no_flop_no_drop'], 'calibrated': True},
            'frequency_semantics': 'Heroはまだ行動していないため全169ハンドが到達する。fold+call+four_bet=100。',
            'sizing_semantics': '4bet額は追加額ではなくHeroの合計投入額。頻度0なら行のfour_bet_size_bbはnull。',
            'warning': '独立したAI推定値。レーキ環境を仮定したヒューリスティックで、ソルバー・GTO均衡・EVの厳密計算・前段との同時均衡を保証しない。',
            'reference_note': '競合サービスのチャートや頻度は転用していない。',
        },
        'spot_count': 0, 'hand_classes_per_spot': 169, 'entry_count': 0, 'spots': [],
    }
    for opener in POSITIONS[:4]:
        for three_bettor in POSITIONS[POSITIONS.index(opener) + 1:-1]:
            source = next(s for s in responses['spots'] if s['id'] == f'{three_bettor}_vs_{opener}')
            size = three_bet_to(opener, three_bettor)
            assert source['three_bet_size_bb'] == size
            for hero in POSITIONS[POSITIONS.index(three_bettor) + 1:]:
                four = four_bet_to(hero, three_bettor)
                table = frequencies(opener, three_bettor, hero)
                rows = []
                for hand in HANDS:
                    call, four_bet = table[hand]
                    rows.append({'hand': hand, 'fold': 100 - call - four_bet, 'call': call, 'four_bet': four_bet,
                                 'four_bet_size_bb': four if four_bet else None})
                result['spots'].append({
                    'id': f'{hero}_vs_{three_bettor}_3bet_{opener}open', 'hero': hero,
                    'opener': opener, 'three_bettor': three_bettor, 'source_response_id': source['id'],
                    'open_size_bb': open_size_bb(opener), 'three_bet_size_bb': size,
                    'four_bet_size_bb': four, 'effective_stack_bb': 100, 'hands': rows,
                })
    result['spot_count'] = len(result['spots'])
    result['entry_count'] = len(result['spots']) * 169
    return result


if __name__ == '__main__':
    data = build()
    check = """
import fs from 'node:fs';
import { validateColdThreeBetDataset } from './src/estimated/cold-three-bet-responses.ts';
const read = n => JSON.parse(fs.readFileSync(`${process.env.ESTIMATES_DIR}/${n}.json`, 'utf8'));
validateColdThreeBetDataset(JSON.parse(fs.readFileSync(0, 'utf8')), read('preflop-ranges'));
"""
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT,
                   input=serialized, text=True, check=True)
    (STAGING / 'cold-three-bet-responses.json').write_text(serialized)
    apply_call_policy('cold-three-bet-responses')
    print(f"Generated and validated {data['spot_count']} spots / {data['entry_count']:,} hands")
