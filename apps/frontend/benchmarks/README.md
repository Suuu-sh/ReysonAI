# ベンチマーク履歴

`history.jsonl` に、戦略のバージョンごとに1行ずつ記録する。

```bash
npm run benchmark:record -- --version v1 --note "SB limp を較正"
```

- 参考値（GTO Wizard など）そのものは `.local/benchmarks/` に置き、コミットしない。ここには平均差・最大差・許容外の件数など、参考値を復元できない集計値だけを残す。
- `datasets` は各 JSON の sha256 先頭12桁。`git.dirty` が true のときは、コミットではなくハッシュで版を特定する。
- `open_ev` は `scripts/lib/open-ev-model.mjs` の近似値（ソルバーではない）。版の間の変化を見るためのもので、絶対値は信用しない。
- 記録済みのバージョン名は上書きできない。`--dry-run` で記録せずに確認できる。
