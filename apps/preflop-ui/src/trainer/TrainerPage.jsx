import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ArrowRight, Trash } from "@phosphor-icons/react";
import { Sidebar } from "../components/layout.jsx";
import { Panel, SectionHeading } from "../components/primitives.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { barColor } from "../components/primitives.jsx";
import {
  POSITIONS, RESULT_LABELS, aggregatesFor, compareAcross, filterSpots, grade, pickQuestion,
  randomSuits, spotPrompt, spotTitle, studyNote,
} from "./trainer-data.js";
import { clearHistory, loadHistory, saveHistory, summarize } from "./trainer-store.js";
import "./trainer.css";

const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" };
const pct = value => `${Math.round((value ?? 0) * 100)}%`;
const KIND_FILTERS = [{ value: "all", label: "すべて" }, { value: "open", label: "オープン" }, { value: "response", label: "オープンへの応答" }];

function PlayingCard({ card }) {
  return <span className={`trainer-card suit-${card[1]}`}><b>{card[0]}</b><i>{SUITS[card[1]]}</i></span>;
}

// Seats clockwise from the hero, who always sits at the bottom centre (x%, y% of the felt).
const SEAT_SLOTS = [[50, 100], [5, 76], [13, 12], [50, -2], [87, 12], [95, 76]];
const BLINDS = { SB: 0.5, BB: 1 };

function seatStates(spot) {
  const heroIndex = POSITIONS.indexOf(spot.hero);
  return POSITIONS.map((position, index) => {
    const bet = position === spot.opener ? spot.openSize : BLINDS[position] ?? 0;
    const acted = index < heroIndex || (spot.opener && position === spot.opener);
    const state = position === spot.hero ? "hero" : position === spot.opener ? "raise" : index < heroIndex ? "fold" : "wait";
    return { position, bet, stack: +(100 - bet).toFixed(1), state, acted };
  });
}

// GTO-Wizard-like history strip: every action before the hero, then the hero's pending decision.
function ActionStrip({ spot, answer, actionLabels }) {
  const seats = seatStates(spot).filter(seat => seat.acted || seat.state === "hero");
  return <ol className="trainer-strip" aria-label="ここまでのアクション">
    {seats.map(seat => <li key={seat.position} className={`strip-${seat.state}`}>
      <span>{seat.position}</span><small>{seat.stack}</small>
      <b>{seat.state === "fold" ? "Fold" : seat.state === "raise" ? `Raise ${spot.openSize}` : answer ? actionLabels[answer.action] : "?"}</b>
    </li>)}
  </ol>;
}

function PokerTable({ spot, cards, hand, review }) {
  const seats = seatStates(spot);
  const heroIndex = POSITIONS.indexOf(spot.hero);
  const pot = seats.reduce((sum, seat) => sum + seat.bet, 0);
  return <div className="poker-table" aria-label={`テーブル。${spotPrompt(spot)}`}>
    <div className="poker-felt">
      <div className="poker-center">
        <span className="poker-spot">{spotTitle(spot)} · 100bb{review && <em>復習</em>}</span>
        <strong className="poker-pot">{+pot.toFixed(1)} bb</strong>
      </div>
    </div>
    {seats.map((seat, index) => {
      if (!(seat.bet > 0) || seat.state === "fold") return null;
      const [x, y] = SEAT_SLOTS[(index - heroIndex + 6) % 6];
      return <span key={`chip-${seat.position}`} className={`poker-chip${seat.state === "raise" ? " raise" : ""}`}
        style={{ left: `${x + (50 - x) * 0.34}%`, top: `${y + (50 - y) * 0.42}%` }}><i />{seat.bet}</span>;
    })}
    {seats.map((seat, index) => {
      const slot = SEAT_SLOTS[(index - heroIndex + 6) % 6];
      return <div key={seat.position} className={`poker-seat seat-${seat.state}`} style={{ "--x": `${slot[0]}%`, "--y": `${slot[1]}%` }}>
        <span className="poker-seat-disc"><b>{seat.position}</b><small>{seat.state === "fold" ? "Fold" : seat.stack}</small></span>
        {seat.position === "BTN" && <span className="poker-dealer">D</span>}
        {seat.state === "hero" && <span className="poker-hole" aria-label={`あなたのハンド ${hand}`}>{cards.map(card => <PlayingCard key={card} card={card} />)}</span>}
      </div>;
    })}
  </div>;
}

