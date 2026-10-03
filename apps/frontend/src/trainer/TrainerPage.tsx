import { RankBadge } from "./RankBadge.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, CheckCircle, Fire, Trash, Trophy, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Sidebar } from "../components/layout.tsx";
import { Panel, SectionHeading, barColor } from "../components/primitives.tsx";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import {
  DIFFICULTY_OPTIONS, POSITIONS, RESULT_LABELS, SPOTS, STRICTNESS_OPTIONS, aggregatesFor, compareAcross,
  filterSpots, grade, normalizeSettings, pickQuestion, randomSuits, spotById, spotPrompt, spotTitle, spotsForSettings, studyNote,
} from "./trainer-data.ts";
import { clearHistory, loadHistory, saveHistory, summarize } from "./trainer-store.ts";
import { displayDrillName, drillStats, loadDrills, newDrillId, recordSession, saveDrills, upsertDrill } from "./drill-store.ts";
import { loadDrillDrafts, removeDrillDraft, restoreDrillDraft, saveDrillDraft } from "./drill-session-store.ts";
import { DrillLibrary, HistoryChart } from "./DrillLibrary.tsx";
import { PlayerAnalysis } from "./PlayerAnalysis.tsx";
import { SessionPage } from "./SessionPage.tsx";
import { loadReviewSessions, newSessionRecord, recordReviewSession } from "./practice-sessions.ts";
import { RANKED_DAILY_LIMIT, RANKED_ENABLED, RANKED_LENGTH, RANKED_SETTINGS, loadRankState, playedToday, recordMatch, saveRankState, TIER_EN, tierFor } from "./rank-store.ts";
import { Leaderboard } from "./Leaderboard.tsx";
import "./trainer.css";
import { localized } from "../i18n.ts";

const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" };
const pct = value => `${Math.round((value ?? 0) * 100)}%`;
const RESULT_ICONS = { best: CheckCircle, mixed: WarningCircle, miss: XCircle };
const actionColor = key => barColor(key === "open" || key === "three_bet" ? "raise" : key);
const shortLabel = action => action.label.split(" ")[0];

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

function Verdict({ answer, bestLabel }) {
  const Icon = RESULT_ICONS[answer.result];
  return <div className={`poker-verdict result-${answer.result}`} role="status">
    <strong><Icon size={18} weight="fill" />{RESULT_LABELS[answer.result]}</strong>
    <small>{answer.result === "best" ? `頻度 ${pct(answer.frequency)}` : `頻度 ${pct(answer.frequency)} · 最多は${bestLabel}`}</small>
  </div>;
}

