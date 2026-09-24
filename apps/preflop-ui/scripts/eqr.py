"""Assumed EQR, NOT solver output. Replace after solver implementation.

Mirrors src/estimated/eqr.js; parity over all hands/positions is tested.
The first matching category wins, so suited broadways precede suited aces.
"""
from sizing_rules import CONFIG, in_position

EQR = {
    'pair': (1.00, 0.85),
    'suited_connected': (1.05, 0.90),
    'suited_broadway': (1.05, 0.90),
    'suited_ace': (1.00, 0.85),
    'suited_other': (0.90, 0.75),
    'offsuit_broadway': (0.95, 0.80),
    'offsuit_connected': (0.85, 0.70),
    'offsuit_other': (0.75, 0.60),
}
MULTIWAY_EQR = 0.90
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


def equity_realization(hand, hero, opponents, all_in=False):
    category = eqr_category(hand)
    seats = [hero, *opponents]
    if len(opponents) not in (1, 2) or len(set(seats)) != len(seats) or any(p not in CONFIG['positions'] for p in seats):
        raise ValueError('EQR requires two or three distinct valid positions')
    if all_in:
        return 1
    ip = all(in_position(hero, opponent) for opponent in opponents)
    return EQR[category][0 if ip else 1] * (MULTIWAY_EQR if len(opponents) == 2 else 1)