function MixBar({ spot, mix }) {
  return <span className="trainer-mix" aria-hidden="true">
    {spot.actions.filter(action => mix?.[action.key] > 0).map(action =>
      <i key={action.key} style={{ width: pct(mix[action.key]), background: barColor(action.key === "open" || action.key === "three_bet" ? "raise" : action.key) }} />)}
  </span>;
}

function Comparison({ spot, hand }) {
  const rows = compareAcross(spot, hand);
  return <div className="trainer-compare">
    <h3>{spot.kind === "open" ? `${hand} をほかの席から開けると` : `${hand} を ${spot.hero} で、ほかの相手のオープンに対して`}</h3>
    <ul>
      {rows.map(row => <li key={row.spot.id} className={row.current ? "current" : ""}>
        <span>{spot.kind === "open" ? row.spot.hero : `vs ${row.spot.opener}`}</span>
        <MixBar spot={row.spot} mix={row.mix} />
        <b>{row.mix ? row.spot.actions.map(action => row.mix[action.key] >= 0.005 ? `${action.label.split(" ")[0]} ${pct(row.mix[action.key])}` : null).filter(Boolean).join(" / ") : "—"}</b>
      </li>)}
    </ul>
  </div>;
}

function Drill({ profile, history, onAnswer, reviewOnly, onExitReview }) {
  const [kind, setKind] = useState("all");
  const [position, setPosition] = useState("all");
  const spots = useMemo(() => filterSpots({ kind, position }), [kind, position]);
  // Keep just-answered hands out of the review queue so a miss is not re-asked immediately.
  const review = useMemo(() => {
    const recent = new Set(history.slice(-6).map(item => `${item.spotId}|${item.hand}`));
    const all = summarize(history).review;
    const cooled = all.filter(item => !recent.has(`${item.spotId}|${item.hand}`));
    return reviewOnly && !cooled.length ? all : cooled;
  }, [history, reviewOnly]);
  const next = useCallback(() => {
    const question = reviewOnly && review.length
      ? pickQuestion(filterSpots(), () => 0, [...review].sort(() => Math.random() - 0.5))
      : pickQuestion(spots.length ? spots : filterSpots(), Math.random, review);
    return { ...question, cards: randomSuits(question.hand) };
  }, [spots, review, reviewOnly]);
  const [question, setQuestion] = useState(() => next());
  const [answer, setAnswer] = useState(null);
  const [session, setSession] = useState({ answered: 0, score: 0, streak: 0 });
  const [selectedHand, setSelectedHand] = useState(null);

  useEffect(() => { setQuestion(next()); setAnswer(null); }, [kind, position, reviewOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback(action => {
    if (answer) return;
    const graded = grade(question.spot, question.hand, action, { lenient: profile?.level === "beginner" });
    setAnswer({ action, ...graded });
    setSelectedHand(question.hand);
    setSession(current => ({ answered: current.answered + 1, score: current.score + graded.score,
      streak: graded.result === "miss" ? 0 : current.streak + 1 }));
    onAnswer({ spotId: question.spot.id, hand: question.hand, action, result: graded.result, score: graded.score, at: Date.now() });
  }, [answer, question, profile, onAnswer]);

  const advance = useCallback(() => { setQuestion(next()); setAnswer(null); }, [next]);

  useEffect(() => {
    const onKey = event => {
      if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
      if (!answer) {
        const action = question.spot.actions[Number(event.key) - 1];
        if (action) choose(action.key);
      } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); advance(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, question, choose, advance]);

  const { spot, hand, cards } = question;
  const aggregates = useMemo(() => aggregatesFor(spot), [spot]);
  const matrixNode = useMemo(() => ({ actingPosition: spot.hero }), [spot]);
  const actionLabels = Object.fromEntries(spot.actions.map(action => [action.key, action.label]));
  const shownHand = selectedHand && answer ? selectedHand : hand;
  const shownMix = spot.byHand.get(shownHand);

  return <div className="trainer-layout">
    <div className="trainer-toolbar">
      {reviewOnly ? <div className="trainer-review-banner">
          <strong>復習モード</strong><span>間違えたハンドだけを出題中（残り {review.length}）</span>
          <button type="button" onClick={onExitReview}>通常に戻る</button>
        </div>
        : <>
          <div className="trainer-chips" role="group" aria-label="出題範囲">
            {KIND_FILTERS.map(item => <button type="button" key={item.value} aria-pressed={kind === item.value} className={kind === item.value ? "on" : ""} onClick={() => setKind(item.value)}>{item.label}</button>)}
          </div>
          <div className="trainer-chips" role="group" aria-label="自分の席">
            {["all", ...POSITIONS].map(item => <button type="button" key={item} aria-pressed={position === item} className={position === item ? "on" : ""} onClick={() => setPosition(item)}>{item === "all" ? "全席" : item}</button>)}
          </div>
        </>}
      <dl className="trainer-session">
        <div><dt>回答</dt><dd>{session.answered}</dd></div>
        <div><dt>正答率</dt><dd>{session.answered ? pct(session.score / session.answered) : "—"}</dd></div>
        <div><dt>連続</dt><dd>{session.streak}</dd></div>
      </dl>
    </div>

    <div className="trainer-main">
      <Panel className={`trainer-question${answer ? ` answered result-${answer.result}` : ""}`}>
        <ActionStrip spot={spot} answer={answer} actionLabels={actionLabels} />
        <PokerTable spot={spot} cards={cards} hand={hand} review={question.review} />
        <div className="trainer-actions">
          {spot.actions.map((action, index) => {
            const state = !answer ? "" : action.key === answer.action ? ` chosen ${answer.result}` : action.key === answer.best ? " best" : "";
            return <button type="button" key={action.key} className={`trainer-action action-${action.key}${state}`} onClick={() => choose(action.key)} disabled={Boolean(answer)}>
              <kbd>{index + 1}</kbd><span>{action.label}</span>
              {answer && <b>{pct(answer.mix[action.key])}</b>}
            </button>;
          })}
        </div>

        {answer && <div className="trainer-feedback" role="status">
          <div className="trainer-verdict">
            <strong>{RESULT_LABELS[answer.result]}</strong>
            <span>{answer.result === "best" ? "いちばん多い選択です。" : answer.result === "mixed"
              ? `この手では ${pct(answer.frequency)} 選ばれる選択です。いちばん多いのは${actionLabels[answer.best]}。`
              : `この手では ${pct(answer.frequency)} しか選ばれません。いちばん多いのは${actionLabels[answer.best]}。`}</span>
            <button type="button" className="trainer-next" onClick={advance}>次へ<ArrowRight size={15} /><kbd>Enter</kbd></button>
          </div>
          <ul className="trainer-notes">
            {spot.actions.filter(action => answer.mix[action.key] >= 0.05 && studyNote(action.key, hand)).map(action =>
              <li key={action.key} style={{ "--note-color": barColor(action.key === "open" || action.key === "three_bet" ? "raise" : action.key) }}>
                <b>{action.label.split(" ")[0]} {pct(answer.mix[action.key])}</b>{studyNote(action.key, hand)}
              </li>)}
          </ul>
          <Comparison spot={spot} hand={hand} />
        </div>}
      </Panel>

      <div className="trainer-side">
        {answer ? <>
          <StrategyMatrix node={matrixNode} title={`${spotTitle(spot)} · レンジ`} ariaLabel={`${spotTitle(spot)}のレンジ`}
            aggregates={aggregates} actions={spot.actions.map(action => action.key)} actionLabels={actionLabels}
            selected={shownHand} onSelect={setSelectedHand} />
          {shownHand !== hand && shownMix && <p className="trainer-peek"><strong>{shownHand}</strong>
            {spot.actions.map(action => `${action.label.split(" ")[0]} ${pct(shownMix[action.key])}`).join(" / ")}</p>}
        </> : <Panel className="trainer-waiting">
          <SectionHeading title="直近の回答" />
          <RecentList history={history} />
        </Panel>}
      </div>
    </div>
  </div>;
}

function RecentList({ history }) {
  const recent = history.slice(-8).reverse();
  if (!recent.length) return <p className="trainer-empty">まだ回答がありません。</p>;
  return <ul className="trainer-recent">{recent.map(item => <li key={item.at} className={`result-${item.result}`}>
    <span>{item.hand}</span><small>{item.spotId.replace("_vs_", " vs ").replace("_open", " オープン")}</small><b>{RESULT_LABELS[item.result]}</b>
  </li>)}</ul>;
}

function RateList({ title, items }) {
  return <Panel className="weak-list"><SectionHeading title={title} />
    {items.length ? <ul>{items.map(item => <li key={item.key}>
      <span>{item.label}</span>
      <span className="weak-bar" aria-hidden="true"><i style={{ width: pct(item.rate), background: item.rate >= 0.8 ? "#4fa865" : item.rate >= 0.6 ? "#d9a441" : "#d9477f" }} /></span>
      <b>{pct(item.rate)}</b><small>{item.answered}問</small>
    </li>)}</ul> : <p className="trainer-empty">まだ回答がありません。</p>}
  </Panel>;
}

function Weakness({ history, onStartReview, onStart, onClear }) {
  const stats = useMemo(() => summarize(history), [history]);
  if (!stats.answered) return <Panel className="weak-empty">
    <h2>まだ回答がありません</h2>
    <p>トレーナーで問題を解くと、局面ごと・ハンドの種類ごとの正答率と、復習すべきハンドがここに並びます。</p>
    <button type="button" className="trainer-next" onClick={onStart}>トレーナーを始める<ArrowRight size={15} /></button>
  </Panel>;
  return <div className="weak-layout">
    <div className="weak-summary">
      <div><small>回答数</small><strong>{stats.answered}</strong></div>
      <div><small>正答率</small><strong>{pct(stats.rate)}</strong></div>
      <div><small>復習待ち</small><strong>{stats.review.length}</strong></div>
      <button type="button" className="trainer-next" onClick={onStartReview} disabled={!stats.review.length}><ArrowClockwise size={15} />間違えたハンドを復習</button>
      <button type="button" className="weak-clear" onClick={onClear}><Trash size={14} />履歴を消す</button>
    </div>
    <div className="weak-grid">
      <RateList title="苦手な局面" items={stats.bySpot.slice(0, 10)} />
      <RateList title="苦手なハンドの種類" items={stats.byCategory} />
      <Panel className="weak-list"><SectionHeading title="よく間違えるハンド" />
        {stats.review.length ? <ul className="weak-hands">{stats.review.slice(0, 12).map(item => <li key={`${item.spotId}|${item.hand}`}>
          <span>{item.label}</span><b>{item.misses}回ミス</b><small>{item.answered}問</small>
        </li>)}</ul> : <p className="trainer-empty">復習待ちのハンドはありません。</p>}
      </Panel>
    </div>
  </div>;
}

export function TrainerPage({ profile, onEditProfile, onSectionChange, section = "トレーナー" }) {
  const [history, setHistory] = useState(loadHistory);
  const [reviewOnly, setReviewOnly] = useState(false);
  const onAnswer = useCallback(entry => setHistory(current => { const updated = [...current, entry]; saveHistory(updated); return updated; }), []);
  return <div className="shell">
    <Sidebar activeSection={section} onSectionChange={onSectionChange} profile={profile} onEditProfile={onEditProfile} />
    <main className="trainer-page">
      {section === "弱点"
        ? <Weakness history={history}
            onStart={() => { setReviewOnly(false); onSectionChange("トレーナー"); }}
            onStartReview={() => { setReviewOnly(true); onSectionChange("トレーナー"); }}
            onClear={() => { if (window.confirm("回答履歴をすべて消しますか？")) { clearHistory(); setHistory([]); } }} />
        : <Drill profile={profile} history={history} onAnswer={onAnswer} reviewOnly={reviewOnly} onExitReview={() => setReviewOnly(false)} />}
    </main>
  </div>;
}