function PokerTable({ spot, cards, hand, review, answer, bestLabel }) {
  const seats = seatStates(spot);
  const heroIndex = POSITIONS.indexOf(spot.hero);
  const pot = seats.reduce((sum, seat) => sum + seat.bet, 0);
  const slotOf = index => SEAT_SLOTS[(index - heroIndex + 6) % 6];
  return <div className={`poker-table${answer ? " answered" : ""}`} aria-label={`テーブル。${spotPrompt(spot)}`}>
    <div className="poker-felt">
      <div className="poker-center">
        {answer ? <Verdict answer={answer} bestLabel={bestLabel} /> : <>
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
    <h3>{spot.kind === "open" ? localized(`${hand} · opening frequency by seat`, `${hand} · 席ごとのオープン`) : localized(`${hand} · versus each opener from ${spot.hero}`, `${hand} · ${spot.hero} で相手の席ごとに`)}</h3>
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

const KIND_OPTIONS = [{ value: "open", label: "オープン", hint: "前の人が全員フォールド" }, { value: "response", label: "vs オープン", hint: "誰かのオープンに応答" }];
// Every drill is a fixed 10-question session that cannot be ended early.
const SESSION_LENGTH = 10;
const RANKED_DRILL = Object.freeze({ id: "ranked", name: "ランク戦", settings: RANKED_SETTINGS });

function Segmented({ options, value, onChange, label }) {
  return <div className="setup-segmented" role="radiogroup" aria-label={label}>
    {options.map(option => <button type="button" role="radio" key={option.value} aria-checked={value === option.value}
      className={value === option.value ? "on" : ""} onClick={() => onChange(option.value)}>
      <strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}
    </button>)}
  </div>;
}

function DrillEditor({ drill, isNew, onChange, onSave, onCancel, reviewCount }) {
  const settings = drill.settings;
  const setSettings = next => onChange({ ...drill, settings: next });
  const spots = spotsForSettings(settings);
  const toggle = (key, value) => {
    const current = settings[key];
    const nextValues = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
    if (nextValues.length) setSettings({ ...settings, [key]: nextValues });
  };
  // Positions with no spot for the chosen kinds (e.g. BB never opens, UTG never faces an open).
  const positionAvailable = position => SPOTS.some(spot => settings.kinds.includes(spot.kind) && spot.hero === position);
  return <div className="trainer-setup">
    <div className="setup-head">
      <button type="button" className="setup-back" onClick={onCancel}><ArrowLeft size={15} />ドリル一覧</button>
      <h1>{isNew ? "新しいドリル" : "ドリルを編集"}</h1>
      <label className="setup-name">
        <span>ドリル名</span>
        <input value={displayDrillName(drill)} maxLength={40} placeholder="例：BTNのオープン" onChange={event => onChange({ ...drill, name: event.target.value })} />
      </label>
    </div>
    <div className="setup-grid">
      <section className="setup-block">
        <h2>出題範囲</h2>
        <div className="setup-toggles">
          {KIND_OPTIONS.map(option => <button type="button" key={option.value} aria-pressed={settings.kinds.includes(option.value)}
            className={settings.kinds.includes(option.value) ? "on" : ""} onClick={() => toggle("kinds", option.value)}>
            <strong>{option.label}</strong><small>{option.hint}</small>
          </button>)}
        </div>
      </section>
      <section className="setup-block">
        <h2>自分の席<button type="button" className="setup-link" onClick={() => setSettings({ ...settings, positions: [...POSITIONS] })}>すべて選択</button></h2>
        <div className="setup-seats">
          {POSITIONS.map(position => <button type="button" key={position} aria-pressed={settings.positions.includes(position)}
            className={`${settings.positions.includes(position) ? "on" : ""}${positionAvailable(position) ? "" : " empty"}`}
            onClick={() => toggle("positions", position)} title={positionAvailable(position) ? position : `${position}：この出題範囲では局面がありません`}>{position}</button>)}
        </div>
      </section>
      <section className="setup-block">
        <h2>難易度</h2>
        <Segmented label="難易度" value={settings.difficulty} onChange={difficulty => setSettings({ ...settings, difficulty })} options={DIFFICULTY_OPTIONS} />
      </section>
      <section className="setup-block">
        <h2>判定の厳しさ</h2>
        <Segmented label="判定の厳しさ" value={settings.strictness} onChange={strictness => setSettings({ ...settings, strictness })} options={STRICTNESS_OPTIONS} />
      </section>
      <section className="setup-block">
        <h2>復習</h2>
        <label className="setup-switch">
          <input type="checkbox" checked={settings.review} onChange={event => setSettings({ ...settings, review: event.target.checked })} />
          <span aria-hidden="true" />
          <div><strong>間違えたハンドを混ぜる</strong><small>4問に1問ほど、以前ミスしたハンドを再出題（復習待ち {reviewCount}）</small></div>
        </label>
      </section>
    </div>
    <div className="setup-footer">
      <span className={`setup-summary${spots.length ? "" : " invalid"}`}>
        {spots.length ? <>対象 <b>{spots.length}</b> 局面 · {SESSION_LENGTH}問 · {DIFFICULTY_OPTIONS.find(item => item.value === settings.difficulty).label}</> : "この組み合わせでは出題できる局面がありません"}
      </span>
      <button type="button" className="setup-secondary" onClick={() => onSave(false)} disabled={!spots.length || !drill.name.trim()}>保存</button>
      <button type="button" className="setup-start" onClick={() => onSave(true)} disabled={!spots.length || !drill.name.trim()}>保存して開始<ArrowRight size={17} weight="bold" /></button>
    </div>
  </div>;
}

function SessionResult({ log, settings, drill, record, rank, onRestart, onLibrary }) {
  const answered = log.length;
  const score = log.reduce((sum, item) => sum + item.score, 0);
  const counts = { best: 0, mixed: 0, miss: 0 };
  for (const item of log) counts[item.result]++;
  const misses = log.filter(item => item.result === "miss");
  return <div className="trainer-result">
    <div className="result-hero">
      <div className="session-ring large" style={{ "--rate": answered ? score / answered : 0 }}><strong>{answered ? pct(score / answered) : "—"}</strong><small>正答率</small></div>
      <div>
        <h1>{answered ? score / answered >= 0.8 ? "よくできました" : score / answered >= 0.6 ? "もう一歩" : "復習しましょう" : "おつかれさまでした"}</h1>
        <p>{drill ? <b className="result-drill">{drill.name}</b> : "復習ドリル"} · {answered}問 · {DIFFICULTY_OPTIONS.find(item => item.value === settings.difficulty).label} · 判定{STRICTNESS_OPTIONS.find(item => item.value === settings.strictness).label}</p>
        <ul className="result-counts">
          <li className="result-best"><CheckCircle size={16} weight="fill" />正解 {counts.best}</li>
          <li className="result-mixed"><WarningCircle size={16} weight="fill" />混合で可 {counts.mixed}</li>
          <li className="result-miss"><XCircle size={16} weight="fill" />ミス {counts.miss}</li>
        </ul>
      </div>
    </div>
    {rank && <RankResult rank={rank} />}
    {record && <section className="result-record">
      <div className="record-compare">
        {record.isBest && <span className="record-badge"><Trophy size={14} weight="fill" />自己ベスト更新</span>}
        <dl>
          <div><dt>今回</dt><dd>{pct(record.stats.last)}</dd></div>
          <div><dt>前回</dt><dd>{record.stats.previous == null ? "—" : pct(record.stats.previous)}{record.stats.previous != null && <small className={record.stats.last >= record.stats.previous ? "up" : "down"}>{record.stats.last >= record.stats.previous ? "▲" : "▼"}{Math.abs(Math.round((record.stats.last - record.stats.previous) * 100))}</small>}</dd></div>
          <div><dt>ベスト</dt><dd>{pct(record.stats.best)}</dd></div>
          <div><dt>平均</dt><dd>{pct(record.stats.average)}</dd></div>
          <div><dt>挑戦</dt><dd>{record.stats.attempts}回</dd></div>
        </dl>
      </div>
      <div className="record-chart"><h2>このドリルの正答率の推移</h2><HistoryChart values={record.stats.trend} /></div>
    </section>}
    {misses.length > 0 && <section className="result-misses">
      <h2>ミスしたハンド</h2>
      <ul>{misses.map((item, index) => {
        const spot = spotById.get(item.spotId);
        const best = spot.actions.find(action => action.key === item.best);
        const chosen = spot.actions.find(action => action.key === item.action);
        return <li key={index}>
          <span className="result-cards">{item.cards.map(card => <PlayingCard key={card} card={card} size="mini" />)}</span>
          <span className="result-spot">{spotTitle(spot)}</span>
          <span className="result-choice">あなた <b className="bad">{shortLabel(chosen)}</b> → 最多 <b className="good">{shortLabel(best)} {pct(item.mix[item.best])}</b></span>
        </li>;
      })}</ul>
    </section>}
    <div className="setup-footer">
      <button type="button" className="setup-secondary" onClick={onLibrary}>ドリル一覧へ</button>
      {onRestart && <button type="button" className="setup-start" onClick={onRestart}>もう一度挑戦<ArrowClockwise size={17} weight="bold" /></button>}
    </div>
  </div>;
}

function RankResult({ rank }) {
  const delta = rank.after - rank.before;
  const tier = tierFor(rank.after);
  const promoted = tierFor(rank.before).name !== tier.name;
  return <section className="rank-result">
    <RankBadge name={tier.name} size={80} />
    <div><small>レート</small><strong>{rank.after}</strong>
      <span className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "▲" : "▼"}{Math.abs(delta)}</span></div>
    <div><small>ランク</small><strong>{tier.name}</strong>{promoted && <span className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "昇格" : "降格"}</span>}</div>
    <p>{tier.next ? localized(`${tier.next.min - rank.after} to ${TIER_EN[tier.next.name]}`, `${tier.next.name}まで あと${tier.next.min - rank.after}`) : "最高ランクです"}</p>
  </section>;
}

