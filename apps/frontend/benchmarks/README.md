# ベンチマーク履歴

`history.jsonl` に、戦略のバージョンごとに1行ずつ記録する。

```bash
npm run benchmark:record -- --version v1 --note "SB limp を較正"
```

- 2026-10-03 ユーザー承認: `.local/benchmarks/{UTG,HJ,CO,BTN,SB}_open.json` の5ファイルに限り、既存のオープン全体のアクション頻度をGit管理できる。ハンド別チャートや他局面の外部頻度は含めない。その他の `.local/` キャッシュ・個人データは引き続きGit管理しない。実ファイルの提供と内容確認前に外部ベンチマークを完了扱いしない。
- `history.jsonl` には平均差・最大差・許容外件数などの集計結果を記録する。
- `datasets` は各 JSON の sha256 先頭12桁。`git.dirty` が true のときは、コミットではなくハッシュで版を特定する。
- `open_ev` は `scripts/lib/open-ev-model.mjs` の近似値（ソルバーではない）。版の間の変化を見るためのもので、絶対値は信用しない。
- 記録済みのバージョン名は上書きできない。`--dry-run` で記録せずに確認できる。
