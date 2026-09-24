"""Render AI-written reason templates with computed facts into a lazily loaded reasons file.

Usage: python3 scripts/reasons/render.py <facts.json> <spot_id>
Refuses to write when a reason's wording contradicts the saved frequencies.
"""
import importlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACTION_NAMES = {'three_bet': '3bet', 'call': 'コール', 'fold': 'フォールド'}


def mix_text(row):
    parts = sorted(((row[k], k) for k in ACTION_NAMES if row[k]), reverse=True)
    return '配分は' + '・'.join(f'{ACTION_NAMES[k]} {v}%' for v, k in parts)


# Wording that commits to a frequency pattern -> predicate on the saved row.
CLAIMS = [
    (r'(^|。)フォールドします。|そのためフォールドです|フォールドです。', lambda r: r['fold'] == 100),
    (r'ほとんどフォールド', lambda r: r['fold'] >= 75),
    (r'フォールドが多め|フォールド寄り', lambda r: 50 <= r['fold'] < 100),
    (r'一部はフォールド', lambda r: 0 < r['fold'] < 50),
    (r'ほぼ半々', lambda r: sorted([r['fold'], r['call'], r['three_bet']])[-2] >= 40),
    (r'迷わず3bet|3betします。', lambda r: r['three_bet'] >= 90),
    (r'3betが中心|基本は3bet', lambda r: r['three_bet'] >= 50),
    (r'ほぼコール', lambda r: r['call'] >= 85),
    (r'コールが中心|基本はコール|コールを中心|コール中心|コールします', lambda r: r['call'] >= 50),
]


def check(hand, text, row):
    return [pattern for pattern, ok in CLAIMS if re.search(pattern, text) and not ok(row)]


def main(facts_path, spot_id):
    facts = json.loads(Path(facts_path).read_text())
    module = importlib.import_module(spot_id)
    spot = facts['spot']
    responses = json.loads((ROOT / 'src/estimated/preflop-ranges.json').read_text())
    saved_spot = next(item for item in responses['spots'] if item['id'] == spot_id)
    saved_by_hand = {row['hand']: row for row in saved_spot['hands']}
    opening = json.loads((ROOT / 'src/estimated/opening-ranges.json').read_text())
    open_spot = next(item for item in opening['spots'] if item['hero'] == spot['opener'])
    combo_count = lambda hand: 6 if len(hand) == 2 else 4 if hand.endswith('s') else 12
    opener_range_pct = sum(combo_count(row['hand']) * row['open'] for row in open_spot['hands']) / 1326
    average_blocked_pct = sum(combo_count(row['hand']) * row['blocked_open_pct'] for row in facts['hands']) / 1326
    values = {'need': f"{spot['call_break_even_equity_pct']:.1f}", 'fold3': f"{spot['opener_fold_to_3bet_pct']:.1f}",
              'avgblk': f"{average_blocked_pct:.1f}", 'range': round(opener_range_pct, 1)}
    hands, errors = {}, []
    for row in facts['hands']:
        saved = saved_by_hand[row['hand']]
        text = module.REASONS[row['hand']].format(eq=f"{row['equity_vs_open_pct']:.1f}", cont=f"{row['equity_vs_continue_pct']:.1f}",
                                                  blk=f"{row['blocked_open_pct']:.1f}", mix=mix_text(saved), **values)
        errors += [f"{row['hand']}: 「{p}」が頻度 F{saved['fold']} C{saved['call']} R{saved['three_bet']} と矛盾" for p in check(row['hand'], text, saved)]
        hands[row['hand']] = {'reason': text, 'facts': {k: row[k] for k in ('equity_vs_open_pct', 'equity_vs_continue_pct', 'blocked_open_pct')}}
    if errors:
        sys.exit('理由と頻度の矛盾があるため保存しません:\n' + '\n'.join(errors))
    out = ROOT / 'src/estimated/reasons' / f'{spot_id}.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({
        'spot_id': spot_id,
        'method': 'ハンドごとの勝率（モンテカルロ）・ブロッカー・価格を計算し、その数値を根拠にAIが理由を記述。数値は計算結果から自動で差し込み。',
        'equity_note': '勝率はショウダウンまでの値で、OOPで実際に回収できる勝率はこれより低くなります。',
        'fact_labels': [
            {'key': 'equity_vs_open_pct', 'label': '勝率（対オープン）', 'scope': 'hand'},
            {'key': 'call_break_even_equity_pct', 'label': 'コールに必要な勝率', 'scope': 'spot'},
            {'key': 'equity_vs_continue_pct', 'label': '3bet後に続く相手への勝率', 'scope': 'hand'},
            {'key': 'blocked_open_pct', 'label': '相手レンジのブロック', 'scope': 'hand'},
        ],
        'spot_facts': spot, 'hands': hands,
    }, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(hands)} reasons -> {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main(*sys.argv[1:])
