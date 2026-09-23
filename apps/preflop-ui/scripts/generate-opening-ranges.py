"""Expand authored RFI estimates into persisted JSON. Not a solver."""
import json
import os
import sys
from pathlib import Path

# Writes only into the staging dir from `npm run build:estimates`, which audits before publishing.
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.'))

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
50: K6s-K2s Q7s J7s T7s 96s 64s A8o K9o Q9o J9o
25: Q6s Q5s 85s 74s 53s A7o A5o T9o
0: Q4s Q3s Q2s J6s T6s 95s 84s 63s 43s A6o A4o A3o A2o K8o
''', P['HJ'])
P['BTN'] = profile('''
100: AA-22 AKs-A2s AKo-A9o KQs-K7s KQo KJo KTo QJs-Q8s QJo QTo JTs-J8s JTo T9s T8s 98s 97s 87s 86s 76s 75s 65s 54s
75: A8o-A2o K9o Q9o J9o T9o K6s-K2s Q7s Q6s J7s T7s 64s 53s
50: K8o Q8o J8o T8o 98o Q5s Q4s J6s T6s 96s 85s 74s 63s 43s
25: K7o Q7o J7o 97o 87o Q3s Q2s J5s-J2s T5s-T2s 95s 94s 84s 73s 52s 42s 32s
''')
# Raise-or-fold approximation; do not interpret this as a solved SB limp strategy.
P['SB'] = profile('''
75: A9o KTo QTo JTo
50: A8o-A2o K9o Q9o J9o T9o Q7s Q6s J7s T7s 97s 86s 75s 64s 53s
25: K8o Q8o J8o T8o 98o Q5s Q4s J6s T6s 96s 85s 74s 63s 43s
0: K7o Q7o J7o 97o 87o Q3s Q2s J5s-J2s T5s-T2s 95s 94s 84s 73s 52s 42s 32s
''', P['BTN'])


def reason(hand, position, frequency):
    if frequency == 0:
        return f'{position}では強さやプレイアビリティが十分でないと見積もり、フォールドします。'
    kind = ('ポケットペア' if len(hand) == 2 else
            'Aブロッカーとフラッシュの可能性を持つスーテッドA' if hand[0] == 'A' and hand[-1] == 's' else
            'ブロードウェイ' if hand[1] in 'KQJT' else
            'フラッシュの可能性を持つスーテッドハンド' if hand[-1] == 's' else 'オフスートハンド')
    context = {'UTG': '後ろに5人いるため参加を厳選', 'HJ': '後ろに4人いることを考慮',
               'CO': '早い位置より広く参加', 'BTN': 'ポストフロップの位置の優位性を活用',
               'SB': '相手はBBだけですがOOPになるため、リンプを省いたraise-or-foldに簡略化'}[position]
    action = '2.5BBでオープンします' if frequency == 100 else f'オープン{frequency}%、フォールド{100-frequency}%と推定します'
    return f'{kind}。{context}し、{action}。'


def main():
    data = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': 100,
            'open_size_bb': 2.5, 'scope': 'Heroまで全員フォールドした未オープンポットでのraise-first-in。',
            'source_of_truth': 'ユーザーが指定したUTG / HJ / CO / BTN / SBのオープンレンジ追加。既存の100BB・2.5BB条件を継承。',
            'method': 'ハンドクラスごとに手作業で設計した一般知識による概算。ソルバー・EV計算なし。',
            'sb_policy': 'SBも2.5BBのraise-or-foldに簡略化。リンプ頻度は収録せず、最適なSB戦略とは主張しません。',
            'rake': {'rate': None, 'cap_bb': None, 'calibrated': False},
            'ante_bb': 0, 'ante_note': 'アンティなし（ユーザー確認済み）。',
            'frequency_semantics': '当該ハンドを持った場合の条件付き割合(%)。open + fold = 100。',
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
        rows = [{'hand': h, 'open': frequencies[h], 'fold': 100-frequencies[h],
                 'open_size_bb': 2.5 if frequencies[h] else None,
                 'reason': reason(h, position, frequencies[h])} for h in HANDS]
        data['spots'].append({'id': f'{position}_open', 'hero': position, 'open_size_bb': 2.5,
                              'effective_stack_bb': 100, 'hands': rows})
        weighted = sum((6 if len(h) == 2 else 4 if h.endswith('s') else 12)*frequencies[h] for h in HANDS)/1326
        print(f'{position}: {weighted:.2f}% nominal combo-weighted open')
    output = STAGING/'opening-ranges.json'
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    main()
