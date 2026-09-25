"""Author BB and SB estimates against a 2.5BB open and one 2.5BB cold caller.

This is an authoring-time, hand-group frequency table, not a solver result.
Only the staging directory used by build-estimates.mjs may be written.
"""
import json
from call_policy import apply_call_policy
import os
import subprocess
import sys
from pathlib import Path

from sizing_rules import three_bet_to

ROOT = Path(__file__).resolve().parents[1]
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sizing_rules import CONFIG
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
# often than weak offsuit hands. Squeezes are value-led; versus UTG/HJ opens the
# add_squeeze_bluffs overlays below add blocker bluffs. Frequencies are our rough estimates.
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

    Historical authoring proposals only; apply_call_policy recomputes selection
    using the current caller range, rake, EQR and exact EV, not a width target:
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
# bands below are authoring baselines, not minimum defense requirements after
# EV selection; neither the opener nor the caller's frequencies are multiplied in.
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

def add_squeeze_bluffs(base, spec):
    """Blocker squeeze bluffs: raise each named hand's squeeze by the given points,
    taken from fold first and only then from the authored call. The EV gate
    still removes negative-EV calls afterwards, so for K6s-K2s the squeeze
    replaces what would otherwise be a fold."""
    result = dict(base)
    seen = set()
    for line in spec.strip().splitlines():
        points, names = line.split(':')
        points = int(points)
        for hand in names.split():
            assert hand in HANDS and hand not in seen, hand
            seen.add(hand)
            call, squeeze = result[hand]
            from_fold = min(points, 100 - call - squeeze)
            call -= points - from_fold
            assert call >= 0, hand
            result[hand] = call, squeeze + points
    return result


# 2026-09-25 review: BB's squeezes of UTG/HJ opens were ~95% value (a third of
# the UTG squeeze was AA/KK), so the opener and caller correctly folded ~70%
# and the squeeze auto-profited. Add blocker bluffs, mostly from hands whose
# flat is thin or negative EV (K8s-K2s, Q9s) plus wheel aces and a few suited
# connectors, still inside BB's heads-up 3bet width. The amounts were tuned so the
# added bluffs are close to break-even against the saved squeeze responses (an
# advisory squeeze-EV estimate: 2:1 value:bluff made them lose ~1-3.6bb because the
# opener and caller then defend much wider; value-only let the squeeze auto-profit).
UTG_BLUFFS = '''
15: A5s A4s K7s K3s
10: A3s A2s K8s
30: K6s
25: K5s
20: K4s
'''
HJ_BLUFFS = '''
20: A5s
15: A4s A3s A2s K5s K6s
10: K7s Q9s K8s JTs J9s T9s
5: 98s
20: K4s
25: K3s K2s
'''
UTG_HJ = add_squeeze_bluffs(UTG_HJ, UTG_BLUFFS)
UTG_CO = add_squeeze_bluffs(UTG_CO, UTG_BLUFFS)
UTG_BTN = add_squeeze_bluffs(UTG_BTN, UTG_BLUFFS)
HJ_CO = add_squeeze_bluffs(HJ_CO, HJ_BLUFFS)
HJ_BTN = add_squeeze_bluffs(HJ_BTN, HJ_BLUFFS)
# CO opens: BB's squeeze was already a little wider, but once the UTG/HJ squeezes
# carry bluffs it would be the most value-heavy per combo and responses would
# continue less against a later opener. Give it at least the HJ bluff set.
CO_BTN = add_squeeze_bluffs(CO_BTN, HJ_BLUFFS)

PROFILES = {
    ('UTG', 'HJ'): UTG_HJ, ('UTG', 'CO'): UTG_CO, ('UTG', 'BTN'): UTG_BTN,
    ('HJ', 'CO'): HJ_CO, ('HJ', 'BTN'): HJ_BTN, ('CO', 'BTN'): CO_BTN,
}


# ---------------------------------------------------------------------------
# SB facing an open plus one cold call (call%, squeeze%), BB still to act.
# SB pays 2BB into 8.5BB, is OOP to everyone, and BB behind can squeeze or
# overcall into a four-way pot. The shared EV gate applies BB_BEHIND_EQR on
# top of the OOP and three-way EQR, so only hands with roughly 36%+ three-way
# equity call profitably: 88+/AK/AQs (vs UTG) widening to 66+/ATs/KQs/KJs/AQo
# (vs CO). Small pairs and suited connectors are negative-EV calls under this
# model and fold. The strategy is squeeze-or-fold first: a value squeeze core
# (QQ+/AK, then JJ/TT/AQs/AJs as the opener moves later) plus A5s–A2s and a
# few Kxs/KQo blocker squeezes. AA/KK/QQ/AKs keep 15–35% calls so the flat is
# never capped, and boundary hands are mixed rather than pure. Every SB
# profile is narrower than the same history's BB profile, and its squeeze is
# narrower than SB's heads-up 3bet versus the same opener.
SB_UTG_HJ = profile('''
20 80: AA KK
30 70: QQ
55 45: JJ
70 25: TT
60 5: 99
40 0: 88
30 70: AKs
50 30: AQs
30 10: AJs
0 35: A5s
0 25: A4s
25 70: AKo
0 10: AQo
0 20: KQs
0 5: KJs
''')

# The CO cold-caller is a little wider than HJ: AJs turns clearly +EV and
# the squeeze adds a little more AQ/blocker weight.
SB_UTG_CO = profile('''
20 80: AA KK
30 70: QQ
55 45: JJ
70 25: TT
65 5: 99
45 0: 88
30 70: AKs
50 35: AQs
45 10: AJs
0 40: A5s
0 25: A4s
25 70: AKo
0 15: AQo
0 20: KQs
0 5: KJs
''')

