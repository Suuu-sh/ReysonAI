import { ffCopy as t, ffNumber, type FastFoldResult } from "./fastfold-api.ts";

/** Shared presentation only; callers retain ownership of season and server history. */
export function RecentHandsContent({ recent }: { recent: readonly Pick<FastFoldResult, "id" | "netBb">[] }) {
  return <section className="agent-panel"><h3>{t("Recent hands", "最近のハンド", "最近手牌", "Manos recientes")}</h3>{recent.length ? recent.map(item => <p key={item.id}>{item.id} · {ffNumber(item.netBb, true)} bb</p>) : <p>{t("No completed hands yet", "完了したハンドはまだありません", "暂无已完成手牌", "Aún no hay manos terminadas")}</p>}</section>;
}
