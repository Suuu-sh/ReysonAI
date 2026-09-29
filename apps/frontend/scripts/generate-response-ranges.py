"""Regenerate open responses from authored mixes, then select calls by EQR/EV.

The source freezes the already-authored post-rake frequencies. No repeated
retention coefficients or changes to existing 3bet frequencies are applied.
"""
import json
import os
import sys
from pathlib import Path
from sizing_rules import CONFIG, open_size_bb, three_bet_to
from call_policy import apply_call_policy

STAGING = Path(os.environ.get('ESTIMATES_DIR') or sys.exit(
    'Run `npm run build:estimates`; generators never write src/estimated directly.'))
SOURCE = Path(__file__).resolve().parent / 'data/response-mixes.json'


def main():
    path = STAGING / 'preflop-ranges.json'
    data = json.loads(path.read_text())
    mixes = json.loads(SOURCE.read_text())['spots']
    rake = CONFIG['rake']
    data['metadata']['rake'] = {**rake, 'calibrated': True}
    data['metadata'].pop('rake_adjustment_version', None)
    data['metadata']['source_of_truth'] = 'scripts/data/response-mixes.jsonの著者配分と共通sizing/rake設定。コール選択はcall-equities.jsonと仮定EQRで再計算。'
    data['metadata']['scope'] = '6-max 100BB、単独オープンへの15応答。SB 3.5BB、他2.5BB。'
    data['metadata']['method'] = '既存の3bet頻度を維持し、固定シード相手レンジ勝率・仮定EQR・レーキ込みポットからコールEVを計算。負のEVのコールをfoldへ移す。ソルバーの均衡解ではない。'
    data['metadata']['warning'] = '独立したAI推定値。EQRは仮定、勝率はモンテカルロ推定。EV・同時均衡を厳密に保証するものではありません。'
    for spot in data['spots']:
        size = three_bet_to(spot['opener'], spot['hero'])
        spot['open_size_bb'] = open_size_bb(spot['opener'])
        spot['three_bet_size_bb'] = size
        authored = {hand: (call, three) for hand, call, three in mixes[spot['id']]}
        for row in spot['hands']:
            call, three = authored[row['hand']]
            row.update(call=call, three_bet=three, fold=100-call-three,
                       three_bet_size_bb=size if three else None)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    apply_call_policy('preflop-ranges')


if __name__ == '__main__':
    main()
