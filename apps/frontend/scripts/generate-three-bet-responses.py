"""Persist authored estimates for the opener facing a 3bet. No solving."""
import json
from call_policy import apply_call_policy
import os
import sys
from pathlib import Path
from sizing_rules import CONFIG, four_bet_to, open_size_bb

# Writes only into the staging dir from `npm run build:estimates`, which audits before publishing.
STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit('Run `npm run build:estimates`; generators never write src/estimated directly.'))
ROOT = STAGING
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]


def profile(text, base=None):
    result = dict(base) if base else {h: (0, 0) for h in HANDS}
    seen = set()
    for line in text.strip().splitlines():
        values, names = line.split(':')
        call, four = map(int, values.split())
        assert 0 <= call <= 100 and 0 <= four <= 100 and call+four <= 100
        for hand in names.split():
            assert hand in HANDS and hand not in seen, hand
            seen.add(hand)
            result[hand] = call, four
    return result


# call%, four_bet%; unspecified hands fold. These are pedagogical estimates.
TIGHT_OOP = profile('''
0 100: AA KK
65 35: QQ
85 10: JJ
80 5: TT
60 0: 99
50 0: 88
45 0: 77
40 0: 66
35 0: 55
30 0: 44
25 0: 33
20 0: 22
30 70: AKs
40 60: AKo
75 20: AQs
65 5: AJs
55 5: KQs
40 0: ATs
30 0: KJs QJs JTs
25 0: KTs QTs T9s 98s
10 0: A9s A8s J9s 87s 76s 65s 54s
40 20: AQo
5 5: AJo KQo
10 25: A5s
5 15: A4s
0 5: A3s A2s
''')
MID_OOP = profile('''
40 60: QQ
65 30: JJ
70 15: TT
65 5: 99
55 0: 88
50 0: 77
45 0: 66
40 0: 55
35 0: 44
30 0: 33
25 0: 22
20 80: AKs
25 75: AKo
60 35: AQs
70 15: AJs KQs
60 10: ATs KJs
65 5: QJs JTs
50 0: KTs QTs T9s 98s
30 0: A9s A8s J9s 87s 76s 65s 54s
10 0: A7s A6s K9s Q9s T8s 97s 86s
55 20: AQo
30 10: AJo
15 10: KQo
5 5: ATo KJo QJo
15 35: A5s
10 25: A4s
5 15: A3s A2s
''', TIGHT_OOP)
LOOSE_OOP = profile('''
20 80: QQ
45 50: JJ
60 30: TT
70 15: 99
70 5: 88
60 0: 77
50 0: 66
45 0: 55
40 0: 44
35 0: 33
30 0: 22
10 90: AKs
15 85: AKo
45 55: AQs
65 30: AJs KQs
70 20: ATs KJs
80 10: QJs JTs
75 5: KTs QTs T9s 98s
55 5: A9s A8s J9s 87s 76s 65s 54s
35 0: A7s A6s K9s Q9s T8s 97s 86s
20 0: K8s Q8s J8s 75s 64s
50 35: AQo
40 20: AJo KQo
20 15: ATo KJo QJo
10 10: A9o KTo QTo JTo
20 45: A5s
15 35: A4s
10 25: A3s A2s
''', MID_OOP)
TIGHT_IP = profile('''
5 95: AA KK
75 25: QQ
90 10: JJ
85 5: TT
75 0: 99
60 0: 88
45 0: 77
30 0: 66 55
15 0: 44 33 22
40 60: AKs
45 55: AKo
80 15: AQs
80 5: AJs KQs
70 0: ATs KJs QJs JTs
55 0: KTs QTs T9s 98s
35 0: A9s A8s J9s 87s 76s 65s 54s
20 0: A7s A6s K9s Q9s T8s 97s
45 10: AQo
20 5: AJo KQo
5 5: ATo KJo QJo
30 25: A5s
25 15: A4s
20 5: A3s A2s
''', TIGHT_OOP)
MID_IP = profile('''
55 45: QQ
75 25: JJ
80 15: TT
85 5: 99
80 0: 88
70 0: 77
50 0: 66 55
30 0: 44 33 22
30 70: AKs
35 65: AKo
70 30: AQs
80 15: AJs KQs
85 10: ATs KJs
90 5: QJs JTs
80 0: KTs QTs T9s 98s
60 0: A9s A8s J9s 87s 76s 65s 54s
40 0: A7s A6s K9s Q9s T8s 97s
25 0: K8s Q8s J8s 86s 75s 64s
60 20: AQo
40 10: AJo KQo
20 10: ATo KJo QJo
5 5: A9o KTo QTo JTo
40 35: A5s
35 25: A4s
30 15: A3s A2s
''', TIGHT_IP)
LOOSE_IP = profile('''
30 70: QQ
55 45: JJ
70 30: TT
80 15: 99
90 5: 88
90 0: 77
75 0: 66 55
50 0: 44 33 22
20 80: AKs
25 75: AKo
55 45: AQs
70 30: AJs KQs
80 20: ATs KJs
90 10: QJs JTs
95 5: KTs QTs T9s 98s
85 5: A9s A8s J9s 87s 76s 65s 54s
70 0: A7s A6s K9s Q9s T8s 97s
55 0: K8s Q8s J8s 86s 75s 64s
35 0: K7s K6s Q7s J7s T7s 96s 85s 74s 53s
60 35: AQo
60 20: AJo KQo
45 15: ATo KJo QJo
30 10: A9o KTo QTo JTo
15 5: A8o A7o A6o A5o K9o Q9o J9o T9o 98o
45 45: A5s
45 35: A4s
40 25: A3s A2s
''', MID_IP)

