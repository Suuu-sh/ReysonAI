import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ArrowRight, CheckCircle, Fire, Trash, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Sidebar } from "../components/layout.jsx";
import { Panel, SectionHeading, barColor } from "../components/primitives.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import {
  POSITIONS, RESULT_LABELS, aggregatesFor, compareAcross, filterSpots, grade, pickQuestion,
  randomSuits, spotPrompt, spotTitle, studyNote,
} from "./trainer-data.js";
import { clearHistory, loadHistory, saveHistory, summarize } from "./trainer-store.js";
import "./trainer.css";

const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" };
const pct = value => `${Math.round((value ?? 0) * 100)}%`;
const KIND_FILTERS = [{ value: "all", label: "すべて" }, { value: "open", label: "オープン" }, { value: "response", label: "vs オープン" }];
const RESULT_ICONS = { best: CheckCircle, mixed: WarningCircle, miss: XCircle };
const actionColor = key => barColor(key === "open" || key === "three_bet" ? "raise" : key);
const shortLabel = action => action.label.split(" ")[0];
const PANEL_TAB_KEY = "solveaai.trainer.panel-tab";

// Four-colour deck (♠ graphite, ♥ red, ♦ blue, ♣ green) so the suit reads at a glance.
function PlayingCard({ card, size = "" }) {
  return <span className={`trainer-card suit-${card[1]} ${size}`.trim()}>
    <b>{card[0]}</b><i>{SUITS[card[1]]}</i>
  </span>;
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

// History strip: every action before the hero, then the hero's decision.
function ActionStrip({ spot, answer, actionLabels }) {
  const seats = seatStates(spot).filter(seat => seat.acted || seat.state === "hero");
  return <ol className="trainer-strip" aria-label="ここまでのアクション">
    {seats.map(seat => <li key={seat.position} className={`strip-${seat.state}${answer && seat.state === "hero" ? ` result-${answer.result}` : ""}`}>
      <span>{seat.position}</span><small>{seat.stack}</small>
      <b>{seat.state === "fold" ? "Fold" : seat.state === "raise" ? `Raise ${spot.openSize}` : answer ? actionLabels[answer.action] : "?"}</b>
    </li>)}
  </ol>;
}

function Verdict({ answer, bestLabel, onNext }) {
  const Icon = RESULT_ICONS[answer.result];
  return <div className={`poker-verdict result-${answer.result}`} role="status">
    <Icon size={34} weight="fill" />
    <strong>{RESULT_LABELS[answer.result]}</strong>
    <small>{answer.result === "best" ? `頻度 ${pct(answer.frequency)}` : `頻度 ${pct(answer.frequency)} · 最多は${bestLabel}`}</small>
    <button type="button" className="poker-next" onClick={onNext}>次の問題<ArrowRight size={15} weight="bold" /><kbd>Enter</kbd></button>
  </div>;
}

function PokerTable({ spot, cards, hand, review, answer, bestLabel, onNext }) {
  const seats = seatStates(spot);
  const heroIndex = POSITIONS.indexOf(spot.hero);
  const pot = seats.reduce((sum, seat) => sum + seat.bet, 0);
  const slotOf = index => SEAT_SLOTS[(index - heroIndex + 6) % 6];
  return <div className={`poker-table${answer ? " answered" : ""}`} aria-label={`テーブル。${spotPrompt(spot)}`}>
    <div className="poker-felt">
      <div className="poker-center">
        {answer ? <Verdict answer={answer} bestLabel={bestLabel} onNext={onNext} /> : <>
          <span className="poker-spot">{spotTitle(spot)}{review && <em>復習</em>}</span>
          <strong className="poker-pot">{+pot.toFixed(1)}<small>bb</small></strong>
          <span className="poker-stakes">Cash · 6max · 100bb</span>
        </>}
      </div>
    </div>
    {seats.map((seat, index) => {
      if (!(seat.bet > 0) || seat.state === "fold") return null;
      const [x, y] = slotOf(index);
      return <span key={`chip-${seat.position}`} className={`poker-chip${seat.state === "raise" ? " raise" : ""}`}
        style={{ left: `${x + (50 - x) * 0.36}%`, top: `${y + (50 - y) * 0.44}%` }}><i />{seat.bet}<small>bb</small></span>;
    })}
    {seats.map((seat, index) => {
      const [x, y] = slotOf(index);
      return <div key={seat.position} className={`poker-seat seat-${seat.state}${answer ? " answered" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}>
        <span className="poker-seat-disc"><b>{seat.position}</b><small>{seat.state === "fold" ? "Fold" : seat.stack}</small></span>
        {seat.position === "BTN" && <span className="poker-dealer">D</span>}
        {seat.state === "hero" && <span className="poker-hole" key={hand + cards.join("")} aria-label={`あなたのハンド ${hand}`}>
          {cards.map(card => <PlayingCard key={card} card={card} />)}
        </span>}
      </div>;
    })}
  </div>;
}

function MixBar({ spot, mix }) {
  return <span className="trainer-mix" aria-hidden="true">
    {spot.actions.filter(action => mix?.[action.key] > 0).map(action =>
      <i key={action.key} style={{ width: pct(mix[action.key]), background: actionColor(action.key) }} />)}
  </span>;
}

function Comparison({ spot, hand }) {
  const rows = compareAcross(spot, hand);
  return <section className="trainer-compare">
    <h3>{spot.kind === "open" ? `${hand} · 席ごとのオープン` : `${hand} · ${spot.hero} で相手の席ごとに`}</h3>
    <ul>
      {rows.map(row => <li key={row.spot.id} className={row.current ? "current" : ""}>
        <span>{spot.kind === "open" ? row.spot.hero : `vs ${row.spot.opener}`}</span>
        <MixBar spot={row.spot} mix={row.mix} />
        <b>{row.mix ? row.spot.actions.filter(action => row.mix[action.key] >= 0.005).map(action => `${shortLabel(action)} ${pct(row.mix[action.key])}`).join(" · ") : "—"}</b>
      </li>)}
    </ul>
  </section>;
}

function SessionPanel({ session, history }) {
  const recent = history.slice(-8).reverse();
  return <div className="trainer-session-panel">
    <div className="session-score">
      <div className="session-ring" style={{ "--rate": session.answered ? session.score / session.answered : 0 }}>
        <strong>{session.answered ? pct(session.score / session.answered) : "—"}</strong><small>正答率</small>
      </div>
      <dl>
        <div><dt>回答</dt><dd>{session.answered}</dd></div>
        <div><dt>連続正解</dt><dd>{session.streak}</dd></div>
        <div><dt>最高連続</dt><dd>{session.bestStreak}</dd></div>
      </dl>
    </div>
    <h3>直近の回答</h3>
    {recent.length ? <ul className="trainer-recent">{recent.map(item => <li key={item.at} className={`result-${item.result}`}>
      <i /><span>{item.hand}</span><small>{item.spotId.replace("_vs_", " vs ").replace("_open", " オープン")}</small><b>{RESULT_LABELS[item.result]}</b>
    </li>)}</ul> : <p className="trainer-empty">まだ回答がありません。</p>}
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
  const [session, setSession] = useState({ answered: 0, score: 0, streak: 0, bestStreak: 0, results: [] });
  const [selectedHand, setSelectedHand] = useState(null);
  const [tab, setTab] = useState(() => { try { return window.localStorage.getItem(PANEL_TAB_KEY) ?? "notes"; } catch { return "notes"; } });
  const chooseTab = value => { setTab(value); try { window.localStorage.setItem(PANEL_TAB_KEY, value); } catch {} };

  useEffect(() => { setQuestion(next()); setAnswer(null); }, [kind, position, reviewOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback(action => {
    if (answer) return;
    const graded = grade(question.spot, question.hand, action, { lenient: profile?.level === "beginner" });
    setAnswer({ action, ...graded });
    setSelectedHand(question.hand);
    setSession(current => {
      const streak = graded.result === "miss" ? 0 : current.streak + 1;
      return { answered: current.answered + 1, score: current.score + graded.score, streak,
        bestStreak: Math.max(current.bestStreak, streak), results: [...current.results, graded.result].slice(-10) };
    });
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
  const notes = answer ? spot.actions.filter(action => answer.mix[action.key] >= 0.05 && studyNote(action.key, hand, spot)) : [];

  return <div className="trainer-layout">
    <header className="trainer-topbar">
      {reviewOnly ? <div className="trainer-review-banner">
          <strong>復習モード</strong><span>間違えたハンドを出題中 · 残り {review.length}</span>
          <button type="button" onClick={onExitReview}>通常に戻る</button>
        </div>
        : <div className="trainer-filters">
          <div className="trainer-chips" role="group" aria-label="出題範囲">
            {KIND_FILTERS.map(item => <button type="button" key={item.value} aria-pressed={kind === item.value} className={kind === item.value ? "on" : ""} onClick={() => setKind(item.value)}>{item.label}</button>)}
          </div>
          <div className="trainer-chips" role="group" aria-label="自分の席">
            {["all", ...POSITIONS].map(item => <button type="button" key={item} aria-pressed={position === item} className={position === item ? "on" : ""} onClick={() => setPosition(item)}>{item === "all" ? "全席" : item}</button>)}
          </div>
        </div>}
      <div className="trainer-hud" aria-label="このセッションの成績">
        <ol className="hud-dots" aria-label="直近10問の結果">
          {Array.from({ length: 10 }, (_, index) => session.results[index] ?? null).map((result, index) =>
            <li key={index} className={result ? `result-${result}` : ""} />)}
        </ol>
        <span className={`hud-streak${session.streak >= 3 ? " hot" : ""}`} title="連続正解"><Fire size={15} weight="fill" />{session.streak}</span>
        <span className="hud-rate">{session.answered ? pct(session.score / session.answered) : "—"}<small>{session.answered}問</small></span>
      </div>
    </header>

    <div className="trainer-main">
      <section className={`trainer-stage${answer ? ` answered result-${answer.result}` : ""}`} aria-label="問題">
        <ActionStrip spot={spot} answer={answer} actionLabels={actionLabels} />
        <div className="stage-table">
          <PokerTable spot={spot} cards={cards} hand={hand} review={question.review} answer={answer}
            bestLabel={answer && shortLabel(spot.actions.find(action => action.key === answer.best))} onNext={advance} />
        </div>
        <div className="trainer-actions">
          {spot.actions.map((action, index) => {
            const state = !answer ? "" : action.key === answer.action ? ` chosen ${answer.result}` : action.key === answer.best ? " best" : "";
            return <button type="button" key={action.key} className={`trainer-action action-${action.key}${state}`} onClick={() => choose(action.key)} disabled={Boolean(answer)}
              style={{ "--action-color": actionColor(action.key), "--freq": answer ? answer.mix[action.key] : 0 }}>
              <kbd>{index + 1}</kbd><span>{action.label}</span>
              {answer && <b>{pct(answer.mix[action.key])}</b>}
            </button>;
          })}
        </div>
      </section>

      <aside className="trainer-panel">
        {answer ? <>
          <div className="panel-tabs" role="tablist">
            {[["notes", "解説"], ["range", "レンジ表"]].map(([value, label]) =>
              <button type="button" role="tab" key={value} aria-selected={tab === value} className={tab === value ? "on" : ""} onClick={() => chooseTab(value)}>{label}</button>)}
          </div>
          <div className="panel-body">
            {tab === "notes" ? <div className="trainer-explain">
              <p className="explain-lead">
                <b className="explain-hand">{cards.map(card => <PlayingCard key={card} card={card} size="mini" />)}</b>
                {answer.result === "best" ? "この局面でいちばん多い選択です。" : answer.result === "mixed"
                  ? `${pct(answer.frequency)} で選ばれる混合の選択です。いちばん多いのは${actionLabels[answer.best]}。`
                  : `この手ではほぼ選ばれません（${pct(answer.frequency)}）。いちばん多いのは${actionLabels[answer.best]}。`}
              </p>
              {notes.length > 0 && <ul className="trainer-notes">
                {notes.map(action => <li key={action.key} style={{ "--note-color": actionColor(action.key) }}>
                  <b>{shortLabel(action)} {pct(answer.mix[action.key])}</b>{studyNote(action.key, hand, spot)}
                </li>)}
              </ul>}
              <Comparison spot={spot} hand={hand} />
            </div> : <div className="trainer-range">
              <StrategyMatrix node={matrixNode} title={`${spotTitle(spot)} · レンジ`} ariaLabel={`${spotTitle(spot)}のレンジ`}
                aggregates={aggregates} actions={spot.actions.map(action => action.key)} actionLabels={actionLabels}
                selected={shownHand} onSelect={setSelectedHand} />
              {shownMix && <p className="trainer-peek"><strong>{shownHand}</strong>
                {spot.actions.map(action => `${shortLabel(action)} ${pct(shownMix[action.key])}`).join(" · ")}</p>}
            </div>}
          </div>
        </> : <div className="panel-body"><SessionPanel session={session} history={history} /></div>}
      </aside>
    </div>
  </div>;
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
      <div className="session-ring" style={{ "--rate": stats.rate }}><strong>{pct(stats.rate)}</strong><small>正答率</small></div>
      <div><small>回答数</small><strong>{stats.answered}</strong></div>
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
