import type { Drill, PracticeSession, DrillDrafts, SessionRow, TrainerSpot } from "./types.ts";
import { PlayingCard } from "../components/PlayingCard.tsx";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ClockCounterClockwise, Play } from "@phosphor-icons/react";
import { RESULT_LABELS, spotById, spotTitle } from "./trainer-data.ts";
import { displayDrillName } from "./drill-store.ts";
import { practiceSessionRows } from "./practice-sessions.ts";
import { localized, localeTag } from "../locale.ts";
import "./sessions.css";

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
  if (session.drillId === "ranked") return localized("Ranked match", "ランク戦");
  return displayDrillName({ id: session.drillId, name: session.name });
}

function SessionDetail({ session, onBack, onResume }: { session: SessionRow; onBack: () => void; onResume: (session: SessionRow) => void }) {
  const hasHistory = Array.isArray(session.hands);
  return <div className="sessions-detail">
    <button type="button" className="config-edit sessions-back" onClick={onBack}><ArrowLeft size={14} />{localized("Sessions", "セッション一覧")}</button>
    <header className="sessions-detail-head">
      <div><span className="sessions-eyebrow">{session.status === "draft" ? "途中保存" : "完了した練習"}</span>
        <h1 translate="no">{displaySessionName(session)}</h1><p>{dateLabel(session.at)} · Cash · 6max · 100bb</p></div>
      {session.status === "draft" && <button type="button" className="mode-primary sessions-resume" onClick={() => onResume(session)}><Play size={14} weight="fill" />{localized("Resume", "続きから")}</button>}
    </header>
    <dl className="trainer-pulse sessions-summary">
      <div><dt>回答数</dt><dd>{session.answered}<small>{localized(session.answered === 1 ? " question" : " questions", "問")}</small></dd></div>
      <div><dt>正答率</dt><dd>{rateLabel(session.score, session.answered)}</dd></div>
      <div><dt>練習時間</dt><dd>{durationLabel(session.durationMs)}</dd></div>
    </dl>
    <section className="sessions-history" aria-label="ハンド履歴">
      <div className="sessions-history-head"><div><h2>ハンド履歴</h2><p>各問題で選んだアクションと、そのときの判定を表示します。</p></div><span>{hasHistory ? session.hands!.length : 0} {localized((hasHistory ? session.hands!.length : 0) === 1 ? "hand" : "hands", "ハンド")}</span></div>
      {!hasHistory ? <p className="sessions-empty">この過去のセッションは回答ごとの履歴を保存していません。正答率と回答数のみ確認できます。</p>
        : !session.hands!.length ? <p className="sessions-empty">まだ回答がありません。練習を再開すると、回答したハンドがここに記録されます。</p>
        : <div className="sessions-table-scroll"><table className="leaderboard-table sessions-table hand-table"><thead><tr>
          <th scope="col">#</th><th scope="col">{localized("Spot", "局面")}</th><th scope="col">ハンド</th><th scope="col">{localized("Choice", "選択")}</th><th scope="col">判定</th><th scope="col">最多アクション</th>
        </tr></thead><tbody>{session.hands!.map((hand, index) => {
          const spot = spotById.get(hand.spotId);
          const chosenFrequency = hand.mix?.[hand.action];
          const bestFrequency = hand.mix?.[hand.best!];
          return <tr key={index}>
            <td className="sessions-index">{index + 1}</td>
            <td>{spot ? spotTitle(spot) : hand.spotId}</td>
            <td><div className="sessions-hand"><strong>{hand.hand}</strong><Cards cards={hand.cards!} /></div></td>
            <td><strong>{actionLabel(spot, hand.action)}</strong>{Number.isFinite(chosenFrequency) && <small>選択頻度 {Math.round(chosenFrequency! * 100)}%</small>}</td>
            <td><span className={`sessions-result result-${hand.result}`}>{RESULT_LABELS[hand.result]}</span></td>
            <td>{hand.best ? actionLabel(spot, hand.best) : "—"}{Number.isFinite(bestFrequency) && <small>{Math.round(bestFrequency! * 100)}%</small>}</td>
          </tr>;
        })}</tbody></table></div>}
    </section>
  </div>;
}

