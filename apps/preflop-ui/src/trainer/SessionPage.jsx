import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ClockCounterClockwise, Play } from "@phosphor-icons/react";
import { RESULT_LABELS, spotById, spotTitle } from "./trainer-data.js";
import { practiceSessionRows } from "./practice-sessions.js";
import { localized, productLocale } from "../locale.js";
import "./sessions.css";

const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" };
const dateLabel = at => new Intl.DateTimeFormat(productLocale() === "ja" ? "ja-JP" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(at);
const rateLabel = (score, answered) => answered ? `${Math.round(score / answered * 100)}%` : "—";
const durationLabel = durationMs => {
  if (!Number.isFinite(durationMs)) return "—";
  const seconds = Math.floor(durationMs / 1000);
  return seconds >= 60 ? localized(`${Math.floor(seconds / 60)} min ${seconds % 60} sec`, `${Math.floor(seconds / 60)}分${seconds % 60}秒`) : localized(`${seconds} sec`, `${seconds}秒`);
};

function actionLabel(spot, key) {
  return spot?.actions.find(action => action.key === key)?.label ?? key;
}

function Cards({ cards }) {
  return <span className="sessions-cards">{cards.map((card, index) =>
    <span key={`${card}-${index}`} className={`suit-${card[1]}`}>{card[0]}{SUITS[card[1]] ?? card[1]}</span>)}</span>;
}

function SessionDetail({ session, onBack, onResume }) {
  const hasHistory = Array.isArray(session.hands);
  return <div className="sessions-detail">
    <button type="button" className="sessions-back" onClick={onBack}><ArrowLeft size={16} />セッション一覧</button>
    <header className="sessions-detail-head">
      <div><span className="sessions-eyebrow">{session.status === "draft" ? "途中保存" : "完了した練習"}</span>
        <h1>{session.name}</h1><p>{dateLabel(session.at)} · Cash · 6max · 100bb</p></div>
      {session.status === "draft" && <button type="button" className="sessions-resume" onClick={() => onResume(session)}><Play size={15} weight="fill" />続きから</button>}
    </header>
    <dl className="sessions-summary">
      <div><dt>回答数</dt><dd>{session.answered}<small>{localized(session.answered === 1 ? " question" : " questions", "問")}</small></dd></div>
      <div><dt>正答率</dt><dd>{rateLabel(session.score, session.answered)}</dd></div>
      <div><dt>練習時間</dt><dd>{durationLabel(session.durationMs)}</dd></div>
    </dl>
    <section className="sessions-history" aria-label="ハンド履歴">
      <div className="sessions-history-head"><div><h2>ハンド履歴</h2><p>各問題で選んだアクションと、そのときの判定を表示します。</p></div><span>{hasHistory ? session.hands.length : 0} {localized((hasHistory ? session.hands.length : 0) === 1 ? "hand" : "hands", "ハンド")}</span></div>
      {!hasHistory ? <p className="sessions-empty">この過去のセッションは回答ごとの履歴を保存していません。正答率と回答数のみ確認できます。</p>
        : !session.hands.length ? <p className="sessions-empty">まだ回答がありません。練習を再開すると、回答したハンドがここに記録されます。</p>
        : <div className="sessions-table-scroll"><table className="sessions-table hand-table"><thead><tr>
          <th scope="col">#</th><th scope="col">{localized("Spot", "局面")}</th><th scope="col">ハンド</th><th scope="col">{localized("Choice", "選択")}</th><th scope="col">判定</th><th scope="col">最多アクション</th>
        </tr></thead><tbody>{session.hands.map((hand, index) => {
          const spot = spotById.get(hand.spotId);
          const chosenFrequency = hand.mix?.[hand.action];
          const bestFrequency = hand.mix?.[hand.best];
          return <tr key={index}>
            <td className="sessions-index">{index + 1}</td>
            <td>{spot ? spotTitle(spot) : hand.spotId}</td>
            <td><div className="sessions-hand"><strong>{hand.hand}</strong><Cards cards={hand.cards} /></div></td>
            <td><strong>{actionLabel(spot, hand.action)}</strong>{Number.isFinite(chosenFrequency) && <small>選択頻度 {Math.round(chosenFrequency * 100)}%</small>}</td>
            <td><span className={`sessions-result result-${hand.result}`}>{RESULT_LABELS[hand.result]}</span></td>
            <td>{hand.best ? actionLabel(spot, hand.best) : "—"}{Number.isFinite(bestFrequency) && <small>{Math.round(bestFrequency * 100)}%</small>}</td>
          </tr>;
        })}</tbody></table></div>}
    </section>
  </div>;
}

export function SessionPage({ drills, reviews, drafts, onResume }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const [filter, setFilter] = useState("all");
  const sessions = useMemo(() => practiceSessionRows(drills, reviews, drafts), [drills, reviews, drafts]);
  const selected = sessions.find(session => session.key === selectedKey);
  if (selected) return <SessionDetail session={selected} onBack={() => setSelectedKey(null)} onResume={onResume} />;
  const visible = filter === "all" ? sessions : sessions.filter(session => session.status === filter);
  return <div className="sessions-page">
    <header className="sessions-page-head"><div><span className="sessions-eyebrow"><ClockCounterClockwise size={15} /> PRACTICE ARCHIVE</span>
      <h1>練習セッション</h1><p>途中の練習も完了した練習も、回答したハンドごとに振り返れます。</p></div>
      <span className="sessions-total">{sessions.length}<small>{localized(sessions.length === 1 ? "session" : "sessions", "セッション")}</small></span>
    </header>
    <div className="sessions-filters" role="group" aria-label="セッションの状態">
      {[["all", "すべて"], ["draft", "途中保存"], ["completed", "完了"]].map(([value, label]) =>
        <button type="button" key={value} className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {visible.length ? <div className="sessions-table-scroll"><table className="sessions-table listing-table"><thead><tr>
      <th scope="col">日時</th><th scope="col">形式</th><th scope="col">練習名</th><th scope="col">状態</th><th scope="col">ハンド数</th><th scope="col">正答率</th><th scope="col">練習時間</th><th scope="col"><span className="sr-only">詳細</span></th>
    </tr></thead><tbody>{visible.map(session => <tr key={session.key}>
      <td>{dateLabel(session.at)}</td>
      <td>Cash · 6max</td>
      <td><button type="button" className="sessions-row-link" onClick={() => setSelectedKey(session.key)}>{session.name}</button></td>
      <td><span className={`sessions-status ${session.status}`}>{session.status === "draft" ? "途中保存" : "完了"}</span></td>
      <td>{session.answered}</td><td className="sessions-rate">{rateLabel(session.score, session.answered)}</td><td>{durationLabel(session.durationMs)}</td>
      <td><button type="button" className="sessions-open" aria-label={`${session.name}のハンド履歴を見る`} onClick={() => setSelectedKey(session.key)}><ArrowRight size={16} /></button></td>
    </tr>)}</tbody></table></div> : <div className="sessions-empty-state"><ClockCounterClockwise size={28} />
      <h2>まだセッションがありません</h2><p>{filter === "all" ? "ドリルで練習を始めると、ここに記録が並びます。" : "この状態のセッションはありません。"}</p></div>}
  </div>;
}
