import type { Drill, PracticeSession, DrillDrafts, SessionRow, TrainerSpot } from "./types.ts";
import { PlayingCard } from "../components/PlayingCard.tsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ClockCounterClockwise, Play } from "@phosphor-icons/react";
import { RESULT_LABELS, spotById, spotTitle } from "./trainer-data.ts";
import { displayDrillName } from "./drill-store.ts";
import { practiceSessionRows } from "./practice-sessions.ts";
import { localized, localeTag } from "../locale.ts";
import "./sessions.css";
import { loadAgentHands } from "../agent/agent-stats.ts";
import { loadRankedHistory } from "./ranked-history-api.ts";
import { RANKED_SEASONS, sessionHistoryRows, type HistoryRow, type RankedHistoryPage, type RankedSeason } from "./session-history.ts";
import { ffCopy as t, ffNumber } from "./fastfold-api.ts";

const dateLabel = (at: number) => new Intl.DateTimeFormat(localeTag(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(at);
const rateLabel = (score: number, answered: number) => answered ? `${Math.round(score / answered * 100)}%` : "—";
const durationLabel = (durationMs: number | null) => {
  if (!Number.isFinite(durationMs)) return "—";
  const seconds = Math.floor(durationMs! / 1000);
  return seconds >= 60 ? localized(`${Math.floor(seconds / 60)} min ${seconds % 60} sec`, `${Math.floor(seconds / 60)}分${seconds % 60}秒`) : localized(`${seconds} sec`, `${seconds}秒`);
};

function actionLabel(spot: TrainerSpot | undefined, key: string) {
  return spot?.actions.find(action => action.key === key)?.label ?? key;
}

function Cards({ cards }: { cards: string[] }) {
  return <span className="sessions-cards">{cards.map((card, index) =>
    <PlayingCard key={`${card}-${index}`} card={card} variant="text" />)}</span>;
}

export function displaySessionName(session: SessionRow) {
  if (session.kind === "review") return localized("Review drill", "復習ドリル");
  if (session.drillId === "ranked") return t("Legacy browser practice (unverified)", "旧ブラウザ練習（未認証）", "旧浏览器练习（未验证）", "Práctica anterior del navegador (sin verificar)");
  return displayDrillName({ id: session.drillId, name: session.name });
}

function PracticeDetail({ session, onBack, onResume }: { session: SessionRow; onBack: () => void; onResume: (session: SessionRow) => void }) {
  const hasHistory = Array.isArray(session.hands);
  return <div className="sessions-detail">
    <button type="button" className="config-edit sessions-back" onClick={onBack}><ArrowLeft size={14} />{localized("Sessions", "セッション一覧")}</button>
    <header className="sessions-detail-head">
      <div><span className="sessions-eyebrow">{session.status === "draft" ? t("In progress", "途中保存", "进行中", "En curso") : t("Completed practice", "完了した練習", "已完成练习", "Práctica completada")}</span>
        <h1 translate="no">{displaySessionName(session)}</h1><p>{dateLabel(session.at)} · Cash · 6max · 100bb</p></div>
      {session.status === "draft" && <button type="button" className="mode-primary sessions-resume" onClick={() => onResume(session)}><Play size={14} weight="fill" />{localized("Resume", "続きから")}</button>}
    </header>
    <dl className="trainer-pulse sessions-summary">
      <div><dt>{t("Answers", "回答数", "答案数", "Respuestas")}</dt><dd>{session.answered}<small>{localized(session.answered === 1 ? " question" : " questions", "問")}</small></dd></div>
      <div><dt>{t("Accuracy", "正答率", "正确率", "Precisión")}</dt><dd>{rateLabel(session.score, session.answered)}</dd></div>
      <div><dt>{t("Practice time", "練習時間", "练习时间", "Tiempo")}</dt><dd>{durationLabel(session.durationMs)}</dd></div>
    </dl>
    <section className="sessions-history" aria-label={t("Hand history", "ハンド履歴", "手牌历史", "Historial de manos")}>
      <div className="sessions-history-head"><div><h2>{t("Hand history", "ハンド履歴", "手牌历史", "Historial de manos")}</h2><p>{t("Your recorded action and grade for each question.", "各問題で選んだアクションと、そのときの判定を表示します。", "各题记录的行动与判定。", "Acción y evaluación registradas por pregunta.")}</p></div><span>{hasHistory ? session.hands!.length : 0} {localized((hasHistory ? session.hands!.length : 0) === 1 ? "hand" : "hands", "ハンド")}</span></div>
      {!hasHistory ? <p className="sessions-empty">{t("This old attempt saved only accuracy and answer count, without individual hand history.", "この過去のセッションは回答ごとの履歴を保存していません。正答率と回答数のみ確認できます。", "此旧记录仅保存正确率与题数，无逐手历史。", "Este intento antiguo solo guardó precisión y número de respuestas, sin historial individual.")}</p>
        : !session.hands!.length ? <p className="sessions-empty">{t("No answers yet. Resume practice to record answered hands here.", "まだ回答がありません。練習を再開すると、回答したハンドがここに記録されます。", "暂无答案。继续练习后将在此记录手牌。", "Sin respuestas aún. Reanuda la práctica para registrarlas aquí.")}</p>
        : <div className="sessions-table-scroll"><table className="leaderboard-table sessions-table hand-table"><thead><tr>
          <th scope="col">#</th><th scope="col">{localized("Spot", "局面")}</th><th scope="col">{t("Hand", "ハンド", "手牌", "Mano")}</th><th scope="col">{localized("Choice", "選択")}</th><th scope="col">{t("Grade", "判定", "判定", "Evaluación")}</th><th scope="col">{t("Top action", "最多アクション", "最高频率行动", "Acción más frecuente")}</th>
        </tr></thead><tbody>{session.hands!.map((hand, index) => {
          const spot = spotById.get(hand.spotId);
          const chosenFrequency = hand.mix?.[hand.action];
          const bestFrequency = hand.mix?.[hand.best!];
          return <tr key={index}>
            <td className="sessions-index">{index + 1}</td>
            <td>{spot ? spotTitle(spot) : hand.spotId}</td>
            <td><div className="sessions-hand"><strong>{hand.hand}</strong><Cards cards={hand.cards ?? []} /></div></td>
            <td><strong>{actionLabel(spot, hand.action)}</strong>{Number.isFinite(chosenFrequency) && <small>{t("Choice frequency", "選択頻度", "选择频率", "Frecuencia elegida")} {Math.round(chosenFrequency! * 100)}%</small>}</td>
            <td><span className={`sessions-result result-${hand.result}`}>{RESULT_LABELS[hand.result]}</span></td>
            <td>{hand.best ? actionLabel(spot, hand.best) : "—"}{Number.isFinite(bestFrequency) && <small>{Math.round(bestFrequency! * 100)}%</small>}</td>
          </tr>;
        })}</tbody></table></div>}
    </section>
  </div>;
}

function seasonLabel(season: RankedSeason) {
  return season === "human-fastfold-v1" ? t("Human FastFold", "対人FastFold", "真人FastFold", "FastFold humano")
    : season === "fastfold-v1" ? t("Legacy Agent ranked", "旧Agentランク", "旧Agent排位", "Clasificación Agent anterior")
    : t("Legacy ranked quiz", "旧ランククイズ", "旧排位答题", "Cuestionario clasificado anterior");
}
const modeLabel = (mode: string) => mode === "agent" ? t("Agent matches", "Agent戦", "Agent对战", "Partidas Agent") : mode === "ranked" ? t("Ranked", "ランク戦", "排位", "Clasificado") : t("Drills", "ドリル", "练习", "Ejercicios");
const storedHand = () => t("Saved hand", "保存済みハンド", "已保存手牌", "Mano guardada");
const rowName = (row: HistoryRow) => row.mode === "drills" ? displaySessionName(row.record) : row.mode === "agent" ? `${storedHand()} · ${row.record.tableId}` : seasonLabel(row.season);
const rowStatus = (row: HistoryRow) => row.mode === "agent" ? storedHand() : row.mode === "ranked" && row.season !== "quiz-v1" ? t("Settled hand", "確定ハンド", "已结算手牌", "Mano liquidada") : row.mode === "drills" && row.record.status === "draft" ? t("In progress", "途中保存", "进行中", "En curso") : t("Completed", "完了", "已完成", "Completado");
const rowAccuracy = (row: HistoryRow) => row.mode === "drills" ? rateLabel(row.record.score, row.record.answered) : row.mode === "ranked" && row.season === "quiz-v1" ? `${Math.round(row.record.accuracy! * 100)}%` : "—";
const rowNet = (row: HistoryRow) => row.mode === "agent" ? `${ffNumber(row.record.returnBb, true)} bb` : row.mode === "ranked" && row.season !== "quiz-v1" ? `${ffNumber(row.record.netBb, true)} bb` : "—";

function SavedHandDetail({ row, onBack }: { row: Exclude<HistoryRow, { mode: "drills" }>; onBack: () => void }) {
  const ranked = row.mode === "ranked" ? row.record : null;
  return <div className="sessions-detail">
    <button type="button" className="config-edit sessions-back" onClick={onBack}><ArrowLeft size={14} />{t("Sessions", "セッション一覧", "记录列表", "Sesiones")}</button>
    <header className="sessions-detail-head"><div><span className="sessions-eyebrow">{modeLabel(row.mode)} · {rowStatus(row)}</span><h1>{rowName(row)}</h1><p>{dateLabel(row.at)}</p></div></header>
    <dl className="trainer-pulse sessions-summary">
      <div><dt>{t("Seat", "席", "座位", "Posición")}</dt><dd>{row.mode === "agent" ? row.record.pos : ranked?.hero ?? "—"}</dd></div>
      <div><dt>{t("Net result", "収支", "净收益", "Resultado neto")}</dt><dd>{rowNet(row)}</dd></div>
      {ranked && <div><dt>{t("Rating", "レート", "评分", "Puntuación")}</dt><dd>{ffNumber(ranked.beforeRating)} → {ffNumber(ranked.afterRating)}</dd></div>}
    </dl>
    {row.mode === "agent" ? <>
      <p className="sessions-source-note">{t("These browser records store one hand's result and statistics, without session IDs, cards or action logs. No session grouping or accuracy is reconstructed. Existing data is kept as saved.", "このブラウザの旧記録はハンドごとの収支・指標のみです。セッションID・カード・アクション履歴は保存されていません。セッションや正答率を復元せず、既存データをそのまま保持します。", "浏览器旧记录仅保存每手收益与指标，没有会话ID、牌面或行动日志。不重建会话或正确率，原数据保持不变。", "Estos registros del navegador guardan resultado y estadísticas por mano, sin ID de sesión, cartas ni acciones. No se reconstruyen sesiones ni precisión. Los datos existentes se conservan.")}</p>
      <dl className="sessions-flags">{([ ["VPIP", row.record.vpip], ["PFR", row.record.pfr], ["3bet", row.record.threeBet], [t("Showdown", "ショーダウン", "摊牌", "Showdown"), row.record.showdown] ] as [string, boolean][]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{typeof value !== "boolean" ? "—" : value ? t("Yes", "あり", "是", "Sí") : t("No", "なし", "否", "No")}</dd></div>)}</dl>
    </> : row.season === "quiz-v1" ? <p className="sessions-source-note">{t("Saved ranked quiz summary", "保存済みランククイズ集計", "已保存排位答题摘要", "Resumen guardado del cuestionario")} · {row.record.answered} · {rowAccuracy(row)}. {t("Per-question history is not returned by this history API.", "この履歴APIでは問題ごとの履歴を返していません。", "此历史API不返回逐题日志。", "Esta API no devuelve el historial por pregunta.")}</p> : <section className="sessions-history">
      <h2>{t("Recorded hand", "保存されたハンド", "已保存手牌", "Mano registrada")}</h2>
      <div><Cards cards={ranked?.heroCards ?? []} /> · <Cards cards={ranked?.board ?? []} /></div>
      <p className="sessions-source-note">{t("Server-confirmed personal result. Unknown cards and missing action logs remain unknown. Seasons are kept separate; this record does not imply a saved session.", "サーバーが確定した本人の結果です。不明なカードや未保存のアクションは不明のまま表示します。シーズンは別枠で、保存されたセッションがあるとは解釈しません。", "服务器确认的本人结果。未知牌面及缺失日志保持未知。各赛季分开，此记录不代表已保存会话。", "Resultado personal confirmado por el servidor. Cartas y acciones ausentes siguen desconocidas. Las temporadas se separan; este registro no implica una sesión guardada.")}</p>
      {ranked?.log?.length ? <ol className="sessions-action-log">{ranked.log.map((entry, index) => <li key={index}>{entry.pos} · {entry.street} · {entry.action}</li>)}</ol> : <p>{t("Action log not saved", "アクション履歴なし", "未保存行动日志", "Sin registro de acciones")}</p>}
    </section>}
  </div>;
}

type Props = { drills: Drill[]; reviews: PracticeSession[]; drafts: DrillDrafts; onResume: (session: SessionRow) => void; rankedReady?: boolean; rankedOwner?: string | null };
type PageState = { owner: string; pages: Partial<Record<RankedSeason, RankedHistoryPage>>; busy: Partial<Record<RankedSeason, boolean>>; errors: Partial<Record<RankedSeason, boolean>> };
export function SessionPage({ drills, reviews, drafts, onResume, rankedReady = false, rankedOwner = null }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState("all"), [filter, setFilter] = useState("all"), [limit, setLimit] = useState(50);
  const practice = useMemo(() => practiceSessionRows(drills, reviews, drafts), [drills, reviews, drafts]);
  const [agent] = useState(loadAgentHands);
  const [state, setState] = useState<PageState>({ owner: "", pages: {}, busy: {}, errors: {} });
  const generation = useRef(0);
  const allowed = rankedReady && Boolean(rankedOwner);
  const load = async (season: RankedSeason, cursor: string | null, ticket: number) => {
    setState(s => ({ ...s, busy: { ...s.busy, [season]: true }, errors: { ...s.errors, [season]: false } }));
    try {
      const page = await loadRankedHistory(season, cursor);
      if (generation.current !== ticket) return;
      setState(s => ({ ...s, pages: { ...s.pages, [season]: { ...page, items: cursor ? [...new Map([...(s.pages[season]?.items ?? []), ...page.items].map(item => [item.id, item])).values()] : page.items } }, busy: { ...s.busy, [season]: false } }));
    } catch { if (generation.current === ticket) setState(s => ({ ...s, busy: { ...s.busy, [season]: false }, errors: { ...s.errors, [season]: true } })); }
  };
  useEffect(() => {
    const ticket = ++generation.current;
    setState({ owner: allowed ? rankedOwner! : "", pages: {}, busy: {}, errors: {} });
    setSelectedKey(null);
    if (allowed) for (const season of RANKED_SEASONS) void load(season, null, ticket);
    return () => { generation.current++; };
  }, [allowed, rankedOwner]);
  const current = allowed && state.owner === rankedOwner ? state : null;
  const rows = useMemo(() => sessionHistoryRows(practice, agent, Object.fromEntries(RANKED_SEASONS.map(season => [season, current?.pages[season]?.items ?? []]))), [practice, agent, current]);
  const selected = rows.find(row => row.key === selectedKey);
  if (selected) return selected.mode === "drills" ? <PracticeDetail session={selected.record} onBack={() => setSelectedKey(null)} onResume={onResume} /> : <SavedHandDetail row={selected} onBack={() => setSelectedKey(null)} />;
  const filtered = rows.filter(row => (mode === "all" || row.mode === mode) && (filter === "all" || (row.mode === "drills" && row.record.status === "draft" ? "draft" : "completed") === filter));
  const visible = filtered.slice(0, limit);
  const drillAttempts = practice.filter(row => row.drillId !== "ranked");
  const answered = drillAttempts.reduce((sum, row) => sum + row.answered, 0), score = drillAttempts.reduce((sum, row) => sum + row.score, 0);
  const durationMs = drillAttempts.reduce((sum, row) => sum + (row.durationMs ?? 0), 0);
  return <div className="sessions-page">
    <header className="trainer-home-head sessions-page-head"><div><h1 className="trainer-home-eyebrow">SESSIONS</h1><p>{t("Review ranked results, saved Agent hands, and completed or in-progress drills.", "ランク戦の確定結果、保存済みAgentハンド、途中の練習も完了した練習も振り返れます。", "回顾排位结果、已保存Agent手牌及进行中或已完成的练习。", "Revisa resultados clasificados, manos Agent guardadas y ejercicios completos o en curso.")}</p></div>
      <dl className="trainer-pulse" aria-label={t("Session totals", "セッションの合計", "记录合计", "Totales de sesiones")}>
        <div><dt>{t("Saved drill attempts", "保存済みドリル試行", "已保存练习次数", "Intentos guardados")}</dt><dd>{drillAttempts.length}</dd></div>
        <div><dt>{t("Completed drills", "完了したドリル", "已完成练习", "Ejercicios completados")}</dt><dd>{drillAttempts.filter(row => row.status === "completed").length}</dd></div>
        <div><dt>{t("Drill accuracy", "ドリル正答率", "练习正确率", "Precisión de ejercicios")}</dt><dd>{rateLabel(score, answered)}</dd></div>
        <div><dt>{t("Drill practice time", "ドリル練習時間", "练习时间", "Tiempo de ejercicios")}</dt><dd>{durationLabel(durationMs)}</dd></div>
      </dl>
    </header>
    <div className="lb-period sessions-filters sessions-mode-filters" role="group" aria-label={t("History mode", "履歴のモード", "历史模式", "Modo de historial")}>{["all", "ranked", "agent", "drills"].map(value => <button type="button" key={value} className={mode === value ? "on" : ""} aria-pressed={mode === value} onClick={() => { setMode(value); setLimit(50); }}>{value === "all" ? t("All", "すべて", "全部", "Todos") : modeLabel(value)}</button>)}</div>
    <div className="lb-period sessions-filters" role="group" aria-label={t("History status", "履歴の状態", "历史状态", "Estado del historial")}>{[["all", t("All", "すべて", "全部", "Todos")], ["draft", t("In progress", "途中保存", "进行中", "En curso")], ["completed", t("Completed", "完了", "已完成", "Completado")]].map(([value, label]) => <button type="button" key={value} className={filter === value ? "on" : ""} aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(50); }}>{label}</button>)}</div>
    {(mode === "all" || mode === "ranked") && <div className="sessions-ranked-status">
      {!allowed ? <p role="status">{t("Ranked history needs a verified sign-in and live server connection.", "ランク履歴には認証済みログインとサーバー接続が必要です。", "排位历史需要已验证登录与实时服务器连接。", "El historial clasificado requiere sesión verificada y conexión al servidor.")}</p> : RANKED_SEASONS.map(season => <div key={season}><span>{seasonLabel(season)}</span>{current?.busy[season] ? <span role="status">{t("Loading…", "読み込み中…", "加载中…", "Cargando…")}</span> : current?.errors[season] ? <><span role="alert">{t("History unavailable", "履歴を取得できません", "历史不可用", "Historial no disponible")}</span><button type="button" className="config-edit" onClick={() => void load(season, current.pages[season]?.nextCursor ?? null, generation.current)}>{t("Retry", "再試行", "重试", "Reintentar")}</button></> : <span>{current?.pages[season]?.items.length ?? 0} {t("loaded", "件取得済み", "条已加载", "cargados")}</span>}</div>)}
    </div>}
    {visible.length ? <div className="sessions-table-scroll"><table className="leaderboard-table sessions-table listing-table"><thead><tr>{[t("Date", "日時", "日期", "Fecha"), t("Mode", "モード", "模式", "Modo"), t("Record", "記録", "记录", "Registro"), t("Status", "状態", "状态", "Estado"), t("Hands / questions", "ハンド / 問題数", "手数 / 题数", "Manos / preguntas"), t("Accuracy", "正答率", "正确率", "Precisión"), t("Net result", "収支", "净收益", "Resultado"), t("Practice time", "練習時間", "练习时间", "Tiempo")].map(label => <th key={label}>{label}</th>)}<th><span className="sr-only">{t("Details", "詳細", "详情", "Detalles")}</span></th></tr></thead><tbody>{visible.map(row => <tr key={row.key}>
      <td>{dateLabel(row.at)}</td><td>{modeLabel(row.mode)}</td><td><button type="button" className="sessions-row-link" translate="no" onClick={() => setSelectedKey(row.key)}>{rowName(row)}</button></td><td>{rowStatus(row)}</td>
      <td>{row.mode === "drills" ? row.record.answered : row.mode === "ranked" && row.season === "quiz-v1" ? row.record.answered : 1}</td><td>{rowAccuracy(row)}</td><td>{rowNet(row)}</td><td>{row.mode === "drills" ? durationLabel(row.record.durationMs) : "—"}</td>
      <td><button type="button" className="sessions-open" aria-label={localized(`View hand history for ${rowName(row)}`, `${rowName(row)}のハンド履歴を見る`)} translate="no" onClick={() => setSelectedKey(row.key)}><ArrowRight size={16} /></button></td>
    </tr>)}</tbody></table></div> : <div className="sessions-empty-state"><ClockCounterClockwise size={28} /><h2>{t("No saved records", "保存済み記録はありません", "暂无保存记录", "Sin registros guardados")}</h2><p>{t("Completed hands and drill progress appear here when saved.", "ハンドの完了やドリルの途中保存後に記録が並びます。", "已完成手牌及练习进度保存后在此显示。", "Las manos completadas y el progreso aparecen aquí al guardarse.")}</p></div>}
    {filtered.length > visible.length && <button type="button" className="config-edit" onClick={() => setLimit(value => value + 50)}>{t("Show more saved records", "保存済み記録をさらに表示", "显示更多保存记录", "Mostrar más registros")}</button>}
    {(mode === "all" || mode === "ranked") && RANKED_SEASONS.map(season => current?.pages[season]?.nextCursor && <button type="button" key={season} className="config-edit" disabled={current.busy[season]} onClick={() => { setLimit(value => value + 50); void load(season, current.pages[season]!.nextCursor, generation.current); }}>{seasonLabel(season)} · {t("Load older results", "過去の結果を読み込む", "加载较早结果", "Cargar resultados anteriores")}</button>)}
  </div>;
}
