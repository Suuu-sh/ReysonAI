"""Author BB/SB responses to the new SB limp branch; staging-only, not a solver."""
import json
from call_policy import apply_call_policy
import os
import sys
from pathlib import Path

STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit(
    'Run `npm run build:estimates`; generators never write src/estimated directly.'))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sizing_rules import CONFIG, four_bet_to

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


def parse_profile(text, width, default=None):
    if default is None:
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


# BB facing SB's limp-reraise to 10.5BB after its own 3.5BB iso (call%, 4bet%).
# Unlisted hands fold. Rows are conditional on BB having iso-raised; hands the
# iso never raises are fold=100 placeholders. BB is in position (IP EQR); a call
# costs 7BB into a 21BB pot. SB's reraise range (limp x reraise) is strong and
# narrow, so the 4bet to four_bet_to('BB', 'SB') is mostly value with a few
# wheel-ace blockers; AA/KK/AKs keep calls so the call range is not capped.
# The listed calls are candidates: apply_call_policy removes < -0.05bb calls,
# caps [-0.05, +0.05) at 50% and fills >= +0.50bb (no fold left, same margin as
# 3bet pots).
# 2026-09-26 calibration (call-equities, 12,000 samples; SB's reraise range is
# about 9 combos: QQ+/AK plus JJ-55, AQ/AJ, KQs and A5s/A4s): pairs (22 +0.49bb
# up to JJ +4.1bb), A6s+ suited aces, AQo-ATo and KQs-KTs/QJs/QTs clear the fill
# line. A5s (+0.49) and A4s (+0.31) call the rest of their blocker 4bets. KQo is
# only +0.17bb (dominated by AK/AQ/KQs), so it calls 50% as a model-uncertainty
# margin; A3s (+0.02) is a boundary 50%. Offsuit A9o-A2o (non-broadway EQR
# 0.92), KJo/KTo, K9s and the 10% probes are -EV and fold. Value 4bets: AA 50%,
# KK 45%, AKs 40%, QQ/AKo 20%; BB's reach-weighted fold is ~40%, below SB's
# limp-reraise break-even.
BB_VS_RERAISE = parse_profile('''
50 50: AA
55 45: KK
80 20: QQ
60 40: AKs
80 20: AKo
85 15: A5s
90 10: A4s
100 0: JJ-22 AQs-A6s A3s A2s KQs KJs KTs K9s QJs QTs Q6s Q5s AQo-A2o KJo KTo K6o K5o
50 0: KQo
''', 2, default=(0, 0))


