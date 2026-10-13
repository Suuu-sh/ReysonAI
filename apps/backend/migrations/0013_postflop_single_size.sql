-- AI 推定・GTO ではない、Single Size（1 ボード分類 1 サイズ）方針。
-- publish-d1.mjs が spot 単位で置換。既存の標準データとは独立した追加ストレージ。
CREATE TABLE IF NOT EXISTS postflop_single_policies (
  spot_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('flop', 'later')),
  policy_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  PRIMARY KEY (spot_id, stage)
);
CREATE TABLE IF NOT EXISTS postflop_single_reports (
  spot_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL
);