export function SessionPage({ drills, reviews, drafts, onResume }: { drills: Drill[]; reviews: PracticeSession[]; drafts: DrillDrafts; onResume: (session: SessionRow) => void }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const sessions = useMemo(() => practiceSessionRows(drills, reviews, drafts), [drills, reviews, drafts]);
  const selected = sessions.find(session => session.key === selectedKey);
  if (selected) return <SessionDetail session={selected} onBack={() => setSelectedKey(null)} onResume={onResume} />;
  const visible = filter === "all" ? sessions : sessions.filter(session => session.status === filter);
  const completed = sessions.filter(session => session.status === "completed");
  const answered = sessions.reduce((sum, session) => sum + session.answered, 0);
  const score = sessions.reduce((sum, session) => sum + session.score, 0);
  const time = sessions.reduce((sum, session) => sum + (Number.isFinite(session.durationMs) ? session.durationMs! : 0), 0);
  return <div className="sessions-page">
    <header className="trainer-home-head sessions-page-head">
      <div><h1 className="trainer-home-eyebrow">SESSIONS</h1>
        <p>途中の練習も完了した練習も、回答したハンドごとに振り返れます。</p></div>
      <dl className="trainer-pulse" aria-label={localized("Session totals", "セッションの合計")}>
        <div><dt>{localized("Sessions", "セッション")}</dt><dd>{sessions.length}<small>{localized("", "件")}</small></dd></div>
        <div><dt>{localized("Completed", "完了")}</dt><dd>{completed.length}<small>{localized("", "件")}</small></dd></div>
        <div><dt>{localized("Accuracy", "正答率")}</dt><dd>{rateLabel(score, answered)}</dd></div>
        <div><dt>{localized("Practice time", "練習時間")}</dt><dd className="is-time">{time ? durationLabel(time) : "—"}</dd></div>
      </dl>
    </header>
    <div className="lb-period sessions-filters" role="group" aria-label="セッションの状態">
      {[["all", "すべて"], ["draft", "途中保存"], ["completed", "完了"]].map(([value, label]) =>
        <button type="button" key={value} className={filter === value ? "on" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {visible.length ? <div className="sessions-table-scroll"><table className="leaderboard-table sessions-table listing-table"><thead><tr>
      <th scope="col">日時</th><th scope="col">形式</th><th scope="col">練習名</th><th scope="col">状態</th><th scope="col">ハンド数</th><th scope="col">正答率</th><th scope="col">練習時間</th><th scope="col"><span className="sr-only">詳細</span></th>
    </tr></thead><tbody>{visible.map(session => <tr key={session.key}>
      <td>{dateLabel(session.at)}</td>
      <td>Cash · 6max</td>
      <td><button type="button" className="sessions-row-link" translate="no" onClick={() => setSelectedKey(session.key)}>{displaySessionName(session)}</button></td>
      <td><span className={`sessions-status ${session.status}`}>{session.status === "draft" ? "途中保存" : "完了"}</span></td>
      <td>{session.answered}</td><td className="sessions-rate">{rateLabel(session.score, session.answered)}</td><td>{durationLabel(session.durationMs)}</td>
      <td><button type="button" className="sessions-open" aria-label={localized(`View hand history for ${displaySessionName(session)}`, `${displaySessionName(session)}のハンド履歴を見る`)} translate="no" onClick={() => setSelectedKey(session.key)}><ArrowRight size={16} /></button></td>
    </tr>)}</tbody></table></div> : <div className="sessions-empty-state"><ClockCounterClockwise size={28} />
      <h2>まだセッションがありません</h2><p>{filter === "all" ? "ドリルで練習を始めると、ここに記録が並びます。" : "この状態のセッションはありません。"}</p></div>}
  </div>;
}