function Drill({ history, onAnswer, settings, drillName, reviewOnly, draftKey, initialDraft, onProgress, onOpenSetup, onFinish, length = SESSION_LENGTH }) {
  const spots = useMemo(() => spotsForSettings(settings), [settings]);
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
      : pickQuestion(spots.length ? spots : filterSpots(), Math.random, settings.review ? review : [], 0.25, settings.difficulty);
    return { ...question, cards: randomSuits(question.hand) };
  }, [spots, review, reviewOnly, settings]);
  const [restored] = useState(() => restoreDrillDraft(initialDraft));
  const [startedAt] = useState(() => Date.now() - (restored?.elapsedMs ?? 0));
  const [question, setQuestion] = useState(() => restored?.question ?? next());
  const [answer, setAnswer] = useState(() => restored?.answer ?? null);
  const [session, setSession] = useState(() => restored?.session ?? { answered: 0, score: 0, streak: 0, bestStreak: 0, results: [], log: [] });
  const [selectedHand, setSelectedHand] = useState(null);
  const limit = length;
  const lastQuestion = limit > 0 && session.answered >= limit;

  const choose = useCallback(action => {
    if (answer) return;
    const graded = grade(question.spot, question.hand, action, { strictness: settings.strictness });
    setAnswer({ action, ...graded });
    setSelectedHand(question.hand);
    setSession(current => {
      const streak = graded.result === "miss" ? 0 : current.streak + 1;
      return { answered: current.answered + 1, score: current.score + graded.score, streak,
        bestStreak: Math.max(current.bestStreak, streak), results: [...current.results, graded.result].slice(-10),
        log: [...current.log, { spotId: question.spot.id, hand: question.hand, cards: question.cards, action, result: graded.result, score: graded.score, best: graded.best, mix: graded.mix }] };
    });
    onAnswer({ spotId: question.spot.id, hand: question.hand, action, result: graded.result, score: graded.score, at: Date.now() });
  }, [answer, question, settings, onAnswer]);

  const advance = useCallback(() => {
    if (lastQuestion) { onFinish(session.log, Date.now() - startedAt); return; }
    setQuestion(next()); setAnswer(null);
  }, [next, lastQuestion, onFinish, session.log]);

  useEffect(() => {
    const onKey = event => {
      if (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
      if (!answer) {
        const action = question.spot.actions[Number(event.key) - 1];
        if (action) choose(action.key);
      } else if ((event.key === "Enter" || event.key === " ") && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); advance(); }
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
  const progress = limit > 0 ? Math.min(1, session.answered / limit) : 0;

  useEffect(() => {
    onProgress({ key: draftKey, drillId: draftKey, drillName, settings, reviewOnly, savedAt: Date.now(), elapsedMs: Date.now() - startedAt,
      question: { spotId: spot.id, hand, cards, review: question.review }, answerAction: answer?.action ?? null, session });
  }, [draftKey, drillName, settings, reviewOnly, startedAt, spot.id, hand, cards, question.review, answer, session, onProgress]);

  return <div className="trainer-layout">
    <header className="trainer-topbar">
      <div className="trainer-config">
        <strong className="config-name">{reviewOnly ? "復習ドリル" : drillName}</strong>
        {reviewOnly ? null : <>
          <span className="config-chip">{settings.kinds.length === 2 ? "オープン＋vs オープン" : KIND_OPTIONS.find(item => item.value === settings.kinds[0]).label}</span>
          <span className="config-chip">{settings.positions.length === POSITIONS.length ? "全席" : settings.positions.join("・")}</span>
          <span className="config-chip">{DIFFICULTY_OPTIONS.find(item => item.value === settings.difficulty).label}</span>
        </>}
        <button type="button" className="config-edit" onClick={onOpenSetup}><ArrowLeft size={14} />一覧</button>
      </div>
      {limit > 0 && <div className="trainer-progress" aria-label={`${session.answered} / ${limit} 問`}>
        <span><b>{Math.min(session.answered + (answer ? 0 : 1), limit)}</b> / {limit}</span>
        <i style={{ "--progress": progress }} />
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
            bestLabel={answer && shortLabel(spot.actions.find(action => action.key === answer.best))} />
        </div>
        <div className="stage-footer">
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
        <button type="button" className={`trainer-next-btn${answer ? " ready" : ""}`} onClick={advance} disabled={!answer}>
          {lastQuestion ? "結果へ" : "次へ"}<ArrowRight size={14} weight="bold" /><kbd>Enter</kbd>
        </button>
        </div>
      </section>

      <aside className="trainer-panel">
        {answer ? <>
          <div className="panel-body">
            <div className="trainer-range">
              <StrategyMatrix node={matrixNode} title={`${spotTitle(spot)} · レンジ`} ariaLabel={`${spotTitle(spot)}のレンジ`}
                aggregates={aggregates} actions={spot.actions.map(action => action.key)} actionLabels={actionLabels}
                selected={shownHand} onSelect={setSelectedHand} />
              {shownMix && <p className="trainer-peek"><strong>{shownHand}</strong>
                {spot.actions.map(action => `${shortLabel(action)} ${pct(shownMix[action.key])}`).join(" · ")}</p>}
            </div>
            <div className="trainer-explain">
              <p className="explain-lead">
                <b className="explain-hand">{cards.map(card => <PlayingCard key={card} card={card} size="mini" />)}</b>
                {answer.result === "best" ? localized("This is the most frequent choice in this spot.", "この局面でいちばん多い選択です。") : answer.result === "mixed"
                  ? localized(`This is a mixed choice used ${pct(answer.frequency)} of the time. The most frequent choice is ${actionLabels[answer.best]}.`, `${pct(answer.frequency)} で選ばれる混合の選択です。いちばん多いのは${actionLabels[answer.best]}。`)
                  : localized(`This choice is rarely used with this hand (${pct(answer.frequency)}). The most frequent choice is ${actionLabels[answer.best]}.`, `この手ではほぼ選ばれません（${pct(answer.frequency)}）。いちばん多いのは${actionLabels[answer.best]}。`)}
              </p>
              {notes.length > 0 && <ul className="trainer-notes">
                {notes.map(action => <li key={action.key} style={{ "--note-color": actionColor(action.key) }}>
                  <b>{shortLabel(action)} {pct(answer.mix[action.key])}</b>{studyNote(action.key, hand, spot)}
                </li>)}
              </ul>}
              <Comparison spot={spot} hand={hand} />
            </div>
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
  const [drills, setDrills] = useState(() => loadDrills(profile?.level));
  const [drafts, setDrafts] = useState(loadDrillDrafts);
  const [reviewSessions, setReviewSessions] = useState(loadReviewSessions);
  const [phase, setPhase] = useState("library");
  const [active, setActive] = useState(null); // { drill, review }
  const [editing, setEditing] = useState(null); // { drill, isNew }
  const [run, setRun] = useState(0);
  const [result, setResult] = useState(null);
  const [rankState, setRankState] = useState(loadRankState);
  const reviewCount = useMemo(() => summarize(history).review.length, [history]);
  const onAnswer = useCallback(entry => setHistory(current => { const updated = [...current, entry]; saveHistory(updated); return updated; }), []);
  const commitDrills = next => { setDrills(next); saveDrills(next); };
  const onProgress = useCallback(draft => setDrafts(current => saveDrillDraft(current, draft)), []);
  const discardProgress = useCallback(key => setDrafts(current => removeDrillDraft(current, key)), []);
  const start = (drill, review = false) => {
    const saved = drafts[review ? "review" : drill.id];
    setActive({ drill, review, ranked: drill.id === RANKED_DRILL.id, name: saved?.drillName ?? drill.name, settings: saved?.settings ?? drill.settings });
    setRun(value => value + 1); setPhase("drill"); onSectionChange("トレーナー");
  };
  const reviewDrill = useMemo(() => ({ id: "review", name: "復習ドリル", settings: normalizeSettings({ count: Math.min(20, Math.max(reviewCount, 1)) }, profile?.level) }), [reviewCount, profile]);
  const onFinish = useCallback((log, durationMs) => {
    discardProgress(active.review ? "review" : active.drill.id);
    let record = null;
    if (active.ranked) {
      const next = recordMatch(rankState, log);
      setRankState(next); saveRankState(next);
      setResult({ log, record: null, rank: next.matches.at(-1) });
      setPhase("result");
      return;
    }
    if (log.length) {
      const session = newSessionRecord(log, durationMs);
      if (active.review) setReviewSessions(current => recordReviewSession(current, session));
      else {
        const before = drillStats(drills.find(drill => drill.id === active.drill.id));
        const next = recordSession(drills, active.drill.id, session);
        commitDrills(next);
        const stats = drillStats(next.find(drill => drill.id === active.drill.id));
        record = { stats, isBest: before.best == null ? false : stats.last > before.best };
      }
    }
    setResult({ log, record });
    setPhase("result");
  }, [active, drills, discardProgress, rankState]); // eslint-disable-line react-hooks/exhaustive-deps
  const mainRef = useRef(null);
  useEffect(() => { mainRef.current?.scrollTo?.(0, 0); window.scrollTo?.(0, 0); }, [phase, section]);
  const activeDraftKey = active && (active.review ? "review" : active.drill.id);
  const activeDraft = activeDraftKey ? drafts[activeDraftKey] : null;
  const baseCurrent = active && (active.review ? reviewDrill : drills.find(drill => drill.id === active.drill.id) ?? active.drill);
  const current = baseCurrent && active ? { ...baseCurrent, name: active.name ?? baseCurrent.name, settings: active.settings ?? baseCurrent.settings } : baseCurrent;
  return <div className="shell">
    <Sidebar activeSection={section} onSectionChange={onSectionChange} profile={profile} onEditProfile={onEditProfile} />
    <main className="trainer-page" ref={mainRef}>
      {section === "弱点"
        ? <Weakness history={history}
            onStart={() => { setPhase("library"); onSectionChange("トレーナー"); }}
            onStartReview={() => start(reviewDrill, true)}
            onClear={() => { if (window.confirm("回答履歴をすべて消しますか？")) { clearHistory(); setHistory([]); } }} />
        : section === "プレー分析" ? <PlayerAnalysis history={history} onStart={() => { setPhase("library"); onSectionChange("トレーナー"); }} onOpenWeakness={() => onSectionChange("弱点")} />
        : section === "セッション" ? <SessionPage drills={drills} reviews={reviewSessions} drafts={drafts}
            onResume={session => start(session.kind === "review" ? reviewDrill : drills.find(drill => drill.id === session.drillId), session.kind === "review")} />
        : phase === "edit" && editing ? <DrillEditor drill={editing.drill} isNew={editing.isNew} reviewCount={reviewCount}
            onChange={drill => setEditing({ ...editing, drill })} onCancel={() => setPhase("library")}
            onSave={andStart => { const drill = { ...editing.drill, name: editing.drill.name.trim() }; commitDrills(upsertDrill(drills, drill)); if (andStart) start(drill); else setPhase("library"); }} />
        : phase === "ranking" && RANKED_ENABLED ? <Leaderboard rank={rankState} profile={profile} onBack={() => setPhase("library")} />
        : phase === "result" && result ? <SessionResult log={result.log} record={result.record} rank={result.rank} settings={current.settings} drill={active.review ? null : current}
            onRestart={active.ranked && (playedToday(rankState) >= RANKED_DAILY_LIMIT) ? null : () => start(current, active.review)} onLibrary={() => setPhase("library")} />
        : phase === "drill" && current ? <Drill key={run} history={history} onAnswer={onAnswer} settings={current.settings} drillName={current.name} reviewOnly={active.review}
            draftKey={activeDraftKey} initialDraft={activeDraft} onProgress={onProgress}
            onOpenSetup={() => setPhase("library")} onFinish={onFinish} length={active.ranked ? RANKED_LENGTH : undefined} />
        : <DrillLibrary drills={drills} reviewCount={reviewCount} drafts={drafts}
            rank={rankState} onStartRanked={() => start(RANKED_DRILL)} onOpenRanking={() => setPhase("ranking")}
            onStart={drill => start(drill)} onStartReview={() => start(reviewDrill, true)}
            onCreate={() => { setEditing({ drill: { id: newDrillId(), name: "", settings: normalizeSettings({}, profile?.level), sessions: [], createdAt: Date.now() }, isNew: true }); setPhase("edit"); }}
            onEdit={drill => { setEditing({ drill, isNew: false }); setPhase("edit"); }}
            onDelete={drill => { if (window.confirm(`「${drill.name}」と記録を削除しますか？`)) { commitDrills(drills.filter(item => item.id !== drill.id)); discardProgress(drill.id); } }} />}
    </main>
  </div>;
}