def main():
    opening = json.loads((STAGING / 'opening-ranges.json').read_text())
    sb = next(spot for spot in opening['spots'] if spot['hero'] == 'SB')
    sb_limp = {row['hand']: row['limp'] for row in sb['hands']}
    iso_size = CONFIG['sizing']['fixed_raise_to_bb']['iso_vs_limp']
    reraise_size = CONFIG['sizing']['fixed_raise_to_bb']['limp_reraise']
    four_bet_size = four_bet_to('BB', 'SB')
    bb_rows = []
    sb_rows = []
    reraise_rows = []
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

        call, four_bet = BB_VS_RERAISE[hand] if BB_PROFILE[hand][1] > 0 else (0, 0)
        assert call + four_bet <= 100
        reraise_rows.append({'hand': hand, 'fold': 100 - call - four_bet, 'call': call,
                             'four_bet': four_bet,
                             'four_bet_size_bb': four_bet_size if four_bet else None})

    rake = CONFIG['rake']
    data = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': CONFIG['stack_bb'],
            'open_size_bb': CONFIG['sizing']['open_sizes_bb'][0], 'ante_bb': CONFIG['ante_bb'],
            'rake': {'rate': rake['rate'], 'cap_bb': rake['cap_bb'],
                     'no_flop_no_drop': rake['no_flop_no_drop'], 'calibrated': True},
            'legal_actions': {'BB_vs_SB_limp': ['check', 'raise'], 'SB_vs_BB_iso': ['fold', 'call', 'raise'],
                              'BB_vs_SB_limp_reraise': ['fold', 'call', 'four_bet']},
            'scope': 'SBが1BBにリンプした後のBB応答、BBが3.5BBにアイソレイズした後のSB応答、およびSBが10.5BBにリンプ・リレイズした後のBB応答。',
            'method': 'BBはAA等も含む保護されたSBリンプレンジに対する固定シード12,000回の勝率を基に、概ね55%以上をバリュー・アイソ（65〜70%）とし、ポジションがあるため各バリューハンドに30〜35%のチェックを残してチェックレンジを守る。A3s/A2s/A4o-A2o/33/22はブロッカーとペアの混合アイソ、Q6s/Q5s/K6o/K5oは10%のブロッカー・プローブ、残りはチェック。SBは強いリンプをリレイズ／コールへ混ぜ、中位はレイズ以外をコールしてEVマイナスのコールだけを外し、+0.15bb未満の薄いコールは75%に抑える。リンプ頻度0%は到達不能として除外。BBはリンプ・リレイズ（SBのリンプ×リレイズ頻度）に対しIPで7BBを払って21BBのポットに参加するコールをEV（勝率×IPのEQR×raked(pot)−7）で選び、+0.50bb以上はフォールドを残さない。4betはAA・KK・AKs等の一部と少数のホイールAのブロッカーで、AA・KKにもコールを残す。アイソ頻度0%は到達不能として除外。',
            'frequency_semantics': 'BBはcheck+raise=100。SBはリンプ済み条件下でfold+call+raise=100。リンプ・リレイズへのBB応答はアイソ済み条件下でfold+call+four_bet=100（アイソ頻度を再乗算しない）。',
            'sizing_semantics': f'SB complete=1BB、BB iso raise-to=3.5BB、SB limp-reraise-to=10.5BB、BB 4bet-to={four_bet_size:g}BB（頻度0なら行のfour_bet_size_bbはnull）。',
            'unreachable_hands': 'SBのSB_open.limp=0%ハンド、およびBB_vs_SB_limp.raise=0%ハンドのリンプ・リレイズ応答はfold=100の形式的プレースホルダーであり、推奨ではない。',
            'warning': 'AI推定。ソルバー・EV・均衡検証ではなく、指定レーキ環境を仮定した独立推定。',
        },
        'spot_count': 3, 'hand_classes_per_spot': 169, 'entry_count': 507,
        'spots': [
            {'id': 'BB_vs_SB_limp', 'hero': 'BB', 'opponent': 'SB',
             'source_opening_id': 'SB_open', 'open_size_bb': 1.0,
             'effective_stack_bb': CONFIG['stack_bb'], 'raise_size_bb': iso_size, 'hands': bb_rows},
            {'id': 'SB_vs_BB_iso', 'hero': 'SB', 'opponent': 'BB',
             'source_opening_id': 'SB_open', 'source_limp_response_id': 'BB_vs_SB_limp',
             'open_size_bb': 1.0, 'effective_stack_bb': CONFIG['stack_bb'],
             'iso_size_bb': iso_size, 'raise_to_bb': reraise_size, 'hands': sb_rows},
            {'id': 'BB_vs_SB_limp_reraise', 'hero': 'BB', 'opponent': 'SB',
             'source_opening_id': 'SB_open', 'source_limp_response_id': 'BB_vs_SB_limp',
             'source_iso_response_id': 'SB_vs_BB_iso', 'open_size_bb': 1.0,
             'effective_stack_bb': CONFIG['stack_bb'], 'iso_size_bb': iso_size,
             'limp_reraise_size_bb': reraise_size, 'four_bet_size_bb': four_bet_size,
             'hands': reraise_rows},
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
    reraise = next(s['hands'] for s in final['spots'] if s['id'] == 'BB_vs_SB_limp_reraise')
    iso_combos = sum(combo_count(row['hand']) * row['raise'] / 100 for row in bb_rows)
    bb_actions = {action: sum(combo_count(row['hand']) * BB_PROFILE[row['hand']][1] / 100 * row[action] for row in reraise) / iso_combos
                  for action in ('four_bet', 'call', 'fold')}
    print(f'Generated limp responses: BB iso {bb_raise:.2f}% combos; SB vs iso {sb_actions}; BB vs limp-reraise {bb_actions}')


if __name__ == '__main__':
    main()
