"""Sizing functions sourced from configs/cash-6max-100bb.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONFIG = json.loads((ROOT / 'configs/cash-6max-100bb.json').read_text())
SIZING = CONFIG['sizing']
STACK_BB = CONFIG['stack_bb']
RAKE_CONFIG = CONFIG['rake']
POSTFLOP_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN']


def in_position(position, opponent):
    return POSTFLOP_ORDER.index(position) > POSTFLOP_ORDER.index(opponent)


FIXED = SIZING['fixed_raise_to_bb']


def cap_raise_to(size_bb):
    return min(STACK_BB, size_bb)


def rake(pot_bb):
    if pot_bb < 0:
        raise ValueError('pot_bb must be non-negative')
    return min(pot_bb * RAKE_CONFIG['rate'], RAKE_CONFIG['cap_bb'])


def raked(pot_bb):
    return pot_bb - rake(pot_bb)


# Raise-to sizes are fixed BB amounts from the config, not multiples of the previous bet.
def three_bet_to(opener, raiser, caller_count=0):
    side = 'ip' if in_position(raiser, opener) else 'oop'
    if caller_count:
        return cap_raise_to(FIXED['squeeze'][side] + (caller_count - 1) * FIXED['squeeze']['per_additional_caller'])
    return cap_raise_to(FIXED['three_bet'][side])


def four_bet_to(four_bettor, three_bettor):
    return cap_raise_to(FIXED['four_bet']['ip' if in_position(four_bettor, three_bettor) else 'oop'])
