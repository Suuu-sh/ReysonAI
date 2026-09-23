"""Persist independently authored 4bet-response estimates. No solver or chart import.

Run only at authoring time, after the opening and 3bet-response generators.
The saved JSON, not this script, is the UI's source of truth.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'src/estimated'
RANKS = 'AKQJT98765432'
HANDS = [a+b if i == j else a+b+'s' if i < j else b+a+'o'
         for i, a in enumerate(RANKS) for j, b in enumerate(RANKS)]


def profile(spec):
    # Explicit authoring default: all unlisted hands fold, not runtime completion.
    result = dict.fromkeys(HANDS, (0, 0))
    seen = set()
    for line in spec.strip().splitlines():
        frequencies, names = line.split(':')
        call, shove = map(int, frequencies.split())
        assert 0 <= call <= 100 and 0 <= shove <= 100 and call + shove <= 100
        for hand in names.split():
            assert hand in HANDS and hand not in seen
            seen.add(hand)
            result[hand] = call, shove
    return result


# call%, all_in%. Coarse educational assumptions, not equilibrium outputs.
# Early openers are assumed tighter; IP hands retain more call realization.
TIGHT_IP = profile('''
10 90: AA
15 85: KK
50 35: QQ
40 5: JJ
25 0: TT
10 0: 99
35 60: AKs
25 60: AKo
40 5: AQs
20 0: AJs KQs
10 0: ATs QJs JTs
0 5: A5s
''')
TIGHT_OOP = profile('''
5 95: AA
10 90: KK
35 40: QQ
25 5: JJ
10 0: TT
25 65: AKs
15 65: AKo
25 5: AQs
10 0: AJs KQs
0 5: A5s
''')
MID_IP = profile('''
10 90: AA
10 90: KK
40 50: QQ
50 20: JJ
40 5: TT
25 0: 99
10 0: 88
30 70: AKs
25 70: AKo
50 15: AQs
35 5: AJs KQs
20 0: ATs KJs QJs JTs
10 0: T9s 98s
10 5: AQo A5s
0 5: A4s
''')
MID_OOP = profile('''
5 95: AA
10 90: KK
30 55: QQ
35 20: JJ
25 5: TT
10 0: 99
25 75: AKs
15 75: AKo
35 15: AQs
20 5: AJs KQs
10 0: ATs QJs JTs
5 5: AQo A5s
0 5: A4s
''')
LATE_OOP = profile('''
5 95: AA
5 95: KK
25 70: QQ
40 40: JJ
40 20: TT
30 5: 99
20 0: 88
10 0: 77
20 80: AKs
15 85: AKo
45 35: AQs
40 15: AJs
35 10: ATs KQs
25 5: KJs
25 0: QJs JTs
10 0: A9s KTs QTs T9s 98s
15 15: AQo
5 5: AJo
10 10: A5s
5 5: A4s
''')
BLINDS_IP = profile('''
10 90: AA
10 90: KK
20 80: QQ
40 50: JJ
45 30: TT
40 10: 99
30 5: 88
20 0: 77 66
10 0: 55
20 80: AKs
15 85: AKo
40 45: AQs
45 25: AJs
40 15: ATs KQs
35 10: KJs
35 5: QJs JTs
25 0: A9s KTs QTs T9s 98s
15 0: A8s 87s 76s
25 20: AQo
15 10: AJo
5 5: KQo
15 15: A5s
10 10: A4s
''')
# Every matchup is explicitly assigned. No unknown-position fallback.
PROFILES = {
    ('UTG', 'HJ'): TIGHT_IP, ('UTG', 'CO'): TIGHT_IP,
    ('UTG', 'BTN'): TIGHT_IP, ('UTG', 'SB'): TIGHT_OOP,
    ('UTG', 'BB'): TIGHT_OOP,
    ('HJ', 'CO'): TIGHT_IP, ('HJ', 'BTN'): MID_IP,
    ('HJ', 'SB'): TIGHT_OOP, ('HJ', 'BB'): MID_OOP,
    ('CO', 'BTN'): MID_IP, ('CO', 'SB'): MID_OOP,
    ('CO', 'BB'): MID_OOP,
    ('BTN', 'SB'): LATE_OOP, ('BTN', 'BB'): LATE_OOP,
    ('SB', 'BB'): BLINDS_IP,
}


def build():
    responses = json.loads((DATA / 'preflop-ranges.json').read_text())
    previous = json.loads((DATA / 'three-bet-responses.json').read_text())
    result = {
        'metadata': {
            'schema_version': '1.0', 'strategy_type': 'general_knowledge_estimate_not_gto',
            'game': '6max Cash / No-Limit Texas Holdem', 'effective_stack_bb': 100,
            'open_size_bb': 2.5, 'ante_bb': 0,
            'scope': 'オープナー2.5BB → 後続Heroが3bet → オープナーが非オールイン4bet → 元の3bettorであるHeroの応答。他の全員はフォールド。',
            'source_of_truth': '既存preflop-ranges.jsonの3betとthree-bet-responses.jsonの4betサイズを参照。ユーザー確認済みの5betはall_in（合計100BB）のみ。',
            'legal_actions': ['fold', 'call', 'all_in'],
            'method': '独自に手作業で設計したハンド群別・位置別の5%刻みの概算。早いオープナーをタイトと仮定し、IPではコールを多めに配分。刻みは計算精度を意味しない。',
            'rake': {'rate': None, 'cap_bb': None, 'calibrated': False},
            'frequency_semantics': '当該ハンドで既に3betした条件下の割合。fold+call+all_in=100。元の3bet頻度を再乗算しない。',
            'unreachable_hands': '既存3bet頻度0%は対象外。169件形式上fold=100、all_in_size_bb=nullとして理由に明記。推奨ではなくUIでも頻度を非表示。',
            'sizing_semantics': '全サイズは追加額でなく合計投入額。callは4bet額まで。all_inは100BB、頻度0ならall_in_size_bb=null。',
            'tree_policy': '応答アクションはpreflop-treeのensure_four_bet_responseと同じ。サイズは保存JSONを優先し、Solver設定の倍率には置き換えない。',
            'excluded': ['非オールイン5bet', 'コールド4bet', 'スクイーズ・コーラーあり', '5bet後のオープナーの応答'],
            'warning': '推定値。GTO・EV・相手カード除去・局面到達確率・レーキ調整は未計算。前段データとの同時均衡を保証しない。',
            'reference_note': '競合サービスのチャート・頻度は転用していない。既存コードの合法アクションと保存サイズのみを参照。',
        },
        'spot_count': 15, 'hand_classes_per_spot': 169, 'entry_count': 2535, 'spots': [],
    }
    for before in previous['spots']:
        opener, hero = before['opener'], before['three_bettor']
        source = next(s for s in responses['spots'] if s['id'] == before['source_response_id'])
        reachable = {r['hand']: r['three_bet'] > 0 for r in source['hands']}
        rows = []
        for hand in HANDS:
            call, shove = PROFILES[opener, hero][hand]
            if not reachable[hand]:
                call, shove = 0, 0
                reason = f'{hero}の対{opener}の既存3bet頻度が0%のため、この経路では対象外。形式上フォールド100%であり、実際の推奨ではありません。'
            else:
                if shove >= 50:
                    why = '強い部分として5betオールインを中心に配分します'
                elif call >= 35:
                    why = 'ハンドの強さと位置を考慮してコールを残します'
                elif shove > 0 and hand.startswith('A'):
                    why = 'Aブロッカーを持つ境界ハンドとして限定的な5betオールインを混ぜます'
                elif call + shove == 0:
                    why = '4betレンジに対して継続が難しいと見積もりフォールドします'
                else:
                    why = '境界的な強さとして限定的な継続とフォールドを配分します'
                reason = f"{hero}が{source['three_bet_size_bb']}BBに3bet後、{opener}の{before['four_bet_size_bb']}BB 4betを受けた{source['hero_position_vs_opener']}の推定。{why}。相手のカード除去やEVは未計算です。"
            rows.append({'hand': hand, 'fold': 100-call-shove, 'call': call, 'all_in': shove,
                         'all_in_size_bb': 100 if shove else None, 'reason': reason})
        result['spots'].append({
            'id': f'{hero}_vs_{opener}_four_bet', 'opener': opener, 'hero': hero, 'three_bettor': hero,
            'source_response_id': source['id'], 'source_three_bet_response_id': before['id'],
            'hero_position_vs_opener': source['hero_position_vs_opener'],
            'open_size_bb': 2.5, 'effective_stack_bb': 100,
            'three_bet_size_bb': source['three_bet_size_bb'], 'four_bet_size_bb': before['four_bet_size_bb'],
            'all_in_size_bb': 100, 'hands': rows,
        })
    return result


if __name__ == '__main__':
    data = build()
    # Validate with the same cross-reference boundary as the UI BEFORE writing.
    check = """
import fs from 'node:fs';
import {validateFourBetDataset} from './src/estimated/four-bet-responses.js';
const read = n => JSON.parse(fs.readFileSync(`./src/estimated/${n}.json`, 'utf8'));
validateFourBetDataset(JSON.parse(fs.readFileSync(0, 'utf8')), read('preflop-ranges'), read('three-bet-responses'), read('opening-ranges'));
"""
    serialized = json.dumps(data, ensure_ascii=False, indent=2)+'\n'
    subprocess.run(['node', '--input-type=module', '-e', check], cwd=ROOT, input=serialized, text=True, check=True)
    (DATA / 'four-bet-responses.json').write_text(serialized)
    print('Generated and validated 15 spots / 2,535 hands')
