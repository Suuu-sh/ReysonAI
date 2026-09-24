"""Apply explicit rake/position adjustments to the saved open-response estimates.

This is a data transformation, not a solver. It starts from the existing
preflop-ranges.json and changes only BB/SB defenses plus rake metadata.
"""
import json
import os
import sys
from pathlib import Path

STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit(
    'Run `npm run build:estimates`; generators never write src/estimated directly.'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sizing_rules import CONFIG

RANKS = 'AKQJT98765432'
ADJUSTMENT_VERSION = '2026-09-24-rake-v1'

# Call retention per hand class. Weak offsuit holdings are deliberately cut
# hardest; opener-specific factors keep early-position defense tighter. SB's
# raise range is now a value/blocker subset because its playable middle range
# has moved to the limp branch.
CALL_RETENTION = {
    'UTG': {'pair': .90, 'suited_strong': .90, 'suited_weak': .75, 'offsuit_strong': .82, 'offsuit_weak': .35},
    'HJ':  {'pair': .92, 'suited_strong': .92, 'suited_weak': .80, 'offsuit_strong': .86, 'offsuit_weak': .48},
    'CO':  {'pair': .94, 'suited_strong': .94, 'suited_weak': .84, 'offsuit_strong': .90, 'offsuit_weak': .60},
    'BTN': {'pair': .97, 'suited_strong': .97, 'suited_weak': .93, 'offsuit_strong': .96, 'offsuit_weak': .72},
    'SB':  {'pair': .78, 'suited_strong': .82, 'suited_weak': .68, 'offsuit_strong': .78, 'offsuit_weak': .42},
}

# SB remains 3bet-or-fold; rake moves its marginal bluffs out of the 3bet
# branch rather than creating a call branch.
SB_THREE_BET_RETENTION = {
    'UTG': {'pair': .92, 'suited_strong': .90, 'suited_weak': .65, 'offsuit_strong': .80, 'offsuit_weak': .38},
    'HJ':  {'pair': .94, 'suited_strong': .93, 'suited_weak': .72, 'offsuit_strong': .84, 'offsuit_weak': .45},
    'CO':  {'pair': .96, 'suited_strong': .96, 'suited_weak': .80, 'offsuit_strong': .90, 'offsuit_weak': .55},
    'BTN': {'pair': .98, 'suited_strong': .98, 'suited_weak': .90, 'offsuit_strong': .96, 'offsuit_weak': .72},
}

# BB vs the newly narrower SB raise branch gets an additional range-selection
# adjustment to both calls and 3bets; responses to all other openers keep their
# original 3bet mix while marginal calls move to fold.
BB_VS_SB_THREE_BET_RETENTION = {
    'pair': .85, 'suited_strong': .86, 'suited_weak': .60,
    'offsuit_strong': .72, 'offsuit_weak': .38,
}


def category(hand):
    if len(hand) == 2:
        return 'pair'
    high, low = hand[0], hand[1]
    if hand.endswith('s'):
        return 'suited_strong' if high in 'AKQJT' and low in 'AKQJT' or high == 'A' else 'suited_weak'
    broadway = high in 'AKQ' and low in 'AKQJT'
    strong_ace = high == 'A' and low in 'KQJT'
    return 'offsuit_strong' if broadway or strong_ace else 'offsuit_weak'


def round_five(value):
    return max(0, min(100, int(round(value / 5) * 5)))


def adjust(row, opener, hero):
    kind = category(row['hand'])
    call = row['call']
    three_bet = row['three_bet']
    if hero == 'BB':
        call = round_five(call * CALL_RETENTION[opener][kind])
        if opener == 'SB':
            three_bet = round_five(three_bet * BB_VS_SB_THREE_BET_RETENTION[kind])
    elif hero == 'SB':
        if call != 0:
            raise ValueError(f'SB response must remain 3bet-or-fold: {opener} {row["hand"]} call={call}')
        three_bet = round_five(three_bet * SB_THREE_BET_RETENTION[opener][kind])
    else:
        return

    three_bet = min(three_bet, 100 - call)
    row['call'] = call
    row['three_bet'] = three_bet
    row['fold'] = 100 - call - three_bet
    row['three_bet_size_bb'] = row['three_bet_size_bb'] if three_bet else None


def main():
    path = STAGING / 'preflop-ranges.json'
    data = json.loads(path.read_text())
    applied_version = data['metadata'].get('rake_adjustment_version')
    if applied_version not in (None, ADJUSTMENT_VERSION):
        raise ValueError(f'Unsupported existing rake adjustment version: {applied_version}')
    apply_adjustment = applied_version is None
    rake = CONFIG['rake']
    data['metadata']['rake'] = {
        'rate': rake['rate'], 'cap_bb': rake['cap_bb'],
        'no_flop_no_drop': rake['no_flop_no_drop'], 'calibrated': True,
    }
    if apply_adjustment:
        data['metadata']['scope'] += ' BB/SB defense is additionally adjusted for the configured 5% rake, 3BB cap and SB limp strategy.'
        data['metadata']['method'] += ' The 2026-09-24 rake pass reduces marginal calls (especially weak offsuit BB hands) and tightens SB 3bet-or-fold frequencies; this is an explicit heuristic, not equilibrium recalculation.'
        for spot in data['spots']:
            for row in spot['hands']:
                adjust(row, spot['opener'], spot['hero'])
        data['metadata']['rake_adjustment_version'] = ADJUSTMENT_VERSION
    data['metadata']['warning'] = '独立したAI推定値。レーキ環境を仮定した手動調整で、EV・均衡・相手カード除去を厳密に計算したものではありません。'
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(('Adjusted 5 BB and 4 SB response spots; ' if apply_adjustment else 'Reused already adjusted 5 BB and 4 SB spots; ')
          + 'applied configured rake metadata.')


if __name__ == '__main__':
    main()
