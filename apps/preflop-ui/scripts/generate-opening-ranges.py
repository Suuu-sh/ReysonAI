"""Expand authored RFI estimates into persisted JSON. Not a solver."""
import json
import os
import sys
from pathlib import Path

# Writes only into the staging dir from `npm run build:estimates`, which audits before publishing.
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.'))
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sizing_rules import CONFIG, open_size_bb

RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]


def expand(token):
    if '-' not in token:
        assert token in HANDS
        return [token]
    first, last = token.split('-')
    if len(first) == 2:
        assert first[0] == first[1] and last[0] == last[1]
        result = [r+r for r in RANKS[RANKS.index(first[0]):RANKS.index(last[0])+1]]
    else:
        assert first[0] == last[0] and first[2] == last[2]
        result = [first[0]+r+first[2] for r in RANKS[RANKS.index(first[1]):RANKS.index(last[1])+1]]
    assert result and all(h in HANDS for h in result)
    return result


def profile(spec, base=None):
    values = dict(base) if base else dict.fromkeys(HANDS, 0)
    seen = set()
    for line in spec.strip().splitlines():
        frequency, tokens = line.split(':')
        for token in tokens.split():
            for hand in expand(token):
                assert hand not in seen, hand
                seen.add(hand)
                values[hand] = int(frequency)
    return values


P = {}
P['UTG'] = profile('''
100: AA-66 AKs-ATs AKo AQo AJo KQs KJs KTs KQo QJs QTs JTs T9s 98s A5s A4s
75: 55 A9s A8s A3s A2s J9s
50: 44 A7s A6s K9s Q9s 87s 76s 65s KJo
25: 33 22 ATo QJo T8s 97s 54s
''')
P['HJ'] = profile('''
100: 55 44 A9s-A2s K9s Q9s J9s 87s 76s 65s KJo ATo QJo
75: 33 22 T8s 97s 54s K8s Q8s
50: K7s J8s 86s 75s KTo QTo JTo
25: A9o K6s Q7s T7s 96s 64s
''', P['UTG'])
P['CO'] = profile('''
100: 33 22 T8s 97s 54s K8s K7s Q8s J8s 86s 75s KTo QTo JTo A9o
50: K9o Q9o J9o
25: K6s-K2s Q7s J7s T7s 96s 64s A8o Q6s Q5s 85s 74s 53s
0: Q4s Q3s Q2s J6s T6s 95s 84s 63s 43s A6o A4o A3o A2o K8o
''', P['HJ'])
P['BTN'] = profile('''
100: AA-22 AKs-A2s AKo-A9o KQs-K7s KQo KJo KTo QJs-Q8s QJo QTo JTs-J8s JTo T9s T8s 98s 97s 87s 86s 76s 75s 65s 54s
75: A8o-A2o K9o Q9o J9o T9o K6s-K2s Q7s Q6s J7s T7s 64s 53s
50: K8o Q8o J8o T8o 98o Q5s Q4s J6s T6s 96s 85s 74s 63s 43s
25: K7o Q7o J7o 97o 87o Q3s Q2s J5s-J2s T5s-T2s 95s 94s 84s 73s 52s 42s 32s
''')
SB_RAISE = profile('''
80: AA KK AKs
90: QQ-66 AQs-A6s AKo-A6o KQs-KTs KQo-KTo QJs-QTs JTs
65: K9s K9o-K8o QJo-QTo J9s T9s JTo A5o-A3o
50: A5s-A2s K8s Q9s Q9o-Q8o J9o-J8o T9o K7o-K6o
50: 55 K7s-K5s Q8s Q7s J8s J7s T8s T7s 98s 97s 87s 86s 76s 75s 65s 64s 54s
25: K5o-K2o Q7o-Q2o T7o-T2o T8o A2o
''')

