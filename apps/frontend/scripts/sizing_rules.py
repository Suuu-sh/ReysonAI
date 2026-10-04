"""Legacy shared sizing and isolated stage-two continuation sizing."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONFIG = json.loads((ROOT / 'configs/cash-6max-100bb.json').read_text())
CONTINUATION_CONFIG = json.loads((ROOT / 'configs/multiway-preflop-stage2.json').read_text())
SIZING = CONFIG['sizing']
STACK_BB = CONFIG['stack_bb']
RAKE_CONFIG = CONFIG['rake']
POSTFLOP_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN']


def in_position(position, opponent):
    return POSTFLOP_ORDER.index(position) > POSTFLOP_ORDER.index(opponent)


FIXED = SIZING['fixed_raise_to_bb']


def cap_raise_to(size_bb):
    return min(STACK_BB, size_bb)


def open_size_bb(opener):
    if opener not in CONFIG['positions']:
        raise ValueError(f'Invalid opener position: {opener}')
    return SIZING.get('open_sizes_by_position', {}).get(opener, SIZING['open_sizes_bb'][0])


def rake(pot_bb):
    if pot_bb < 0:
        raise ValueError('pot_bb must be non-negative')
    return min(pot_bb * RAKE_CONFIG['rate'], RAKE_CONFIG['cap_bb'])


def raked(pot_bb):
    return pot_bb - rake(pot_bb)


# Raise-to sizes are fixed BB amounts from the config, not multiples of the previous bet.
def three_bet_to(opener, raiser, caller_count=0):
    if opener == 'SB' and caller_count == 0:
        return cap_raise_to(FIXED['three_bet_vs_sb_open'])
    side = 'ip' if in_position(raiser, opener) else 'oop'
    if caller_count:
        return cap_raise_to(FIXED['squeeze'][side] + (caller_count - 1) * FIXED['squeeze']['per_additional_caller'])
    return cap_raise_to(FIXED['three_bet'][side])


def two_caller_squeeze_to(opener, hero):
    """Open plus exactly two calls, using the existing fixed sizing policy."""
    if opener not in CONFIG['positions'] or hero not in CONFIG['positions'] or opener == hero:
        raise ValueError('Invalid two-caller squeeze positions')
    return three_bet_to(opener, hero, caller_count=2)


def two_caller_squeeze_four_bet_to():
    """Approved fixed response size for new two-caller squeeze branches only."""
    return cap_raise_to(CONTINUATION_CONFIG['fixed_raise_to_bb']['four_bet_after_two_caller_squeeze'])


def four_bet_to(four_bettor, three_bettor):
    if four_bettor == 'SB' and three_bettor == 'BB':
        return cap_raise_to(FIXED['four_bet_vs_bb_three_bet_from_sb'])
    return cap_raise_to(FIXED['four_bet']['ip' if in_position(four_bettor, three_bettor) else 'oop'])


def squeeze_four_bet_to(four_bettor, squeezer):
    # Stage1a: a CO/BTN squeeze to 12BB raises the 2.5BB open by 9.5BB,
    # so the ordinary OOP 20BB 4bet would be below the full-raise minimum.
    # Use the user-approved existing 26BB fixed size for this branch only.
    # Heads-up four_bet_to and the existing blind-squeeze sizes stay unchanged.
    standard = four_bet_to(four_bettor, squeezer)
    return cap_raise_to(FIXED['four_bet']['ip']) if squeezer in ('CO', 'BTN') else standard
