"""Author the responses after a later seat squeezes an open plus one cold call.

Three decisions per squeeze history (squeezer S, opener O, caller C):
  1. O responds with C still behind              `{O}_vs_{S}_squeeze_{C}call`
  2. C responds after O folded                    `{C}_vs_{S}_squeeze_{O}fold`
  3. C responds after O called (three-way pot)    `{C}_vs_{S}_squeeze_{O}call`
Every seat after S folds before the action returns to O (later-seat cold
4bets / overcalls are out of scope). O's 4bet followed by C, and S facing a
4bet, are not stored. Histories with no saved open or cold call are wholly
unreachable, including the four histories whose original caller is SB.

This is an authoring-time, hand-group frequency table, not a solver result.
Only the staging directory used by build-estimates.mjs may be written.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from call_policy import apply_call_policy
from sizing_rules import CONFIG, squeeze_four_bet_to, three_bet_to

ROOT = Path(__file__).resolve().parents[1]
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.'))
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]
MATCHUPS = [('UTG', 'HJ'), ('UTG', 'CO'), ('UTG', 'BTN'), ('HJ', 'CO'), ('HJ', 'BTN'), ('CO', 'BTN')]
SQUEEZERS = ['BB', 'SB']
# Preserve the existing twelve histories, then append the eight stage1a
# histories in the same order as multiway-responses.ts.
HISTORIES = [(squeezer, opener, caller) for squeezer in SQUEEZERS for opener, caller in MATCHUPS] + [
    ('CO', 'UTG', 'HJ'), ('BTN', 'UTG', 'HJ'),
    ('BTN', 'UTG', 'CO'), ('BTN', 'HJ', 'CO'),
    ('BB', 'UTG', 'SB'), ('BB', 'HJ', 'SB'),
    ('BB', 'CO', 'SB'), ('BB', 'BTN', 'SB'),
]


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
# Three base tiers by opener seat: the squeeze of a UTG open is the tightest
# (BB ~40 combos incl. blocker bluffs), a CO open the widest (~60).
# SQUEEZER_SB overlays add a few call candidates because SB's squeeze carries
# relatively more JJ/TT and wheel-ace bluffs; which squeezer is wider depends on
# the history (BB's UTG/HJ squeezes include K-x/A-x blocker bluffs), so the EV
# gate, not the overlay, decides the final flats. 4bet frequencies are authored here;
# the listed call cells are the hands we intend to flat when the price is
# right. apply_call_policy then applies the shared EV rule to the calls only:
# below -0.05bb no call, [-0.05, +0.05) at most 50%, >= +0.50bb the whole
# non-4bet share (THREE_BET_FILL_EV). Hands listed with a call are therefore
# the candidates; unlisted hands fold.

# ---------------------------------------------------------------------------
# 1. Opener facing the squeeze, caller still behind (call%, 4bet%).
# Core 4bet: QQ+/AK. The caller behind (CALLER_BEHIND_EQR 0.90) and the 13BB
# price keep the flat narrower than versus a heads-up 3bet: JJ/TT/AQs flat only
# against the wider squeezes. AA/KK keep 20-25% flats so the call is not capped.
# ---------------------------------------------------------------------------
OPENER_UTG = profile('''
20 80: AA
25 75: KK
50 50: QQ
30 70: AKs
45 55: AKo
70 15: JJ
90 0: TT
85 5: AQs
0 10: A5s
0 5: A4s
''')
OPENER_HJ = profile('''
75 20: JJ
95 5: TT
100 0: 99
80 10: AQs
95 5: AQo
100 0: AJs KQs
0 15: A5s
0 10: A4s
''', OPENER_UTG)
OPENER_CO = profile('''
45 55: QQ
70 30: JJ
90 10: TT
95 5: 99
100 0: 88 77 66 55 44
80 20: AQs
90 10: AQo
95 5: AJs
100 0: KQs ATs AJo KJs
0 20: A5s
0 15: A4s
0 5: A3s
''', OPENER_HJ)

# ---------------------------------------------------------------------------
# 2. Caller after the opener folded (call%, 4bet%). The caller's range is its
# capped cold-call range (HJ/CO vs UTG still hold AA/KK/AKs 10%). The opener's
# 2.5BB is dead money, so every positive-EV hand continues: mostly pairs and
# AQ/AJs, widening to suited aces versus SB's widest squeeze. 4bets are the
# top of that range plus low-frequency A/K-blocker bluffs (5-15%) spread over
# suited aces, suited Kx and AQo/AJo rather than a few pure bluff hands, so the
# 4bet range is not only premiums and the flat/fold split is not pure.
# ---------------------------------------------------------------------------
CALLER_FOLD_UTG = profile('''
25 75: AA KK
40 60: AKs
60 40: QQ
60 40: AKo
80 20: JJ
90 10: TT
100 0: 99 88 77 66 55 44
90 10: AQs
95 5: AJs KQs AQo ATs KJs KTs AJo A9s A8s A7s A6s
0 20: A5s
0 15: A4s
0 10: A3s A2s
''')
CALLER_FOLD_HJ = profile('''
100 0: 33 22
90 10: AJs KQs AQo ATs KJs KTs AJo A9s A8s A7s A6s
''', CALLER_FOLD_UTG)
CALLER_FOLD_CO = profile('''
85 15: TT
90 10: 99
90 10: A9s A8s A7s A6s KJs AJo
100 0: QJs JTs 76s
75 25: A5s
85 15: A4s
0 15: A3s A2s
''', CALLER_FOLD_HJ)

# ---------------------------------------------------------------------------
# 3. Caller after the opener called: three-way and sandwiched between the
# squeezer and the opener's squeeze-call range, so tighter than 2. Flats are
# the pairs that still have the price (set value is not modelled beyond the
# realization ratio), 4bets only the very top. From the HJ-open tier, TT and a
# few A/K-blocker hands (AQo, AJs, KQs) carry low-frequency 4bets so the narrow
# cold-call range (2026-10-02 revision) does not split into pure flats and pure
# folds.
# ---------------------------------------------------------------------------
CALLER_CALL_UTG = profile('''
20 80: AA KK
40 60: QQ
50 40: AKs
50 20: AKo
85 15: JJ
100 0: TT 99
100 0: AQs
''')
CALLER_CALL_HJ = profile('''
80 20: JJ
90 10: TT
100 0: 88
0 10: AQo
0 5: AJs KQs
''', CALLER_CALL_UTG)
CALLER_CALL_CO = profile('''
90 10: TT
100 0: 77 AJs KQs
''', CALLER_CALL_HJ)

TIERS = {'UTG': 0, 'HJ': 1, 'CO': 2}
PROFILES = {
    None: [OPENER_UTG, OPENER_HJ, OPENER_CO],
    'fold': [CALLER_FOLD_UTG, CALLER_FOLD_HJ, CALLER_FOLD_CO],
    'call': [CALLER_CALL_UTG, CALLER_CALL_HJ, CALLER_CALL_CO],
}
# SB squeezes a little wider than BB in the same history (more A5s/A4s, JJ/TT).
SQUEEZER_SB = {
    None: ['''
75 20: JJ
95 5: TT
80 10: AQs
100 0: 99
0 15: A5s
''', '''
100 0: 88 77 66
''', '''
100 0: 33 22 KQo
'''],
    'fold': ['''
100 0: 33
''', '''
90 10: A9s A8s
''', '''
85 15: A3s A2s
90 10: K9s ATo
100 0: QTs T9s 98s 87s 65s
'''],
    'call': ['''
100 0: 88
''', '''
100 0: 77
''', '''
100 0: 66
'''],
}

# CO/BTN squeeze to the saved IP size (12BB), while both original players
# respond OOP and 4bet to the approved 26BB (the ordinary 20BB OOP size is
# below the full-raise minimum). Keep premium traps; redistribute part of the
# QQ/AK/JJ region to the 4bet and start with fewer thin OOP flat candidates.
# The smaller price does not imply that the IP profiles are valid OOP: the
# shared squeeze EV policy applies the actual position, caller-behind / three-
# way EQR and saved squeeze range before selecting the final calls. These
# explicit overlays never change any of the twelve existing blind histories.
SQUEEZER_NONBLIND = {
    None: [profile('''
40 60: QQ AKo
60 20: JJ
50 0: TT
65 5: AQs
''', OPENER_UTG), profile('''
40 60: QQ AKo
65 25: JJ
60 10: TT
50 0: 99
65 10: AQs
40 10: AQo
45 0: AJs KQs
''', OPENER_HJ)],
    'fold': [profile('''
50 50: QQ AKo
70 25: JJ
70 15: TT
65 0: 99 88 77 66 55 44
70 10: AQs
60 5: AJs KQs AQo ATs KJs KTs AJo A9s A8s A7s A6s
''', CALLER_FOLD_UTG), profile('''
50 50: QQ AKo
75 25: JJ
75 15: TT
70 0: 99 88 77 66 55 44 33 22
75 10: AQs
65 10: AJs KQs AQo ATs KJs KTs AJo A9s A8s A7s A6s
''', CALLER_FOLD_HJ)],
    'call': [profile('''
60 40: JJ
65 10: TT
55 0: 99
65 0: AQs
''', CALLER_CALL_UTG), profile('''
65 35: JJ
70 15: TT
60 0: 99 88
70 0: AQs
''', CALLER_CALL_HJ)],
}


def frequencies(squeezer, opener, prior):
    if squeezer in ('CO', 'BTN'):
        return SQUEEZER_NONBLIND[prior][TIERS[opener]]
    base = PROFILES[prior][TIERS[opener]]
    return profile(SQUEEZER_SB[prior][TIERS[opener]], base) if squeezer == 'SB' else base


def spot_id(squeezer, opener, caller, prior):
    return f'{opener}_vs_{squeezer}_squeeze_{caller}call' if prior is None else f'{caller}_vs_{squeezer}_squeeze_{opener}{prior}'


def build():
    opening = json.loads((STAGING / 'opening-ranges.json').read_text())
    responses = json.loads((STAGING / 'preflop-ranges.json').read_text())
    multiway = json.loads((STAGING / 'multiway-responses.json').read_text())
    opens = {s['hero']: {r['hand']: r['open'] for r in s['hands']} for s in opening['spots']}
    calls = {(s['opener'], s['hero']): {r['hand']: r['call'] for r in s['hands']} for s in responses['spots']}
    result = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': 100,
            'open_size_bb': 2.5, 'ante_bb': 0,
            'scope': 'オープン2.5BB→1人がコール→後続席が固定サイズにスクイーズ（CO/BTNは12BB、SB/BBは13BB、スクイーザーより後ろは全員フォールド）→オープナーの応答（コーラーが後ろに残る）、オープナーがフォールドした後のコーラーの応答、オープナーがコールした後のコーラーの応答。各20局面。元のオープンまたはコールが全0%の履歴は全手fold=100の到達不能プレースホルダー。',
            'source_of_truth': 'multiway-responses.jsonのスクイーズ頻度と、先行するopening-ranges.json・preflop-ranges.jsonを参照。4bet額はconfigs/cash-6max-100bb.jsonの固定サイズ。',
            'legal_actions': ['fold', 'call', 'four_bet'],
            'method': '手札群ごとに設計した整数%のAI概算（オープナーの位置で3段階の基本プロファイルとCO/BTNスクイーズへのOOP応答プロファイル）。コールはスクイーズレンジに対する固定シード勝率×仮定EQR×レーキ後ポット−コール額で選別。',
            'rake': {'rate': CONFIG['rake']['rate'], 'cap_bb': CONFIG['rake']['cap_bb'],
                     'no_flop_no_drop': CONFIG['rake']['no_flop_no_drop'], 'calibrated': True},
            'frequency_semantics': 'その履歴でHeroが当該ハンドを持つ条件付き割合。fold+call+four_bet=100。前段の頻度を再乗算しない。前段で0%の手はfold=100の到達不能プレースホルダー。',
            'sizing_semantics': '4bet額は追加額ではなくHeroの合計投入額。頻度0なら行のfour_bet_size_bbはnull。',
            'warning': '独立したAI推定値。レーキ環境を仮定したヒューリスティックで、ソルバー・GTO均衡・EVの厳密計算・前段との同時均衡を保証しない。',
            'reference_note': '競合サービスのチャートや頻度は転用していない。',
        },
        'spot_count': len(HISTORIES) * 3, 'hand_classes_per_spot': len(HANDS),
        'entry_count': len(HISTORIES) * 3 * len(HANDS), 'spots': [],
    }
    for prior in [None, 'fold', 'call']:
        for squeezer, opener, caller in HISTORIES:
            source = next(s for s in multiway['spots'] if s['id'] == f'{squeezer}_vs_{opener}_{caller}call')
            size = three_bet_to(opener, squeezer, caller_count=1)
            assert source['squeeze_size_bb'] == size
            hero = opener if prior is None else caller
            four = squeeze_four_bet_to(hero, squeezer)
            reach = opens[opener] if prior is None else calls[opener, caller]
            history_reachable = any(opens[opener].values()) and any(calls[opener, caller].values())
            # Do not request a fictitious BTN-open profile for SB's zero-
            # frequency cold call. A missing source still raises above.
            table = frequencies(squeezer, opener, prior) if history_reachable else None
            rows = []
            for hand in HANDS:
                call, four_bet = table[hand] if history_reachable and reach[hand] > 0 else (0, 0)
                rows.append({'hand': hand, 'fold': 100 - call - four_bet, 'call': call, 'four_bet': four_bet,
                             'four_bet_size_bb': four if four_bet else None})
            result['spots'].append({
                'id': spot_id(squeezer, opener, caller, prior), 'hero': hero,
                'opener': opener, 'caller': caller, 'squeezer': squeezer, 'prior_action': prior,
                'source_squeeze_id': source['id'], 'open_size_bb': source['open_size_bb'],
                'squeeze_size_bb': size, 'four_bet_size_bb': four, 'effective_stack_bb': 100, 'hands': rows,
                **({'unreachable': True} if not history_reachable else {}),
            })
    return result


if __name__ == '__main__':
    data = build()
    check = """
import fs from 'node:fs';
import { validateSqueezeDataset } from './src/estimated/squeeze-responses.ts';
const read = n => JSON.parse(fs.readFileSync(`${process.env.ESTIMATES_DIR}/${n}.json`, 'utf8'));
validateSqueezeDataset(JSON.parse(fs.readFileSync(0, 'utf8')), read('multiway-responses'), read('preflop-ranges'), read('opening-ranges'));
"""
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT,
                   input=serialized, text=True, check=True)
    (STAGING / 'squeeze-responses.json').write_text(serialized)
    apply_call_policy('squeeze-responses')
    print(f"Generated and validated {data['spot_count']} spots / {data['entry_count']:,} hands")
