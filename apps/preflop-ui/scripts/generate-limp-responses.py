"""Author BB/SB responses to the new SB limp branch; staging-only, not a solver."""
import json
from call_policy import apply_call_policy
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


# Recalibrated against the protected 2026-09-24 SB limp mix using equity.mjs,
# 12,000 samples, seededRandom(seedFor('BB_vs_SB_limp')), canonical hand order.
# Value iso still starts around 55% equity versus SB's limp range; K8s/Q9s/JTs,
# K9o and QJo stay pure checks (below that threshold, and their families cap
# the bluffs below them at 10%).
# 2026-09-25 balance revision (audit range-capped / over-segregated):
# - BB is in position after checking, so every value iso hand keeps a 30-35%
#   check: AA/KK/QQ/AKs/AKo 30%, JJ-66/AQs-A8s/KQs/KJs/AQo-ATo 35%. This
#   protects the ~84% check range (top-decile share about 4% instead of 0.2%).
# - The former 75% iso tier becomes a 70% iso; A3s/A2s/33 (60% iso), A4o (50%),
#   A3o (40%), A2o/22 (30%) become mixed isos: ace blockers and pairs versus a
#   limp range that folds most of the time to the iso.
# - Q6s/Q5s/K6o/K5o keep their 10% blocker probes. Total iso about 16%.
# This is an equity-grounded authored heuristic, not a solved strategy or a
# claim of postflop EV.
BB_PROFILE = parse_profile('''
30 70: AA KK QQ AKs AKo 55 44 A7s-A4s KTs K9s QJs QTs A9o-A5o KQo-KTo
35 65: JJ-66 AQs-A8s KQs KJs AQo-ATo
40 60: A3s A2s 33
50 50: A4o
60 40: A3o
70 30: A2o 22
90 10: Q6s Q5s K6o K5o
''', 2)

# SB continuation versus BB's 3.5BB iso-raise. Each row is conditional on
# the newly authored limp range; only reachable limp hands receive actions.
# 2026-09-25: the BB iso now carries trap checks with its premiums and more
# A-x/small-pair isos, so SB's call EV rose (A9s +0.60bb, 44 +0.36bb). A
# call entry of 100 means "call the whole non-raise share"; the shared EV gate
# then removes -EV calls. Thin +0.05~0.15bb calls (22, KTs, QJs, A6s) stay at
# 75% because SB is out of position and the EQR is an assumption.
SB_CALL = parse_profile('''
25: AA KK QQ AKs AKo
50: JJ AQs AQo
65: TT AJs AJo KQs
100: 99-33 ATs-A7s A5s-A2s KJs K9s-K5s QTs-Q5s JTs-J5s T9s-T5s ATo-A4o KQo-KTo QJo QTo JTo
75: 22 A6s KTs QJs
50: K4s-K2s Q4s-Q2s J4s-J2s T4s-T2s 98s 97s 87s 86s 76s 75s 65s 64s 54s 53s
40: K9o K8o
25: 43s 42s 32s A3o-A2o
''', 1)
SB_RAISE = parse_profile('''
75: AA KK QQ AKs AKo
50: JJ AQs AQo
35: TT AJs AJo KQs
25: 99-55 ATs KJs A5s A4s
10: A9s-A6s KTs QJs JTs ATo KQo
5: A3s A2s
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
            'method': 'BBはAA等も含む保護されたSBリンプレンジに対する固定シード12,000回の勝率を基に、概ね55%以上をバリュー・アイソ（65〜70%）とし、ポジションがあるため各バリューハンドに30〜35%のチェックを残してチェックレンジを守る。A3s/A2s/A4o-A2o/33/22はブロッカーとペアの混合アイソ、Q6s/Q5s/K6o/K5oは10%のブロッカー・プローブ、残りはチェック。SBは強いリンプをリレイズ／コールへ混ぜ、中位はレイズ以外をコールしてEVマイナスのコールだけを外し、+0.15bb未満の薄いコールは75%に抑える。リンプ頻度0%は到達不能として除外。',
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
    apply_call_policy('limp-responses')
    # Log the final gated mix, not the pre-EV authoring proposal.
    final = json.loads((STAGING / 'limp-responses.json').read_text())
    sb_rows = next(s['hands'] for s in final['spots'] if s['id'] == 'SB_vs_BB_iso')
    bb_raise = sum(combo_count(row['hand']) * row['raise'] for row in bb_rows) / 1326
    limp_combos = sum(combo_count(hand) * sb_limp[hand] / 100 for hand in HANDS)
    sb_actions = {action: sum(combo_count(row['hand']) * sb_limp[row['hand']] / 100 * row[action] for row in sb_rows) / limp_combos
                  for action in ('raise', 'call', 'fold')}
    print(f'Generated limp responses: BB iso {bb_raise:.2f}% combos; SB vs iso {sb_actions}')


if __name__ == '__main__':
    main()
