"""Author BB/SB responses to the new SB limp branch; staging-only, not a solver."""
import json
import os
import sys
from pathlib import Path

STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit(
    'Run `npm run build:estimates`; generators never write src/estimated directly.'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sizing_rules import CONFIG

RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]


def combo_count(hand):
    return 6 if len(hand) == 2 else 4 if hand.endswith('s') else 12


def expand(token):
    if '-' not in token:
        assert token in HANDS
        return [token]
    first, last = token.split('-')
    if len(first) == 2:
        assert first[0] == first[1] and last[0] == last[1]
        result = [rank + rank for rank in RANKS[RANKS.index(first[0]):RANKS.index(last[0]) + 1]]
    else:
        assert first[0] == last[0] and first[2] == last[2]
        result = [first[0] + rank + first[2] for rank in RANKS[RANKS.index(first[1]):RANKS.index(last[1]) + 1]]
    assert result and all(hand in HANDS for hand in result)
    return result


def parse_profile(text, width):
    default = (100, 0) if width == 2 else tuple(0 for _ in range(width))
    values = {hand: default for hand in HANDS}
    seen = set()
    for line in text.strip().splitlines():
        numbers, token_text = line.split(':')
        frequencies = tuple(map(int, numbers.split()))
        assert len(frequencies) == width and all(0 <= n <= 100 for n in frequencies)
        for token in token_text.split():
            for hand in expand(token):
                assert hand not in seen, hand
                seen.add(hand)
                values[hand] = frequencies
    return values


# BB check/iso-raise frequencies versus a capped SB limp range. Strong value
# hands lead, with a small suited-ace blocker bluff component.
BB_PROFILE = parse_profile('''
0 100: AA KK
25 75: QQ JJ
50 50: TT AKs AKo AQs AQo
75 25: 99 AJs KQs KQo
90 10: 88 AJo KJs QJs A5s A4s
95 5: 77 66 55 ATs KTs QTs JTs
''', 2)

# SB continuation versus BB's 3.5BB iso-raise. Each row is conditional on
# having limped; the value/blocker limp-reraise is deliberately narrow.
SB_CALL = parse_profile('''
100: 88-22 A9s-A2s K9s-K2s Q9s-Q8s AJs KQs KJs QJs ATs KTs QTs JTs AJo KQo
75: KJo QJo JTo ATo-A9o Q7s-Q5s J9s-J6s T9s-T6s 98s 87s 76s 65s 54s
50: A8o-A2o KTo QTo K9o-K8o Q9o J9o T9o 97s 86s 75s 64s 53s 43s 32s
25: K7o-K6o Q8o J8o T8o 98o 87o 76o 65o 54o
''', 1)
SB_RAISE = parse_profile('''
25: 88 A5s A4s
''', 1)


def main():
    opening = json.loads((STAGING / 'opening-ranges.json').read_text())
    sb = next(spot for spot in opening['spots'] if spot['hero'] == 'SB')
    sb_limp = {row['hand']: row['limp'] for row in sb['hands']}
    iso_size = CONFIG['sizing']['fixed_raise_to_bb']['iso_vs_limp']
    reraise_size = CONFIG['sizing']['fixed_raise_to_bb']['limp_reraise']
    bb_rows = []
    sb_rows = []
    for hand in HANDS:
        check, raise_frequency = BB_PROFILE[hand]
        assert check + raise_frequency == 100
        bb_rows.append({'hand': hand, 'check': check, 'raise': raise_frequency,
                        'raise_size_bb': iso_size if raise_frequency else None})

        call = SB_CALL[hand][0]
        raise_frequency = SB_RAISE[hand][0]
        if sb_limp[hand] == 0:
            call, raise_frequency = 0, 0
            fold = 100
        else:
            if call + raise_frequency > 100:
                call = 100 - raise_frequency
            fold = 100 - call - raise_frequency
        sb_rows.append({'hand': hand, 'fold': fold, 'call': call,
                        'raise': raise_frequency,
                        'raise_size_bb': reraise_size if raise_frequency else None})

    rake = CONFIG['rake']
    data = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': CONFIG['stack_bb'],
            'open_size_bb': CONFIG['sizing']['open_sizes_bb'][0], 'ante_bb': CONFIG['ante_bb'],
            'rake': {'rate': rake['rate'], 'cap_bb': rake['cap_bb'],
                     'no_flop_no_drop': rake['no_flop_no_drop'], 'calibrated': True},
            'legal_actions': {'BB_vs_SB_limp': ['check', 'raise'], 'SB_vs_BB_iso': ['fold', 'call', 'raise']},
            'scope': 'SBが1BBにリンプした後のBB応答、およびBBが3.5BBにアイソレイズした後のSB応答。',
            'method': '手作業のハンド群別ヒューリスティック。BBはキャップされたリンプレンジに対してバリュー中心にアイソレイズし、SBはリンプ頻度0%を到達不能として除外。',
            'frequency_semantics': 'BBはcheck+raise=100。SBはリンプ済み条件下でfold+call+raise=100。',
            'sizing_semantics': 'SB complete=1BB、BB iso raise-to=3.5BB、SB limp-reraise-to=10.5BB。',
            'unreachable_hands': 'SBのSB_open.limp=0%ハンドはfold=100の形式的プレースホルダーであり、推奨ではない。',
            'warning': 'AI推定。ソルバー・EV・均衡検証ではなく、指定レーキ環境を仮定した独立推定。',
        },
        'spot_count': 2, 'hand_classes_per_spot': 169, 'entry_count': 338,
        'spots': [
            {'id': 'BB_vs_SB_limp', 'hero': 'BB', 'opponent': 'SB',
             'source_opening_id': 'SB_open', 'open_size_bb': 1.0,
             'effective_stack_bb': CONFIG['stack_bb'], 'raise_size_bb': iso_size, 'hands': bb_rows},
            {'id': 'SB_vs_BB_iso', 'hero': 'SB', 'opponent': 'BB',
             'source_opening_id': 'SB_open', 'source_limp_response_id': 'BB_vs_SB_limp',
             'open_size_bb': 1.0, 'effective_stack_bb': CONFIG['stack_bb'],
             'iso_size_bb': iso_size, 'raise_to_bb': reraise_size, 'hands': sb_rows},
        ],
    }
    (STAGING / 'limp-responses.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    bb_raise = sum(combo_count(row['hand']) * row['raise'] for row in bb_rows) / 1326
    sb_actions = {action: sum(combo_count(row['hand']) * row[action] for row in sb_rows) / 1326
                  for action in ('raise', 'call', 'fold')}
    print(f'Generated limp responses: BB iso {bb_raise:.2f}% combos; SB vs iso {sb_actions}')


if __name__ == '__main__':
    main()