# 2026-09-24: Protect limps with premium traps (AA/KK/AKs 20%, other value
# hands 10%). Middle suited/connected hands split raise/limp rather than reveal
# strength through their action; wheel aces retain blocker raises. Preserve
# the prior participation/fold frequencies and calibrate aggregate widths only,
# never copy a solver's hand-level chart. Weak suited hands mainly limp/fold.
SB_LIMP = profile('''
20: AA KK AKs
10: QQ-66 AQs-A6s AKo-A6o KQs-KTs KQo-KTo QJs-QTs JTs K9o-K8o QJo-QTo JTo
35: K9s J9s T9s A5o-A3o
50: 55 K7s-K5s Q8s Q7s J8s J7s T8s T7s 98s 97s 87s 86s 76s 75s 65s 64s 54s
100: Q6s Q5s J6s J5s T6s T5s 53s 43s 42s 32s
75: 44-22 K4s-K2s Q4s-Q2s J4s-J2s T4s-T2s
50: A5s-A2s A2o K8s Q9s
''')
P['SB'] = (SB_RAISE, SB_LIMP)


def main():
    data = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': 100,
            'open_size_bb': CONFIG['sizing']['open_sizes_bb'][0], 'scope': 'Heroまで全員フォールドした未オープンポットでのraise-first-in。',
            'source_of_truth': 'ユーザーが指定したUTG / HJ / CO / BTN / SBのオープンレンジ追加。SBだけconfigに指定した3.5BB、他は2.5BB。',
            'method': 'ハンドクラスごとに手作業で設計した一般知識による概算。ソルバー・EV計算なし。',
            'sb_policy': 'SBはfold / 1BB limp / 3.5BB raise。AA・KK・AKsなどの強い手もリンプへ混ぜてキャップを防ぎ、中位はレイズとリンプを混合。弱い手は主にリンプかフォールドとし、A5s等のブロッカー付きレイズも残す独立推定。',
            'rake': {'rate': CONFIG['rake']['rate'], 'cap_bb': CONFIG['rake']['cap_bb'], 'no_flop_no_drop': CONFIG['rake']['no_flop_no_drop'], 'calibrated': True},
            'ante_bb': 0, 'ante_note': 'アンティなし（ユーザー確認済み）。',
            'frequency_semantics': '当該ハンドを持った場合の条件付き割合(%)。SBはopen + limp + fold = 100、他ポジションはopen + fold = 100。',
            'open_size_semantics': 'そのストリートの合計投入額(raise-to)。open=0ならnull。',
            'relationship_to_response_data': '対オープン推定と同じゲーム条件ですが、両者を同時に均衡計算したものではありません。',
            'warning': '学習・試作向けの推定値。最適性や利益、境界ハンドの正確な頻度は未検証。',
            'reference_note': '参考資料はRFIの一般概念の確認のみ。チャートや頻度は転用していません。',
            'references': [{'title': 'Upswing Poker: Preflop RFI Strategy', 'url': 'https://upswingpoker.com/preflop-open-strategy-rfi-explained/'}],
        },
        'spot_count': 5, 'hand_classes_per_spot': 169, 'entry_count': 845,
        'spots': [],
    }
    for position, frequencies in P.items():
        size = open_size_bb(position)
        if position == 'SB':
            raises, limps = frequencies
            rows = [{'hand': h, 'open': raises[h], 'limp': limps[h],
                     'fold': 100-raises[h]-limps[h],
                     'open_size_bb': size if raises[h] else None,
                     'limp_size_bb': CONFIG['sizing']['limp']['sb_complete_to_bb'] if limps[h] else None}
                    for h in HANDS]
        else:
            rows = [{'hand': h, 'open': frequencies[h], 'fold': 100-frequencies[h],
                     'open_size_bb': size if frequencies[h] else None} for h in HANDS]
        if position == 'SB':
            assert all(row['open'] + row['limp'] <= 100 for row in rows)
        data['spots'].append({'id': f'{position}_open', 'hero': position, 'open_size_bb': size,
                              'effective_stack_bb': 100, 'hands': rows})
        weighted_raise = sum((6 if len(h) == 2 else 4 if h.endswith('s') else 12)*row['open'] for h, row in zip(HANDS, rows))/1326
        weighted_limp = sum((6 if len(h) == 2 else 4 if h.endswith('s') else 12)*row.get('limp', 0) for h, row in zip(HANDS, rows))/1326
        print(f'{position}: {weighted_raise:.2f}% raise / {weighted_limp:.2f}% limp nominal combo-weighted')
    output = STAGING/'opening-ranges.json'
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    main()
