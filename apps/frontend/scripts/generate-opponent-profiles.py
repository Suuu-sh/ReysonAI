"""Authored opponent archetypes, not an EV optimizer or equilibrium solution.

Only write build:estimates staging. Frequencies below are conditional decisions;
zero own-action reach is represented by fold=100. Balanced inputs supply only
schema, IDs and fixed geometry, never frequencies, equities or explanations.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
NAMES = ('opening-ranges', 'preflop-ranges', 'three-bet-responses',
         'four-bet-responses', 'five-bet-responses', 'limp-responses', 'limp-deep-responses')
PROFILES = ('nit', 'station', 'lag', 'maniac')
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]
# Ordered, disjoint authored families. The final family covers the remaining
# disconnected offsuit hands; no random-equity ranking determines frequencies.
GROUPS = [
 ('aa', 'AA'), ('kk', 'KK'), ('qq', 'QQ'), ('high_pairs', 'JJ TT'),
 ('middle_pairs', '99 88 77'), ('small_pairs', '66 55 44 33 22'),
 ('ak', 'AKs AKo'), ('aq', 'AQs AQo'), ('strong_suited_aces', 'AJs ATs'),
 ('middle_suited_aces', 'A9s A8s A7s A6s'), ('wheel_aces', 'A5s A4s A3s A2s'),
 ('broadway_aces', 'AJo ATo'), ('middle_offsuit_aces', 'A9o A8o A7o A6o'),
 ('wheel_offsuit_aces', 'A5o A4o A3o A2o'),
 ('suited_broadways', 'KQs KJs KTs QJs QTs JTs'),
 ('offsuit_broadways', 'KQo KJo KTo QJo QTo JTo'),
 ('middle_suited_kings', 'K9s K8s K7s K6s'), ('weak_suited_kings', 'K5s K4s K3s K2s'),
 ('middle_suited_queens', 'Q9s Q8s Q7s Q6s'), ('weak_suited_queens', 'Q5s Q4s Q3s Q2s'),
 ('middle_suited_jacks', 'J9s J8s J7s J6s'), ('weak_suited_jacks', 'J5s J4s J3s J2s'),
 ('suited_connectors', 'T9s 98s 87s 76s 65s 54s 43s 32s'),
 ('suited_gappers', 'T8s 97s 86s 75s 64s 53s 42s T7s 96s 85s 74s 63s 52s'),
 ('weak_suited', 'T6s T5s T4s T3s T2s 95s 94s 93s 92s 84s 83s 82s 73s 72s 62s'),
 ('offsuit_kings', 'K9o K8o K7o K6o K5o K4o K3o K2o'),
 ('offsuit_queens_jacks', 'Q9o Q8o Q7o Q6o Q5o Q4o Q3o Q2o J9o J8o J7o J6o J5o J4o J3o J2o'),
 ('offsuit_connected', 'T9o 98o 87o 76o 65o 54o 43o 32o T8o 97o 86o 75o 64o 53o 42o'),
]
GROUPS.append(('offsuit_rest', ' '.join(h for h in HANDS if h not in ' '.join(v for _, v in GROUPS).split())))
GROUP_FOR = {h: i for i, (_, hs) in enumerate(GROUPS) for h in hs.split()}
assert len(GROUP_FOR) == 169 and sum(len(hs.split()) for _, hs in GROUPS) == 169

# Explicit per-family open percentages. Columns UTG/HJ/CO/BTN/SB. SB limps are
# independently authored below; all other seats have open/fold only.
OPEN = {
 'nit': '''
100 100 100 100 90
100 100 100 100 90
100 100 100 100 90
100 100 100 100 90
60 100 100 100 90
0 15 30 55 25
100 100 100 100 90
100 100 100 100 90
90 100 100 100 90
0 15 35 65 40
15 30 50 70 55
25 50 75 85 90
0 0 5 30 15
0 0 5 20 15
70 100 100 100 90
15 30 55 75 60
0 5 25 55 25
0 0 5 25 5
0 5 15 40 20
0 0 0 10 0
0 0 10 35 15
0 0 0 5 0
15 25 35 55 35
0 5 10 25 15
0 0 0 5 0
0 0 0 15 5
0 0 0 5 0
0 0 0 5 0
0 0 0 0 0
''',
 'station': '''
100 100 100 100 65
100 100 100 100 60
100 100 100 100 60
100 100 100 95 60
100 100 100 95 55
60 100 100 95 45
100 100 100 100 65
100 100 100 100 60
100 100 100 95 55
50 95 100 95 50
80 100 100 95 50
65 100 100 95 65
0 10 35 65 55
0 5 25 55 50
100 100 100 95 60
40 75 95 95 65
20 45 75 95 50
0 15 40 75 40
10 40 70 90 50
0 10 20 50 30
5 35 60 80 45
0 5 10 35 25
55 80 90 95 50
10 30 50 75 35
0 5 10 40 15
0 5 20 50 50
0 0 5 30 30
0 0 5 25 25
0 0 0 5 5
''',
 'lag': '''
100 100 100 100 90
100 100 100 100 90
100 100 100 100 95
100 100 90 90 95
100 100 90 90 90
75 100 90 90 70
100 100 100 100 95
100 100 100 100 95
100 100 90 90 95
80 100 90 90 80
100 100 90 90 90
80 100 90 90 90
10 35 60 85 65
10 30 60 85 65
100 100 90 90 90
60 90 90 90 85
35 70 90 90 70
20 50 70 90 55
25 65 85 90 65
5 25 45 75 40
20 55 75 90 60
0 15 30 65 30
70 90 90 90 75
25 50 70 90 55
5 15 25 60 30
0 15 35 70 50
0 5 15 50 30
0 5 15 40 25
0 0 5 20 10
''',
 'maniac': '''
100 100 100 100 95
100 100 100 100 95
100 100 100 100 95
90 80 75 90 85
90 80 75 90 85
80 80 75 90 80
100 100 100 100 95
100 100 100 100 95
90 80 75 90 85
85 80 75 90 85
90 80 75 90 85
85 80 75 90 85
30 55 75 90 80
30 55 75 90 80
90 80 75 90 85
75 80 75 90 85
55 80 75 90 80
35 65 75 90 70
50 75 75 90 75
20 50 70 90 60
40 70 75 90 75
20 40 60 90 55
75 80 75 90 85
50 70 75 90 70
20 40 60 85 50
15 35 60 90 70
5 20 40 75 45
5 20 40 70 40
0 10 20 55 25
''',
}
OPEN = {p: [list(map(int, line.split())) for line in text.strip().splitlines()] for p, text in OPEN.items()}
# SB limp frequencies by the same 29 families, after the open frequencies.
LIMP = {
 'nit': [10,10,10,10,10,10,10,10,10,10,10,10,5,5,10,10,10,5,10,0,5,0,15,5,0,5,0,0,0],
 'station': [35,40,40,40,45,55,35,40,45,50,50,35,45,50,40,35,50,55,50,55,50,50,50,60,50,45,45,45,30],
 'lag': [10,10,5,5,10,25,5,5,5,15,10,5,15,15,10,10,20,25,20,25,20,25,20,25,25,20,20,20,15],
 'maniac': [5,5,5,5,5,10,5,5,5,5,5,5,10,10,5,5,10,15,10,15,10,15,10,15,20,15,20,20,20],
}
# Open-response profiles at BB versus BTN: (call, 3bet), one pair per family.
# Context tables below explicitly contract calls with seats behind and against
# early opens, and expand aggressive participation in the blind-vs-blind pot.
RESPONSE = {
 'nit': [(10,90),(15,85),(45,45),(65,10),(50,0),(20,0),(25,70),(55,15),(50,5),(20,0),(20,5),(25,0),(5,0),(0,0),(45,5),(20,0),(15,0),(5,0),(10,0),(0,0),(10,0),(0,0),(25,0),(10,0),(0,0),(0,0),(0,0),(0,0),(0,0)],
 'station': [(30, 70), (35, 65), (50, 50), (75, 25), (92, 8), (100, 0), (50, 50), (80, 20), (88, 12), (100, 0), (92, 8), (98, 2), (95, 0), (90, 0), (90, 10), (98, 2), (100, 0), (95, 0), (100, 0), (95, 0), (100, 0), (95, 0), (98, 2), (95, 0), (90, 0), (90, 0), (85, 0), (85, 0), (65, 0)],
 'lag': [(15,85),(20,80),(35,65),(55,45),(70,25),(75,15),(20,80),(50,50),(60,40),(65,30),(40,60),(65,30),(65,20),(60,25),(55,45),(65,25),(65,25),(55,30),(70,20),(60,20),(70,20),(55,15),(65,30),(65,20),(55,10),(55,15),(45,10),(50,10),(25,5)],
 'maniac': [(10,90),(15,85),(25,75),(40,60),(55,45),(65,35),(15,85),(35,65),(45,55),(55,45),(30,70),(55,45),(65,35),(55,45),(45,55),(60,40),(65,35),(60,40),(70,30),(70,30),(70,30),(75,25),(60,40),(70,30),(75,25),(75,25),(75,25),(75,25),(75,20)],
}
# (call multiplier, 3bet multiplier), selected by hero and opener. These are
# authored positional tendencies, not multipliers fitted to EV or a benchmark.
OPEN_CONTEXT = {
 'BB': {'UTG': (.55,.45), 'HJ': (.70,.60), 'CO': (.85,.78), 'BTN': (1,1), 'SB': (.80,.90)},
 'SB': {'UTG': (.14,.55), 'HJ': (.19,.70), 'CO': (.25,1), 'BTN': (.35,1.35)},
 'HJ': {'UTG': (.11,.50)},
 'CO': {'UTG': (.14,.50), 'HJ': (.18,.65)},
 'BTN': {'UTG': (.19,.50), 'HJ': (.25,.68), 'CO': (.30,.82)},
}
# Facing 3bet / 4bet / 5bet: authored (call, raise) or call percentages, again
# ordered by the named hand groups. Frequency does not depend on call EV.
THREE = {
 'nit': [(10,90),(20,80),(65,25),(40,0),(15,0),(0,0),(55,35),(25,0),(15,0),(0,0),(0,0),(0,0),(0,0),(0,0),(20,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(10,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0)],
 'station': [(65,35),(75,25),(90,10),(95,0),(95,0),(85,0),(80,20),(95,0),(95,0),(85,0),(85,0),(80,0),(65,0),(60,0),(95,0),(80,0),(85,0),(75,0),(80,0),(65,0),(80,0),(60,0),(90,0),(80,0),(65,0),(60,0),(45,0),(55,0),(25,0)],
 'lag': [(25,75),(30,70),(60,40),(75,15),(75,5),(65,0),(40,60),(65,25),(70,20),(60,15),(45,35),(60,15),(35,10),(30,15),(75,15),(50,10),(65,10),(40,15),(60,10),(30,10),(60,10),(25,5),(75,10),(55,10),(25,5),(20,5),(10,5),(20,5),(5,0)],
 'maniac': [(10,90),(15,85),(25,75),(45,55),(55,45),(60,35),(20,80),(35,65),(40,60),(45,50),(25,70),(45,50),(50,40),(40,50),(50,50),(50,40),(50,45),(40,50),(55,35),(50,40),(55,35),(50,35),(55,40),(55,35),(50,30),(55,30),(50,25),(55,25),(45,20)],
}
FOUR = {
 'nit': [(10,90),(25,65),(40,10),(10,0),(0,0),(0,0),(35,20),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(5,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0),(0,0)],
 'station': [(65,35),(75,25),(90,10),(95,0),(85,0),(70,0),(80,20),(85,0),(80,0),(65,0),(65,0),(65,0),(40,0),(35,0),(85,0),(60,0),(60,0),(45,0),(55,0),(35,0),(50,0),(30,0),(75,0),(60,0),(35,0),(35,0),(25,0),(35,0),(10,0)],
 'lag': [(25,75),(35,65),(60,40),(65,15),(55,5),(40,0),(45,55),(55,15),(50,10),(35,5),(25,25),(30,5),(10,0),(10,5),(50,10),(20,5),(30,5),(15,10),(25,5),(10,0),(25,5),(5,0),(45,5),(25,5),(5,0),(5,0),(0,0),(5,0),(0,0)],
 'maniac': [(10,90),(15,85),(25,75),(35,65),(45,55),(50,45),(20,80),(35,65),(40,55),(40,50),(25,70),(45,50),(45,40),(35,55),(45,50),(45,40),(45,45),(40,45),(50,35),(40,40),(50,35),(40,35),(50,45),(45,40),(40,35),(45,35),(45,30),(45,30),(40,25)],
}
FIVE = {
 'nit': [100,80,20,0,0,0,30,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
 'station': [100,100,100,95,80,65,100,90,80,60,60,70,40,35,75,50,55,40,45,30,40,25,60,45,25,25,15,25,5],
 'lag': [100,100,100,75,40,20,100,60,30,10,15,25,0,0,30,10,5,0,0,0,0,0,15,5,0,0,0,0,0],
 'maniac': [100,100,100,100,95,85,100,100,95,85,85,90,75,75,95,80,80,70,75,65,70,60,80,70,55,65,50,55,40],
}
ISO = {
 'nit': [90,85,70,45,20,0,80,40,25,0,0,10,0,0,20,5,0,0,0,0,0,0,5,0,0,0,0,0,0],
 'station': [35,30,20,10,5,0,25,10,5,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
 'lag': [85,80,75,65,55,35,85,70,65,50,70,60,35,40,65,50,45,35,40,25,35,20,55,35,15,20,10,15,5],
 'maniac': [95,95,95,90,85,75,95,90,85,75,90,80,65,75,85,75,65,60,60,55,60,50,75,60,45,50,40,45,30],
}
# SB versus the small iso retains more of its limps than versus a 3bet; these
# are explicit authored frequencies (not the normal call-EV fill).
VS_ISO = {
 'nit': [(20,80),(35,60),(60,30),(70,10),(65,0),(40,0),(50,40),(60,10),(55,5),(30,0),(30,0),(35,0),(10,0),(5,0),(60,5),(25,0),(25,0),(10,0),(20,0),(5,0),(20,0),(5,0),(40,0),(20,0),(5,0),(10,0),(5,0),(5,0),(0,0)],
 'station': [(75,25),(80,20),(90,10),(95,5),(100,0),(100,0),(85,15),(95,5),(100,0),(100,0),(100,0),(100,0),(95,0),(95,0),(100,0),(100,0),(100,0),(95,0),(100,0),(95,0),(100,0),(95,0),(100,0),(100,0),(95,0),(95,0),(90,0),(95,0),(75,0)],
 'lag': [(35,65),(40,60),(65,35),(80,20),(85,10),(85,5),(45,55),(70,30),(75,25),(75,20),(55,45),(75,20),(65,15),(60,20),(75,25),(70,15),(75,15),(65,20),(75,10),(60,10),(75,10),(55,10),(80,20),(75,15),(55,10),(50,10),(40,5),(50,10),(25,5)],
 'maniac': [(15,85),(20,80),(30,70),(45,55),(55,45),(65,35),(25,75),(40,60),(45,55),(55,45),(30,70),(55,45),(60,40),(45,55),(50,50),(60,40),(55,45),(50,50),(65,35),(60,40),(65,35),(60,40),(60,40),(65,35),(65,30),(65,35),(65,30),(65,35),(60,30)],
}
DESCRIPTIONS = {
 'nit': ('タイト・パッシブ（NIT）', '参加は狭く、大きなレイズは強い手に偏る。レイズを受けると中位以下は大きく降りる。',
         'Tight-passive (NIT)', 'Enters few pots, makes large raises with strong hands, and frequently folds marginal holdings to aggression.'),
 'station': ('コーリングステーション', '広いレンジをコールで残し、弱いスーテッドや小さいペアも降りにくい。レイズとブラフは少ない。',
             'Calling station', 'Keeps wide calling ranges, including weak suited hands and small pairs, with little raising or bluffing.'),
 'lag': ('ルース・アグレッシブ（LAG）', '広く参加し、バリューとブロッカー・連結性のあるブラフを混ぜて積極的にレイズする。',
         'Loose-aggressive (LAG)', 'Enters wide and raises actively, mixing value with blocker and connected-hand bluffs.'),
 'maniac': ('マニアック', '極端に広く参加し、弱い手でもレイズやオールインを多用する。大きなレイズにも広く継続する。',
            'Maniac', 'Enters very wide, overuses raises and all-ins with weak hands, and continues too widely against large raises.'),
}
SUMMARIES = {
 'opening-ranges': ('席ごとの参加幅とSBのリンプを手札群別に指定する。', 'Authored seat-specific opening widths and a separate SB limp strategy.'),
 'preflop-ranges': ('BB対BTNを基準に、早いオープンと後続席がいるときの参加を抑える。', 'The BB-versus-BTN family mixes contract versus early opens and with seats behind.'),
 'three-bet-responses': ('自分がオープンした手だけで、相手像ごとのコールと4betを使う。', 'Calls and 4bets follow the archetype, conditional on its own opening range.'),
 'four-bet-responses': ('自分の3betレンジの中でコール・100BBオールイン・フォールドを分ける。', 'Calls, 100BB shoves and folds are conditional on the archetype’s own 3bet range.'),
 'five-bet-responses': ('自分が4betした手だけでオールインへのコールを判断する。EVでは頻度を変更しない。', 'Authored calls versus a shove are conditional on its own 4bet; EV never adjusts them.'),
 'limp-responses': ('SBリンプ、BBアイソ、SBリンプレイズを別々の自分の履歴として扱う。', 'SB limps, BB isolation raises and SB limp-reraises retain their distinct own-action histories.'),
 'limp-deep-responses': ('リンプレイズ後の4bet・5betも同じ相手像を保ち、前段の到達を掛け合わせる。', 'Deep limp branches retain the same archetype and multiply its own preceding action reach.'),
}
ACTIONS = {'open','limp','call','fold','check','three_bet','four_bet','all_in','raise'}


def lookup(data, name, sid, hand, action):
    s = next(s for s in data[name]['spots'] if s['id'] == sid)
    return next(r for r in s['hands'] if r['hand'] == hand)[action]


def reach(data, name, spot, hand):
    get = lambda n, s, a: lookup(data, n, s, hand, a) / 100
    if name in ('opening-ranges','preflop-ranges'): return 1
    if name == 'three-bet-responses': return get('opening-ranges', spot['opener']+'_open', 'open')
    if name == 'four-bet-responses': return get('preflop-ranges', spot['source_response_id'], 'three_bet')
    if name == 'five-bet-responses':
        return get('opening-ranges', spot['opener']+'_open', 'open') * get('three-bet-responses', spot['opener']+'_vs_'+spot['five_bettor']+'_three_bet', 'four_bet')
    if spot['id'] == 'BB_vs_SB_limp': return 1
    if spot['id'] == 'SB_vs_BB_iso': return get('opening-ranges','SB_open','limp')
    if spot['id'] == 'BB_vs_SB_limp_reraise': return get('limp-responses','BB_vs_SB_limp','raise')
    if spot['id'] == 'SB_vs_BB_limp_four_bet': return get('opening-ranges','SB_open','limp') * get('limp-responses','SB_vs_BB_iso','raise')
    if spot['id'] == 'BB_vs_SB_limp_five_bet': return get('limp-responses','BB_vs_SB_limp','raise') * get('limp-responses','BB_vs_SB_limp_reraise','four_bet')
    raise ValueError((name, spot['id']))


def frequencies(p, name, spot, g):
    if name == 'opening-ranges':
        row = {'open': OPEN[p][g][['UTG','HJ','CO','BTN','SB'].index(spot['hero'])]}
        if spot['hero'] == 'SB': row['limp'] = LIMP[p][g]
        return {**row, 'fold': 100-sum(row.values())}
    if name == 'preflop-ranges':
        call, bet = RESPONSE[p][g]
        cm, bm = OPEN_CONTEXT[spot['hero']][spot['opener']]
        # Premiums never disappear merely because another seat is still to act.
        if g in (0, 1):
            return {'call': call, 'three_bet': bet, 'fold': 100-call-bet}
        call, bet = round(call*cm), min(100, round(bet*bm))
        # QQ/AK retain their authored continuation against a single open;
        # loose profiles also retain JJ/TT/AQ. The positional raise reduction
        # goes to a flat, not an implausible premium fold. This is an explicit
        # behavioral rule, unrelated to the standard call-EV autofill.
        if g in (2, 6) or (p != 'nit' and g in (3, 7)):
            continuation = sum(RESPONSE[p][g])
            bet = min(bet, continuation)
            call = continuation-bet
        # Preserve the stated passive/aggressive mix when the SB-vs-BTN
        # aggressive context reaches the 100% action simplex.
        if call+bet > 100: call = 100-bet
        return {'call':call, 'three_bet':bet, 'fold':100-call-bet}
    if name == 'five-bet-responses' or spot['id'] == 'BB_vs_SB_limp_five_bet':
        return {'call': FIVE[p][g], 'fold': 100-FIVE[p][g]}
    if spot['id'] == 'BB_vs_SB_limp':
        return {'raise':ISO[p][g], 'check':100-ISO[p][g]}
    if spot['id'] == 'SB_vs_BB_iso': pair, action = VS_ISO[p][g], 'raise'
    elif name == 'three-bet-responses' or spot['id'] == 'BB_vs_SB_limp_reraise': pair, action = THREE[p][g], 'four_bet'
    else: pair, action = FOUR[p][g], 'all_in'
    call, bet = pair
    return {'call':call, action:bet, 'fold':100-call-bet}


def generate(balanced, p):
    output = {}
    for name in NAMES:
        base = balanced[name]
        # Copy geometry/schema only. In particular, never retain standard EV
        # policy claims, opponent equity, or standard reason text.
        md = {k:copy.deepcopy(v) for k,v in base['metadata'].items() if k in (
            'schema_version','strategy_type','game','effective_stack_bb','open_size_bb','ante_bb',
            'positions_in_action_order','legal_actions')}
        md.update(rake={**base['metadata']['rake'], 'calibrated':False},
            opponent_profile=p, role='villain', source_of_truth='scripts/generate-opponent-profiles.py',
            method='Explicit AI-authored hand-family frequencies; no EV gate, autofill or equilibrium claim.',
            frequency_semantics='Conditional percentages at this decision; multiply own preceding action frequencies to obtain reach.',
            unreachable_hands='Zero own-action reach uses fold=100 placeholders, never a recommendation.',
            warning='Behavioural archetype assumption, not measured player statistics, optimal play, or GTO.',
            equity_status='not_computed; null equity/shove metrics must not be presented as zero or reused from standard data.')
        data = {'metadata':md, 'spot_count':base['spot_count'], 'hand_classes_per_spot':169,
                'entry_count':base['entry_count'], 'spots':[]}
        output[name] = data
        for src in base['spots']:
            s = {k:copy.deepcopy(v) for k,v in src.items() if k != 'hands'}
            for k in ('shove_range_combos',):
                if k in s: s[k] = None
            s['hands'] = []
            # Add before rows so previous limp decisions in this dataset resolve.
            data['spots'].append(s)
            for old in src['hands']:
                h = old['hand']; f = frequencies(p,name,s,GROUP_FOR[h])
                if reach(output,name,s,h) == 0: f = {a:100 if a=='fold' else 0 for a in f}
                r = {'hand':h, **f}
                for key in old:
                    if key.endswith('_size_bb'):
                        a = {'open_size_bb':'open','limp_size_bb':'limp','three_bet_size_bb':'three_bet','four_bet_size_bb':'four_bet','all_in_size_bb':'all_in','raise_size_bb':'raise'}[key]
                        size = s.get(key, 1 if a=='limp' else s.get('raise_to_bb'))
                        r[key] = size if f.get(a,0) else None
                    elif key == 'equity_vs_shove_pct': r[key] = None
                assert all(isinstance(x,int) and 0<=x<=100 for x in f.values()) and sum(f.values())==100, (p,name,s['id'],h,f)
                s['hands'].append(r)
    return output


def main():
    dest = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run npm run build:estimates; direct publication is forbidden.')).resolve()
    published = (ROOT/'src/estimated').resolve()
    if dest == published or published in dest.parents: sys.exit('Refusing to write published estimates directly.')
    balanced = {n:json.loads((dest/(n+'.json')).read_text()) for n in NAMES}
    source_hashes = {n:hashlib.sha256((dest/(n+'.json')).read_bytes()).hexdigest() for n in NAMES}
    for p in PROFILES:
        data = generate(balanced,p); out = dest/'profiles'/p/'villain'; out.mkdir(parents=True,exist_ok=True)
        for n, d in data.items(): (out/(n+'.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
        ja, jd, en, ed = DESCRIPTIONS[p]
        meta = {'schema_version':'1.0', 'strategy_type':'ai_estimate_not_gto', 'opponent_profile':p, 'role':'villain',
                'name':{'ja':ja,'en':en}, 'description':{'ja':jd,'en':ed},
                'datasets':{n:{'ja':SUMMARIES[n][0]+' '+jd,'en':SUMMARIES[n][1]+' '+ed} for n in NAMES},
                'author':'Astra', 'generator':'scripts/generate-opponent-profiles.py',
                'frequency_policy':'authored_only_no_call_ev', 'audit_policy':'structural_errors_strength_warnings',
                'balanced_source_sha256':source_hashes}
        (out/'meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
    print('opponent profiles: 4 × 7 datasets; authored frequencies, structural audit pending')

if __name__ == '__main__': main()