PROFILES = {
    ('UTG', 'HJ'): TIGHT_OOP,
    ('UTG', 'CO'): profile('''
65 0: 99
40 20: AQo
15 25: A5s
''', TIGHT_OOP),
    ('UTG', 'BTN'): profile('''
70 0: 99
55 0: 88
50 0: 77
45 0: 66
40 0: 55
35 0: 44
30 0: 33
25 0: 22
30 0: KTs QTs T9s 98s
15 30: A5s
''', TIGHT_OOP),
    ('UTG', 'SB'): profile('''
70 0: 99
35 0: 88
0 0: 77 66
''', TIGHT_IP),
    ('UTG', 'BB'): profile('''
80 5: TT
70 0: 99
50 0: 88
25 30: A5s
''', TIGHT_IP),
    ('HJ', 'CO'): MID_OOP,
    ('HJ', 'BTN'): profile('''
75 15: TT
70 5: 99
60 0: 88
55 0: 77
50 0: 66
45 0: 55
40 0: 44
35 0: 33
30 0: 22
20 40: A5s
''', MID_OOP),
    ('HJ', 'SB'): profile('''
75 0: 77
70 0: 66
65 0: 55
45 0: 44
40 0: 33
65 5: QJs JTs
60 0: KTs
40 0: QTs
''', MID_IP),
    ('HJ', 'BB'): profile('''
75 15: TT
75 5: 99
70 0: 88
65 0: 77
60 0: 66
45 0: 55
35 40: A5s
''', MID_IP),
    ('CO', 'BTN'): LOOSE_OOP,
    ('CO', 'SB'): profile('''
50 0: 33
40 0: 22
45 55: QQ
65 35: JJ
60 40: AQs
50 30: AQo
''', MID_IP),
    ('CO', 'BB'): profile('''
40 60: QQ
60 40: JJ
70 20: TT
70 10: 99
55 0: 44
50 0: 33
40 0: 22
50 45: AQs
45 35: AQo
''', MID_IP),
    ('BTN', 'SB'): LOOSE_IP,
    ('BTN', 'BB'): profile('''
20 80: QQ
45 55: JJ
60 35: TT
70 20: 99
80 10: 88
65 0: 66 55
40 0: 44 33 22
45 55: AQs
55 40: AQo
40 50: A5s
45 10: KTo
55 5: 98s
''', LOOSE_IP),
    ('SB', 'BB'): profile('''
60 35: JJ
75 20: TT
80 10: 99
85 5: 88
70 0: 77
60 0: 66
45 0: 55
40 0: 44
35 0: 33
30 0: 22
70 25: AJs KQs
80 15: ATs KJs
90 5: QJs
60 5: JTs
80 5: KTs QTs T9s 98s
65 5: A9s A8s J9s 87s 76s 65s 54s
45 0: A7s A6s K9s Q9s T8s 97s 86s
25 0: K8s Q8s J8s 75s 64s
55 30: AQo
50 20: AJo KQo
35 15: ATo KJo QJo
20 10: A9o KTo QTo JTo
5 5: A8o A7o A6o A5o K9o Q9o J9o T9o
25 45: A5s
20 35: A4s
15 25: A3s A2s
''', LOOSE_OOP),
}