# BTN's flat is the widest and weakest of the UTG histories.
SB_UTG_BTN = profile('''
20 80: AA KK
30 70: QQ
55 45: JJ
70 25: TT
70 5: 99
45 0: 88
30 70: AKs
50 40: AQs
50 15: AJs
0 40: A5s
0 30: A4s
0 10: A3s
25 75: AKo
0 15: AQo
0 25: KQs
0 10: KJs
''')

# Versus HJ the squeeze widens to JJ/TT/AQ with more wheel-ace blockers; TT-77,
# ATs, AQo and KQs become (at least borderline) calls.
SB_HJ_CO = profile('''
15 85: AA KK
25 75: QQ
45 55: JJ
60 35: TT
75 15: 99
60 5: 88
40 0: 77
20 80: AKs
45 50: AQs
55 35: AJs
45 10: ATs
0 45: A5s
0 35: A4s
0 15: A3s
0 5: A2s
25 75: AKo
35 25: AQo
0 5: AJo
40 30: KQs
20 15: KJs
0 10: KTs
''')

SB_HJ_BTN = profile('''
15 85: AA KK
25 75: QQ
45 55: JJ
60 35: TT
75 15: 99
65 5: 88
45 0: 77
20 80: AKs
45 50: AQs
55 35: AJs
50 10: ATs
0 45: A5s
0 35: A4s
0 15: A3s
0 5: A2s
25 75: AKo
40 25: AQo
0 10: AJo
50 30: KQs
20 15: KJs
0 10: KTs
''')

# CO open + BTN call is the widest history: the squeeze keeps most of the
# value range (TT+/AJs+/AQo+) with a larger blocker component, and the flat
# widens to 66+, ATs, AJo and KQs–KTs (boundary hands capped at 50%).
SB_CO_BTN = profile('''
15 85: AA KK
20 80: QQ
35 65: JJ
50 50: TT
65 30: 99
70 15: 88
70 5: 77
45 0: 66
20 80: AKs
35 65: AQs
55 45: AJs
60 25: ATs
0 10: A9s
0 55: A5s
0 45: A4s
0 30: A3s
0 20: A2s
15 85: AKo
45 50: AQo
35 20: AJo
55 45: KQs
55 30: KJs
35 20: KTs
0 5: K9s
0 10: QJs
0 15: KQo
''')

SB_PROFILES = {
    ('UTG', 'HJ'): SB_UTG_HJ, ('UTG', 'CO'): SB_UTG_CO, ('UTG', 'BTN'): SB_UTG_BTN,
    ('HJ', 'CO'): SB_HJ_CO, ('HJ', 'BTN'): SB_HJ_BTN, ('CO', 'BTN'): SB_CO_BTN,
}
HERO_PROFILES = {'BB': PROFILES, 'SB': SB_PROFILES}


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
            'scope': 'オープナー2.5BB→1人が2.5BBコール→間は全員フォールド→BBまたはSBの初回応答（SBの場合は後ろにBBが残る）。BB・SB各6局面のみ。',
            'source_of_truth': '先行するopening-ranges.jsonとpreflop-ranges.jsonを参照。スクイーズ額はconfigs/cash-6max-100bb.jsonの固定サイズ。',
            'legal_actions': ['fold', 'call', 'squeeze'],
            'method': '手札群と位置履歴（BB・SB各6局面）ごとに手作業で設計した整数%のAI概算。安いコールでもOOPの3人ポットを考慮し、スクイーズはバリュー中心。SBは後ろにBBが残るためEQRを追加で割り引き、スクイーズかフォールドを中心にする。',
            'rake': {'rate': CONFIG['rake']['rate'], 'cap_bb': CONFIG['rake']['cap_bb'],
                     'no_flop_no_drop': CONFIG['rake']['no_flop_no_drop'], 'calibrated': True},
            'frequency_semantics': 'その履歴でHero（BBまたはSB）が当該ハンドを持つ条件付き割合。fold+call+squeeze=100。前段のオープン・コール頻度を再乗算しない。',
            'sizing_semantics': 'スクイーズ額は追加額ではなくHeroの合計投入額。頻度0なら行のsqueeze_size_bbはnull。',
            'warning': '独立したAI推定値。レーキ環境を仮定したヒューリスティックで、ソルバー・GTO均衡・EVの厳密計算・カード除去・前段との同時均衡を保証しない。',
            'reference_note': '競合サービスのチャートや頻度は転用していない。',
        },
        'spot_count': 12, 'hand_classes_per_spot': 169,
        'entry_count': 12 * 169, 'spots': [],
    }
    # Order: the six BB spots, then the six SB spots (validator checks it).
    for hero, profiles in HERO_PROFILES.items():
        for (opener, caller), frequencies in profiles.items():
            assert any(s['hero'] == opener for s in opening['spots'])
            assert any(s['opener'] == opener and s['hero'] == caller for s in responses['spots'])
            size = three_bet_to(opener, hero, caller_count=1)
            rows = []
            for hand in HANDS:
                call, squeeze = frequencies[hand]
                rows.append({'hand': hand, 'fold': 100-call-squeeze,
                             'call': call, 'squeeze': squeeze,
                             'squeeze_size_bb': size if squeeze else None})
            result['spots'].append({
                'id': f'{hero}_vs_{opener}_{caller}call', 'opener': opener,
                'callers': [caller], 'hero': hero, 'open_size_bb': 2.5,
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
    apply_call_policy('multiway-responses')
    print(f"Generated and validated {data['spot_count']} spots / {data['entry_count']:,} hands")
