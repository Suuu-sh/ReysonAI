# ワーカー監視（ローカル・読み取り専用）

既存の範囲ビューアとは別の `http://127.0.0.1:5189` モニター。Node.js 22.18+ が必要。サーバー起動は担当者が明示的に行う。

```sh
node apps/range-dashboard/workers/server.ts
```

ループバック固定の読み取り専用サーバー。既存ビューアや公開トンネルの設定は変更しない。GET `/api/workers` を、前の読み取り完了から約1秒後に再取得する（同時ポーリングなし・4秒でタイムアウト）。生成・停止・再試行・バッチ登録の操作はない。外部アセット・追加依存なし。

表示容量50枠、実際の起動設定、観測した稼働数を区別する。停止したプロセスや失敗・結果不確定の in-flight フラグは実稼働に数えない。プロセス稼働中にジョブ記録が古い場合は、稼働数に「記録値」を併記する（モデル待機中は記録時刻だけでは停止と判断しない）。経過時間は記録値または観測経過であり、モデルの進捗率ではない。失敗した試行数から受理済み応答数を推定しない。API取得失敗時は前回データを保持し、最新状態は未確認と表示する。

全22,100物理フロップのBB初手 / check後BTNは、オフライン集計の時刻・鮮度を別表示。全ツリー完成率、品質・GTO・本番承認を意味しない。ID、PID、ローカルパス、セッション内容、原文エラーは表示しない。

デザインは既存 Range Observatory の dark-neutral tokens を再利用。21st UI build skillに従って既存構造を確認したが、21st CLI・カタログツールは利用不可のため検索・レビューは未実施。コンポーネント取得・有料生成・依存追加は行っていない。375px対応、キーボードフォーカス、状態の文字併記、reduced-motion、データのtextContent描画を使用。

Focused mock UI checks（既存frontendのjsdomを使用、サーバー・生成は起動しない）:

`node --experimental-strip-types --test apps/range-dashboard/workers/app.test.ts`

静的チェックは新UI単体を対象に実施。親担当によりデスクトップ実ブラウザーで、実2並列の応答待ち→完了、および4並列設定の完了記録（実稼働0）を確認済み。375pxはレスポンシブ実装・静的確認のみで、実ブラウザー確認は未実施。

## Public read-only URLs

The separate relay (`node apps/range-dashboard/workers/public-relay.ts`) binds **127.0.0.1:5197 only**. An operator may explicitly start a separate quick tunnel to that port after review. Do not reuse or reconfigure the existing 5188 tunnel. No relay/tunnel is automatically launched. A temporary URL works only while this Mac, the monitor, relay and tunnel remain running; it is not a fixed domain.

Only exact GET `/`, `/app.js`, `/style.css`, `/api/workers` are served. POST/other routes/query paths are rejected. The relay fetches one fixed localhost status endpoint without forwarding caller headers, bodies or URLs. Public JSON is rebuilt from an allowlist, stripping job/batch/campaign IDs, PIDs, local paths, error details, lease/session/provider metadata and arbitrary extra fields. No raw files, journals, generation controls, credentials, CORS or filesystem selector are exposed. Anyone with the public URL may read the sanitized job boards, statuses, timing and aggregate coverage; it is not an authenticated private page. The original 5189 loopback/Host/origin/forwarding guards are unchanged.

Coverage numbers are **locally validated saved artifacts**, not live broker completion counts. Local collection file update time and the referenced broker snapshot time are shown separately; one locally saved artifact may still have an incomplete/uncertain upload. Historical `halted` phase remains a stopped record even if its coordinator exited, never a claim that recovery has started.

If owner metadata has `quarantineJournalSha256`, the reader accepts only a 64-hex original-journal digest and derives the fixed quarantine journal path. The original global journal must still match that digest byte-for-byte. Invalid/missing/mismatched selections yield unknown status, never fallback to another journal. Existing owner start/scope/concurrency and symlink guards remain in force.

The exact hostname `monitor.reysonai.com` is additionally allowlisted for a separately configured named Cloudflare Tunnel. Existing temporary `*.trycloudflare.com` hosts and localhost:5197 remain supported. No wildcard ReysonAI subdomains, alternate ports or lookalike names are accepted. The fixed hostname does not remove the loopback socket, exact GET route, sanitized DTO or original 5189 protections. DNS/named-tunnel setup is a separate operator action; this code change does not publish or provision it. A fixed address still requires this Mac, monitor, relay and tunnel to be running.