# Pair ladders are authored in the profiles above. Until 2026-10-02 the IP spots
# took PAIR_REVISIONS on top of a +0.50bb step fill (pairs just past it jumped to
# 100% next to authored 30-50% neighbours); the fill now ramps (call-ev.ts
# THREE_BET_FILL_RAMP / OOP_THREE_BET_FILL_RAMP), so each profile authors a
# smooth ladder from 22 up instead, and stronger pairs fill gradually with EV.


def main():
    previous = json.loads((ROOT/'preflop-ranges.json').read_text())
    opening = json.loads((ROOT/'opening-ranges.json').read_text())
    opening_by_hero = {s['hero']: {h['hand']: h['open'] for h in s['hands']} for s in opening['spots']}
    result = {'metadata': {
        'schema_version': '1.0', 'strategy_type': 'ai_estimate_not_gto',
        'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': 100, 'open_size_bb': 2.5,
        'scope': 'オープナー別のサイズで単独オープン（通常2.5BB、SBは3.5BB）、後続1人が3bet。他の全員がフォールドし、Heroに戻った局面。',
        'source_of_truth': 'ユーザー確認済みの全15組み合わせと既存preflop-ranges.jsonの3betサイズ。Heroは元のオープナー。',
        'excluded': ['コールド4bet', 'スクイーズ・コーラーあり', '4betを受けた後の応答', '4bet後の相手の行動'],
        'method': '手作業のハンド群別ヒューリスティック。位置と3betサイズに応じて配分。5%刻みは精度を意味しない。',
        'rake': {'rate': CONFIG['rake']['rate'], 'cap_bb': CONFIG['rake']['cap_bb'],
                 'no_flop_no_drop': CONFIG['rake']['no_flop_no_drop'], 'calibrated': True}, 'ante_bb': 0,
        'frequency_semantics': '当該ハンドで既にオープンした条件下の割合。fold+call+four_bet=100。オープン頻度は再乗算しない。',
        'unreachable_hands': '既存RFIでopen=0のクラスはこの経路に到達しない。169件形式のためfold=100とし、理由に対象外と明記。実際の局面での推奨ではない。',
        'sizing_semantics': '3bet・4betとも追加額ではなく合計投入額(raise-to)。four_bet=0ならfour_bet_size_bb=null。',
        'sizing_policy': '保存済みconfigのサイズルールを適用。SB openへの3betは10.5BB（SB openは3.5BB）、他の3betはIP 8BB / OOP 12BB、スクイーズはcaller1人でIP4.5/OOP5にcallerごとに+1、4betはSBがBBの3betに返す場合24BB、他はconfigのIP/OOP固定額。',
        'warning': '推定値。レーキ環境を仮定したヒューリスティックで、EV・GTO均衡・相手のカード除去の厳密計算や既存レンジとの同時均衡を保証しない。',
        'reference_note': '参考資料は位置別サイズの考え方の確認のみ。頻度チャートは転用していない。',
        'references': [{'title': 'Upswing Poker: Preflop Raise Sizes That Win', 'url': 'https://upswingpoker.com/podcast/ep29-pfr-sizing/'}],
    }, 'spot_count': 15, 'hand_classes_per_spot': 169, 'entry_count': 2535, 'spots': []}
    for before in previous['spots']:
        hero, bettor = before['opener'], before['hero']
        ip = before['hero_position_vs_opener'] == 'OOP'
        size = before['three_bet_size_bb']
        four_size = four_bet_to(hero, bettor)
        assert size < four_size < 100
        rows = []
        for hand in HANDS:
            call, four = PROFILES[hero, bettor][hand]
            if opening_by_hero[hero][hand] == 0:
                call, four = 0, 0
            rows.append({'hand': hand, 'fold': 100-call-four, 'call': call, 'four_bet': four,
                         'four_bet_size_bb': four_size if four else None})
        result['spots'].append({'id': f'{hero}_vs_{bettor}_three_bet', 'hero': hero, 'opener': hero,
                                'three_bettor': bettor, 'source_response_id': before['id'],
                                'open_size_bb': open_size_bb(hero), 'three_bet_size_bb': size, 'four_bet_size_bb': four_size,
                                'effective_stack_bb': 100, 'hero_position_vs_three_bettor': 'IP' if ip else 'OOP', 'hands': rows})
    (ROOT/'three-bet-responses.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    apply_call_policy('three-bet-responses')
    print(f"Generated {len(result['spots'])} spots / {sum(len(s['hands']) for s in result['spots'])} hands")


if __name__ == '__main__':
    main()
