"""Assumed EQR, NOT solver output. Replace after solver implementation.

Mirrors src/estimated/eqr.js; parity over all hands/positions is tested.
The first matching category wins, so suited broadways precede suited aces.
"""
from sizing_rules import CONFIG, in_position

EQR = {
    'pair': (1.05, 0.90),
    'suited_connected': (1.10, 0.92),
    'suited_broadway': (1.08, 0.92),
    'suited_ace': (1.05, 0.88),
    'suited_other': (1.00, 0.80),
    'offsuit_broadway': (1.05, 0.85),
    'offsuit_connected': (0.95, 0.75),
    'offsuit_other': (0.92, 0.70),
}
MULTIWAY_EQR = 0.90
# SB calling an open plus a cold call with BB still to act (see eqr.js for the
# rationale): BB squeeze risk ×~0.95, four-way overcalls ×~0.95, plus margin.
BB_BEHIND_EQR = 0.85
# Opener facing a squeeze with the original cold caller still to act (see
# eqr.js): overcalls make a three-way pot, rare back-raises forfeit the call.
CALLER_BEHIND_EQR = 0.90
# Cold call of a 3bet with the original opener (and any later seats) still to
# act (see eqr.js): the uncapped opener can 4bet (forfeiting the call) or
# overcall into a three-way pot; margin for seats behind and a capped flat.
OPENER_BEHIND_EQR = 0.85
RANKS = '23456789TJQKA'


def eqr_category(hand):
    if len(hand) not in (2, 3) or any(c not in RANKS for c in hand[:2]):
        raise ValueError(f'Invalid hand: {hand}')
    a, b = map(RANKS.index, hand[:2])
    if len(hand) == 2:
        if a != b:
            raise ValueError(f'Invalid pair: {hand}')
        return 'pair'
    if a <= b or hand[2] not in 'so':
        raise ValueError(f'Non-canonical hand: {hand}')
    gap, broadway = a - b, b >= RANKS.index('T')
    if hand.endswith('s'):
        if gap <= 2:
            return 'suited_connected'
        if broadway:
            return 'suited_broadway'
        return 'suited_ace' if hand[0] == 'A' else 'suited_other'
    if broadway:
        return 'offsuit_broadway'
    return 'offsuit_connected' if gap <= 1 else 'offsuit_other'


def equity_realization(hand, hero, opponents, all_in=False, bb_behind=False, caller_behind=False, opener_behind=False):
    category = eqr_category(hand)
    seats = [hero, *opponents]
    if len(opponents) not in (1, 2) or len(set(seats)) != len(seats) or any(p not in CONFIG['positions'] for p in seats):
        raise ValueError('EQR requires two or three distinct valid positions')
    if bb_behind and (hero != 'SB' or 'BB' in opponents):
        raise ValueError('BB behind applies only to SB before BB acts')
    if caller_behind and (bb_behind or len(opponents) != 1):
        raise ValueError('Caller behind applies only to a heads-up squeeze response')
    if opener_behind and (bb_behind or caller_behind or len(opponents) != 1):
        raise ValueError('Opener behind applies only to a heads-up cold call of a 3bet')
    if all_in:
        return 1
    ip = all(in_position(hero, opponent) for opponent in opponents)
    return (EQR[category][0 if ip else 1] * (MULTIWAY_EQR if len(opponents) == 2 else 1)
            * (BB_BEHIND_EQR if bb_behind else 1) * (CALLER_BEHIND_EQR if caller_behind else 1)
            * (OPENER_BEHIND_EQR if opener_behind else 1))
