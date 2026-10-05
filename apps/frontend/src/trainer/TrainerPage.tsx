import type { CSSProperties } from "react";
import type { Profile } from "../profile.ts";
import type { AnswerEntry, Drill as SavedDrill, DrillDraft, DrillQuestion, GradedAnswer, IssuedMatch, NamedDrill, RankedMatch, SessionProgress, TrainerSettings, TrainerSpot } from "./types.ts";
type DrillAnswer = GradedAnswer & { action: string };
type SessionRecord = { stats: ReturnType<typeof drillStats>; isBest: boolean };
type ActiveDrill = { drill: NamedDrill; review: boolean; ranked: boolean; rankedMatch?: IssuedMatch; name: string; settings: TrainerSettings };
import { RankBadge } from "./RankBadge.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, CheckCircle, Fire, Trash, Trophy, WarningCircle, XCircle } from "@phosphor-icons/react";
import { PlayingCard } from "../components/PlayingCard.tsx";
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
import { DrillLibrary, HistoryChart, TrainerHome } from "./DrillLibrary.tsx";
import { AgentTablePage } from "../agent/AgentTable.tsx";
import { PlayerAnalysis } from "./PlayerAnalysis.tsx";
import { SessionPage } from "./SessionPage.tsx";
import { loadReviewSessions, newSessionRecord, recordReviewSession } from "./practice-sessions.ts";
import { RANKED_LENGTH, RANKED_SETTINGS, emptyRankState, TIER_EN, tierFor } from "./rank-store.ts";
import { Leaderboard } from "./Leaderboard.tsx";
import "./trainer.css";
import { localized } from "../i18n.ts";
import { trainerPath, trainerRouteOf } from "../route.ts";
import { agentTableById } from "../agent/characters.ts";

const pct = (value: number | null | undefined) => `${Math.round((value ?? 0) * 100)}%`;
const RESULT_ICONS = { best: CheckCircle, mixed: WarningCircle, miss: XCircle };
const actionColor = (key: string) => barColor(key === "open" || key === "three_bet" ? "raise" : key);
const shortLabel = (action: { label: string }) => action.label.split(" ")[0];

// Seats clockwise from the hero, who always sits at the bottom centre (x%, y% of the felt).
const SEAT_SLOTS = [[50, 100], [5, 76], [13, 12], [50, -2], [87, 12], [95, 76]];
const BLINDS: Record<string, number> = { SB: 0.5, BB: 1 };

function seatStates(spot: TrainerSpot) {
  const heroIndex = POSITIONS.indexOf(spot.hero);
  return POSITIONS.map((position, index) => {
    const bet = position === spot.opener ? spot.openSize : BLINDS[position] ?? 0;
    const acted = index < heroIndex || (spot.opener && position === spot.opener);
    const state = position === spot.hero ? "hero" : position === spot.opener ? "raise" : index < heroIndex ? "fold" : "wait";
    return { position, bet, stack: +(100 - bet).toFixed(1), state, acted };
  });
}

// History strip: every action before the hero, then the hero's decision.
function ActionStrip({ spot, answer, actionLabels }: { spot: TrainerSpot; answer: DrillAnswer | null; actionLabels: Record<string, string> }) {
  const seats = seatStates(spot).filter(seat => seat.acted || seat.state === "hero");
  return <ol className="trainer-strip" aria-label="ここまでのアクション">
    {seats.map(seat => <li key={seat.position} className={`strip-${seat.state}${answer && seat.state === "hero" ? ` result-${answer.result}` : ""}`}>
      <span>{seat.position}</span><small>{seat.stack}</small>
      <b>{seat.state === "fold" ? "Fold" : seat.state === "raise" ? `Raise ${spot.openSize}` : answer ? actionLabels[answer.action] : "?"}</b>
    </li>)}
  </ol>;
}

function Verdict({ answer, bestLabel }: { answer: DrillAnswer; bestLabel: string | null }) {
  const Icon = RESULT_ICONS[answer.result];
  return <div className={`poker-verdict result-${answer.result}`} role="status">
    <strong><Icon size={18} weight="fill" />{RESULT_LABELS[answer.result]}</strong>
    <small>{answer.result === "best" ? `頻度 ${pct(answer.frequency)}` : `頻度 ${pct(answer.frequency)} · 最多は${bestLabel}`}</small>
  </div>;
}

function PokerTable({ spot, cards, hand, review, answer, bestLabel }: { spot: TrainerSpot; cards: string[]; hand: string; review: boolean; answer: DrillAnswer | null; bestLabel: string | null }) {
  const seats = seatStates(spot);
  const heroIndex = POSITIONS.indexOf(spot.hero);
  const pot = seats.reduce((sum, seat) => sum + seat.bet, 0);
  const slotOf = (index: number) => SEAT_SLOTS[(index - heroIndex + 6) % 6];
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
        style={{ left: `${x + (50 - x) * 0.36}%`, top: `${y + (50 - y) * 0.44}%` } as CSSProperties}><i />{seat.bet}<small>bb</small></span>;
    })}
    {seats.map((seat, index) => {
      const [x, y] = slotOf(index);
      return <div key={seat.position} className={`poker-seat seat-${seat.state}${answer ? " answered" : ""}`} style={{ left: `${x}%`, top: `${y}%` } as CSSProperties}>
        <span className="poker-seat-disc"><b>{seat.position}</b><small>{seat.state === "fold" ? "Fold" : seat.stack}</small></span>
        {seat.position === "BTN" && <span className="poker-dealer">D</span>}
        {seat.state === "hero" && <span className="poker-hole" key={hand + cards.join("")} aria-label={`あなたのハンド ${hand}`}>
          {cards.map(card => <PlayingCard key={card} card={card} />)}
        </span>}
      </div>;
    })}
  </div>;
}

function MixBar({ spot, mix }: { spot: TrainerSpot; mix: Record<string, number> | undefined }) {
  return <span className="trainer-mix" aria-hidden="true">
    {spot.actions.filter(action => mix?.[action.key]! > 0).map(action =>
      <i key={action.key} style={{ width: pct(mix![action.key]), background: actionColor(action.key) } as CSSProperties} />)}
  </span>;
}

function Comparison({ spot, hand }: { spot: TrainerSpot; hand: string }) {
  const rows = compareAcross(spot, hand);
  return <section className="trainer-compare">
    <h3>{spot.kind === "open" ? localized(`${hand} · opening frequency by seat`, `${hand} · 席ごとのオープン`) : localized(`${hand} · versus each opener from ${spot.hero}`, `${hand} · ${spot.hero} で相手の席ごとに`)}</h3>
    <ul>
      {rows.map(row => <li key={row.spot.id} className={row.current ? "current" : ""}>
        <span>{spot.kind === "open" ? row.spot.hero : `vs ${row.spot.opener}`}</span>
        <MixBar spot={row.spot} mix={row.mix} />
        <b>{row.mix ? row.spot.actions.filter(action => row.mix![action.key] >= 0.005).map(action => `${shortLabel(action)} ${pct(row.mix![action.key])}`).join(" · ") : "—"}</b>
      </li>)}
    </ul>
  </section>;
}

function SessionPanel({ session, history }: { session: SessionProgress; history: AnswerEntry[] }) {
  const recent = history.slice(-8).reverse();
  return <div className="trainer-session-panel">
    <div className="session-score">
      <div className="session-ring" style={{ "--rate": session.answered ? session.score / session.answered : 0 } as CSSProperties}>
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
import { rankedRequest } from "./ranked-api.ts";
import { accountSnapshot, subscribeAccount } from "../account/session.ts";

const RANKED_DRILL = Object.freeze({ id: "ranked", name: "ランク戦", settings: RANKED_SETTINGS });

function Segmented({ options, value, onChange, label }: { options: { value: string; label: string; hint?: string }[]; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="setup-segmented" role="radiogroup" aria-label={label}>
    {options.map(option => <button type="button" role="radio" key={option.value} aria-checked={value === option.value}
      className={value === option.value ? "on" : ""} onClick={() => onChange(option.value)}>
      <strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}
    </button>)}
  </div>;
}

function DrillEditor({ drill, isNew, onChange, onSave, onCancel, reviewCount }: { drill: SavedDrill; isNew: boolean; onChange: (drill: SavedDrill) => void; onSave: (start: boolean) => void; onCancel: () => void; reviewCount: number }) {
  const settings = drill.settings;
  const setSettings = (next: TrainerSettings) => onChange({ ...drill, settings: next });
  const spots = spotsForSettings(settings);
  const toggle = (key: "kinds" | "positions", value: string) => {
    const current = settings[key];
    const nextValues = current.includes(value) ? current.filter(item => item !== value) : [...current, value];
    if (nextValues.length) setSettings({ ...settings, [key]: nextValues });
  };
  // Positions with no spot for the chosen kinds (e.g. BB never opens, UTG never faces an open).
  const positionAvailable = (position: string) => SPOTS.some(spot => settings.kinds.includes(spot.kind) && spot.hero === position);
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
        {spots.length ? <>対象 <b>{spots.length}</b> 局面 · {SESSION_LENGTH}問 · {DIFFICULTY_OPTIONS.find(item => item.value === settings.difficulty)!.label}</> : "この組み合わせでは出題できる局面がありません"}
      </span>
      <button type="button" className="setup-secondary" onClick={() => onSave(false)} disabled={!spots.length || !drill.name.trim()}>保存</button>
      <button type="button" className="setup-start" onClick={() => onSave(true)} disabled={!spots.length || !drill.name.trim()}>保存して開始<ArrowRight size={17} weight="bold" /></button>
    </div>
  </div>;
}

function SessionResult({ log, settings, drill, record, rank, onRestart, onLibrary }: { log: AnswerEntry[]; settings: TrainerSettings; drill: NamedDrill | null; record: SessionRecord | null; rank?: RankedMatch; onRestart?: (() => void) | null; onLibrary: () => void }) {
  const answered = log.length;
  const score = log.reduce((sum, item) => sum + item.score, 0);
  const counts = { best: 0, mixed: 0, miss: 0 };
  for (const item of log) counts[item.result]++;
  const misses = log.filter(item => item.result === "miss");
  return <div className="trainer-result">
    <div className="result-hero">
      <div className="session-ring large" style={{ "--rate": answered ? score / answered : 0 } as CSSProperties}><strong>{answered ? pct(score / answered) : "—"}</strong><small>正答率</small></div>
      <div>
        <h1>{answered ? score / answered >= 0.8 ? "よくできました" : score / answered >= 0.6 ? "もう一歩" : "復習しましょう" : "おつかれさまでした"}</h1>
        <p>{drill ? <b className="result-drill" translate="no">{displayDrillName(drill)}</b> : "復習ドリル"} · {answered}問 · {DIFFICULTY_OPTIONS.find(item => item.value === settings.difficulty)!.label} · 判定{STRICTNESS_OPTIONS.find(item => item.value === settings.strictness)!.label}</p>
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
          <div><dt>前回</dt><dd>{record.stats.previous == null ? "—" : pct(record.stats.previous)}{record.stats.previous != null && <small className={record.stats.last! >= record.stats.previous ? "up" : "down"}>{record.stats.last! >= record.stats.previous ? "▲" : "▼"}{Math.abs(Math.round((record.stats.last! - record.stats.previous) * 100))}</small>}</dd></div>
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
        const spot = spotById.get(item.spotId)!;
        const best = spot.actions.find(action => action.key === item.best);
        const chosen = spot.actions.find(action => action.key === item.action);
        return <li key={index}>
          <span className="result-cards">{item.cards!.map(card => <PlayingCard key={card} card={card} size="mini" />)}</span>
          <span className="result-spot">{spotTitle(spot)}</span>
          <span className="result-choice">あなた <b className="bad">{shortLabel(chosen!)}</b> → 最多 <b className="good">{shortLabel(best!)} {pct(item.mix![item.best!])}</b></span>
        </li>;
      })}</ul>
    </section>}
    <div className="setup-footer">
      <button type="button" className="setup-secondary" onClick={onLibrary}>ドリル一覧へ</button>
      {onRestart && <button type="button" className="setup-start" onClick={onRestart}>もう一度挑戦<ArrowClockwise size={17} weight="bold" /></button>}
    </div>
  </div>;
}

function RankResult({ rank }: { rank: RankedMatch }) {
  const delta = rank.after - rank.before;
  const tier = tierFor(rank.after);
  const promoted = tierFor(rank.before).name !== tier.name;
  return <section className="rank-result">
    <RankBadge name={tier.name} size={80} />
    <div><small>レート</small><strong>{rank.after}</strong>
      <span className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "▲" : "▼"}{Math.abs(delta)}</span></div>
    <div><small>ランク</small><strong>{tier.name}</strong>{promoted && <span className={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "昇格" : "降格"}</span>}</div>
    <p>{tier.next ? localized(`${tier.next.min - rank.after} to ${localized((TIER_EN as Readonly<Record<string, string>>)[tier.next.name], tier.next.name)}`, `${tier.next.name}まで あと${tier.next.min - rank.after}`) : "最高ランクです"}</p>
  </section>;
}

function Drill({ history, onAnswer, settings, drillName, reviewOnly, draftKey, initialDraft, onProgress, onOpenSetup, onFinish, length = SESSION_LENGTH, rankedMatch = null }: { history: AnswerEntry[]; onAnswer: (entry: AnswerEntry) => void; settings: TrainerSettings; drillName: string; reviewOnly: boolean; draftKey: string; initialDraft?: DrillDraft | null; onProgress: (draft: Partial<DrillDraft>) => void; onOpenSetup: () => void; onFinish: (log: AnswerEntry[], duration: number) => void; length?: number; rankedMatch?: IssuedMatch | null }) {
  const spots = useMemo(() => spotsForSettings(settings), [settings]);
  // Keep just-answered hands out of the review queue so a miss is not re-asked immediately.
  const review = useMemo(() => {
    const recent = new Set(history.slice(-6).map(item => `${item.spotId}|${item.hand}`));
    const all = summarize(history).review;
    const cooled = all.filter(item => !recent.has(`${item.spotId}|${item.hand}`));
    return reviewOnly && !cooled.length ? all : cooled;
  }, [history, reviewOnly]);
  const next = useCallback((index = 0) => {
    if (rankedMatch) {
      const issued = rankedMatch.questions[index];
      const base = spotById.get(issued.spotId)!;
      const spot = { ...base, byHand: new Map(base.byHand).set(issued.hand, issued.mix) };
      return { spot, hand: issued.hand, cards: randomSuits(issued.hand), review: false };
    }
    const question = reviewOnly && review.length
      ? pickQuestion(filterSpots(), () => 0, [...review].sort(() => Math.random() - 0.5))
      : pickQuestion(spots.length ? spots : filterSpots(), Math.random, settings.review ? review : [], 0.25, settings.difficulty);
    return { ...question, cards: randomSuits(question.hand) };
  }, [spots, review, reviewOnly, settings, rankedMatch]);
  const [restored] = useState(() => restoreDrillDraft(initialDraft));
  const [startedAt] = useState(() => Date.now() - (restored?.elapsedMs ?? 0));
  const [question, setQuestion] = useState<DrillQuestion>(() => restored?.question ?? next());
  const [answer, setAnswer] = useState<DrillAnswer | null>(() => restored?.answer ?? null);
  const [session, setSession] = useState<SessionProgress>(() => restored?.session ?? { answered: 0, score: 0, streak: 0, bestStreak: 0, results: [], log: [] });
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const limit = length;
  const lastQuestion = limit > 0 && session.answered >= limit;

  // Time of the last answer, so a double click on an action doesn't also press its Next.
  const answeredAt = useRef(0);
  const choose = useCallback((action: string) => {
    if (answer) return;
    answeredAt.current = Date.now();
    const graded = grade(question.spot, question.hand, action, { strictness: settings.strictness });
    setAnswer({ action, ...graded });
    setSelectedHand(question.hand);
    setSession(current => {
      const streak = graded.result === "miss" ? 0 : current.streak + 1;
      return { answered: current.answered + 1, score: current.score + graded.score, streak,
        bestStreak: Math.max(current.bestStreak, streak), results: [...current.results, graded.result].slice(-10),
        log: [...current.log, { spotId: question.spot.id, hand: question.hand, cards: question.cards, action, result: graded.result, score: graded.score, best: graded.best, mix: graded.mix }] };
    });
    if (!rankedMatch) onAnswer({ spotId: question.spot.id, hand: question.hand, action, result: graded.result, score: graded.score, at: Date.now() });
  }, [answer, question, settings, onAnswer, rankedMatch]);

  const advance = useCallback(() => {
    if (lastQuestion) { onFinish(session.log, Date.now() - startedAt); return; }
    setQuestion(next(session.answered)); setAnswer(null);
  }, [next, lastQuestion, onFinish, session.log]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
        <strong className="config-name" translate="no">{reviewOnly ? localized("Review drill", "復習ドリル") : displayDrillName({ id: draftKey, name: drillName })}</strong>
        {reviewOnly ? null : <>
          <span className="config-chip">{settings.kinds.length === 2 ? "オープン＋vs オープン" : KIND_OPTIONS.find(item => item.value === settings.kinds[0])!.label}</span>
          <span className="config-chip">{settings.positions.length === POSITIONS.length ? "全席" : settings.positions.join("・")}</span>
          <span className="config-chip">{DIFFICULTY_OPTIONS.find(item => item.value === settings.difficulty)!.label}</span>
        </>}
        <button type="button" className="config-edit" onClick={onOpenSetup}><ArrowLeft size={14} />一覧</button>
      </div>
      {limit > 0 && <div className="trainer-progress" aria-label={`${session.answered} / ${limit} 問`}>
        <span><b>{Math.min(session.answered + (answer ? 0 : 1), limit)}</b> / {limit}</span>
        <i style={{ "--progress": progress } as CSSProperties} />
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
            bestLabel={answer && shortLabel(spot.actions.find(action => action.key === answer.best)!)} />
        </div>
        <div className="stage-footer">
        <div className="trainer-actions">
          {spot.actions.map((action, index) => {
            const state = !answer ? "" : action.key === answer.action ? ` chosen ${answer.result}` : action.key === answer.best ? " best" : "";
            // The answered button turns into "Next" so the cursor can stay where it clicked.
            const isNext = Boolean(answer) && action.key === answer!.action;
            return <button type="button" key={action.key} className={`trainer-action action-${action.key}${state}${isNext ? " is-next" : ""}`}
              onClick={() => isNext ? (Date.now() - answeredAt.current > 350 && advance()) : choose(action.key)} disabled={Boolean(answer) && !isNext}
              style={{ "--action-color": actionColor(action.key), "--freq": answer ? answer.mix[action.key] : 0 } as CSSProperties}>
              <kbd>{index + 1}</kbd><span>{action.label}</span>
              {answer && <b>{pct(answer.mix[action.key])}</b>}
              {isNext && <em className="trainer-action-next">{lastQuestion ? "結果へ" : "次へ"}<ArrowRight size={13} weight="bold" /></em>}
            </button>;
          })}
        </div>
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
                {notes.map(action => <li key={action.key} style={{ "--note-color": actionColor(action.key) } as CSSProperties}>
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

function RateList({ title, items }: { title: string; items: ReturnType<typeof summarize>["bySpot"] }) {
  return <Panel className="weak-list"><SectionHeading title={title} />
    {items.length ? <ul>{items.map(item => <li key={item.key}>
      <span>{item.label}</span>
      <span className="weak-bar" aria-hidden="true"><i style={{ width: pct(item.rate), background: item.rate >= 0.8 ? "#4fa865" : item.rate >= 0.6 ? "#d9a441" : "#d9477f" } as CSSProperties} /></span>
      <b>{pct(item.rate)}</b><small>{item.answered}問</small>
    </li>)}</ul> : <p className="trainer-empty">まだ回答がありません。</p>}
  </Panel>;
}

function Weakness({ history, onStartReview, onStart, onClear }: { history: AnswerEntry[]; onStartReview: () => void; onStart: () => void; onClear: () => void }) {
  const stats = useMemo(() => summarize(history), [history]);
  if (!stats.answered) return <Panel className="weak-empty">
    <h2>まだ回答がありません</h2>
    <p>トレーナーで問題を解くと、局面ごと・ハンドの種類ごとの正答率と、復習すべきハンドがここに並びます。</p>
    <button type="button" className="trainer-next" onClick={onStart}>トレーナーを始める<ArrowRight size={15} /></button>
  </Panel>;
  return <div className="weak-layout">
    <div className="weak-summary">
      <div className="session-ring" style={{ "--rate": stats.rate } as CSSProperties}><strong>{pct(stats.rate)}</strong><small>正答率</small></div>
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

export function TrainerPage({ profile, onEditProfile, onSectionChange, section = "トレーナー", path = "/trainer", onNavigate = (_path: string, _replace?: boolean) => {} }: { profile: Profile; onEditProfile?: () => void; onSectionChange: (name: string) => void; section?: string; path?: string; onNavigate?: (path: string, replace?: boolean) => void }) {
  const [history, setHistory] = useState(loadHistory);
  const [drills, setDrills] = useState(() => loadDrills(profile?.level));
  const [drafts, setDrafts] = useState(loadDrillDrafts);
  const [reviewSessions, setReviewSessions] = useState(loadReviewSessions);
  const [active, setActive] = useState<ActiveDrill | null>(null); // { drill, review }
  const [editing, setEditing] = useState<{ drill: SavedDrill; isNew: boolean } | null>(null); // { drill, isNew }
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<{ log: AnswerEntry[]; record: SessionRecord | null; rank?: RankedMatch } | null>(null);
  const [rankState, setRankState] = useState(emptyRankState);
  const [rankedReady, setRankedReady] = useState(false);
  const [rankedError, setRankedError] = useState("");
  const [rankedBusy, setRankedBusy] = useState(false);
  const [account, setAccount] = useState(accountSnapshot);
  useEffect(() => subscribeAccount(() => setAccount(accountSnapshot())), []);
  useEffect(() => {
    let canceled = false;
    setRankedReady(false); setRankState(emptyRankState()); setActive(null); setResult(null);
    if (!account.ready || !account.user?.verified || account.error) return;
    rankedRequest("profile").then(response => {
      if (!canceled) { setRankState(response.state); setRankedReady(response.enabled); setRankedError(""); }
    }).catch(() => { if (!canceled) setRankedError(localized("Ranked is unavailable. Your local records do not count toward rankings.", "ランク戦は現在利用できません。ローカル記録はランキングに反映されません。")); });
    return () => { canceled = true; };
  }, [account.ready, account.user?.id, account.error]);
  // The trainer's sub-page lives in the URL (see route.ts); the state below only holds what the
  // page needs, and is rebuilt from the URL after a reload.
  const route = section === "トレーナー" ? trainerRouteOf(path) : { phase: "library" as const };
  const phase = route.phase === "new" || route.phase === "edit" ? "edit" : route.phase;
  const agentTable = route.phase === "agent" ? { tableId: route.tableId, watch: route.watch } : null;
  const keyOf = (value: { drill: { id: string }, review?: boolean, ranked?: boolean }) => value.ranked ? "ranked" : value.review ? "review" : value.drill.id;
  const setPhase = (next: "library" | "drills" | "ranking", replace = false) => onNavigate(trainerPath({ phase: next }), replace);
  const newDrill = () => ({ drill: { id: newDrillId(), name: "", settings: normalizeSettings({}, profile?.level), sessions: [], createdAt: Date.now() }, isNew: true });
  const reviewCount = useMemo(() => summarize(history).review.length, [history]);
  const onAnswer = useCallback((entry: AnswerEntry) => setHistory(current => { const updated = [...current, entry]; saveHistory(updated); return updated; }), []);
  const commitDrills = (next: SavedDrill[]) => { setDrills(next); saveDrills(next); };
  const onProgress = useCallback((draft: Partial<DrillDraft>) => setDrafts(current => saveDrillDraft(current, draft)), []);
  const discardProgress = useCallback((key: string) => setDrafts(current => removeDrillDraft(current, key)), []);
  const begin = (drill: NamedDrill, review = false) => {
    const saved = drafts[review ? "review" : drill.id];
    setActive({ drill, review, ranked: drill.id === RANKED_DRILL.id, name: saved?.drillName ?? drill.name, settings: saved?.settings ?? drill.settings });
    setRun(value => value + 1);
  };
  const start = async (drill: NamedDrill, review = false) => {
    if (drill.id === "ranked") {
      if (!rankedReady || rankedBusy) return;
      if (!rankState.active && !window.confirm(localized("Start a public ranked match? Your anonymous Player name, rating and practice results appear on the leaderboard. Each start uses one of 3 daily attempts (reset 00:00 UTC), even if abandoned. Ratings reflect the saved AI estimate, not GTO or win rate.", "公開ランク戦を開始しますか？匿名のPlayer名・レート・練習結果がランキングに公開されます。開始すると中断しても1日3回の枠を消費します（UTC 0時リセット）。レートはAI推定との一致を示し、GTOや勝率ではありません。"))) return;
      setRankedBusy(true); setRankedError("");
      try {
        const response = await rankedRequest("matches", { consent: true });
        if (response.match.questions.some(q => !spotById.get(q.spotId)?.byHand.has(q.hand))) throw new Error("dataset");
        setRankState(response.state);
        setActive({ drill, review: false, ranked: true, rankedMatch: response.match, name: drill.name, settings: drill.settings });
        setRun(value => value + 1);
        onNavigate(trainerPath({ phase: "drill", key: "ranked" }));
      } catch { setRankedError(localized("Could not start ranked. Try again after checking your connection and daily limit.", "ランク戦を開始できませんでした。接続と本日の残り回数を確認してください。")); }
      finally { setRankedBusy(false); }
      return;
    }
    begin(drill, review);
    onNavigate(trainerPath({ phase: "drill", key: drill.id === RANKED_DRILL.id ? "ranked" : review ? "review" : drill.id }));
  };
  const reviewDrill = useMemo(() => ({ id: "review", name: "復習ドリル", settings: normalizeSettings({ count: Math.min(20, Math.max(reviewCount, 1)) }, profile?.level) }), [reviewCount, profile]);
  const onFinish = useCallback(async (log: AnswerEntry[], durationMs: number) => {
    discardProgress(active!.review ? "review" : active!.drill.id);
    let record: SessionRecord | null = null;
    if (active!.ranked) {
      if (rankedBusy) return;
      setRankedBusy(true); setRankedError("");
      try {
        const response = await rankedRequest(`matches/${active!.rankedMatch!.id}/finish`, { actions: log.map(item => item.action) });
        setRankState(response.state);
        setResult({ log, record: null, rank: response.match });
        onNavigate(trainerPath({ phase: "result", key: keyOf(active!) }), true);
      } catch { setRankedError(localized("Result not confirmed. Stay here and press Finish again to retry; no local rating is awarded.", "結果を確認できませんでした。この画面で完了を再度押して確認してください。ローカルでレートは付与しません。")); }
      finally { setRankedBusy(false); }
      return;
    }
    if (log.length) {
      const session = newSessionRecord(log, durationMs);
      if (active!.review) setReviewSessions(current => recordReviewSession(current, session));
      else {
        const before = drillStats(drills.find(drill => drill.id === active!.drill.id));
        const next = recordSession(drills, active!.drill.id, session);
        commitDrills(next);
        const stats = drillStats(next.find(drill => drill.id === active!.drill.id));
        record = { stats, isBest: before.best == null ? false : stats.last! > before.best };
      }
    }
    setResult({ log, record });
    onNavigate(trainerPath({ phase: "result", key: keyOf(active!) }), true);
  }, [active, drills, discardProgress, rankState, onNavigate, rankedBusy]); // eslint-disable-line react-hooks/exhaustive-deps
  // After a reload (or back/forward) the URL can name a page whose state is gone: rebuild it,
  // or fall back to the nearest page that needs none.
  useEffect(() => {
    if (route.phase === "new" && !editing?.isNew) setEditing(newDrill());
    if (route.phase === "edit" && editing?.drill.id !== route.id) {
      const drill = drills.find(item => item.id === route.id);
      if (drill) setEditing({ drill, isNew: false }); else setPhase("drills", true);
    }
    if (route.phase === "drill" && (!active || keyOf(active!) !== route.key)) {
      const drill = route.key === "ranked" ? RANKED_DRILL : route.key === "review" ? reviewDrill : drills.find(item => item.id === route.key);
      const rankedClosed = route.key === "ranked" && !rankedReady;
      if (drill && !rankedClosed) { if (route.key === "ranked") start(drill); else begin(drill, route.key === "review"); } else setPhase(route.key === "ranked" || !drill ? "library" : "drills", true);
    }
    if (route.phase === "agent" && !agentTableById(route.tableId)) setPhase("library", true);
    if (route.phase === "result" && (!result || !active || keyOf(active!) !== route.key)) setPhase(route.key === "ranked" ? "library" : "drills", true);
  }, [path, section, rankedReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.scrollTo?.(0, 0); window.scrollTo?.(0, 0); }, [phase, section]);
  const activeDraftKey = active && (active!.review ? "review" : active!.drill.id);
  const activeDraft = activeDraftKey ? drafts[activeDraftKey] : null;
  const baseCurrent = active && (active!.review ? reviewDrill : drills.find(drill => drill.id === active!.drill.id) ?? active!.drill);
  const current = baseCurrent && active ? { ...baseCurrent, name: active!.name ?? baseCurrent.name, settings: active!.settings ?? baseCurrent.settings } : baseCurrent;
  return <div className="shell">
    <Sidebar activeSection={section} onSectionChange={onSectionChange} profile={profile} onEditProfile={onEditProfile} />
    <main className="trainer-page" ref={mainRef}>
      {rankedError && <p role="alert">{rankedError}</p>}
      {rankedBusy && <p role="status">{localized("Confirming with ranked server…", "ランク戦サーバーに確認中…")}</p>}
      {section === "弱点"
        ? <Weakness history={history}
            onStart={() => { setPhase("library"); }}
            onStartReview={() => start(reviewDrill, true)}
            onClear={() => { if (window.confirm(localized("Clear all answer history?", "回答履歴をすべて消しますか？"))) { clearHistory(); setHistory([]); } }} />
        : section === "プレー分析" ? <PlayerAnalysis rank={rankState} rankedReady={rankedReady} history={history} onStart={() => { setPhase("library"); }} onOpenWeakness={() => onSectionChange("弱点")} />
        : section === "セッション" ? <SessionPage drills={drills} reviews={reviewSessions} drafts={drafts}
            onResume={session => start(session.kind === "review" ? reviewDrill : drills.find(drill => drill.id === session.drillId)!, session.kind === "review")} />
        : phase === "edit" && editing ? <DrillEditor drill={editing.drill} isNew={editing.isNew} reviewCount={reviewCount}
            onChange={drill => setEditing({ ...editing, drill })} onCancel={() => setPhase("drills")}
            onSave={andStart => { const drill = { ...editing.drill, name: editing.drill.name.trim() }; commitDrills(upsertDrill(drills, drill)); if (andStart) start(drill); else setPhase("drills"); }} />
        : phase === "agent" && agentTable && agentTableById(agentTable.tableId) ? <AgentTablePage key={`${agentTable.tableId}-${agentTable.watch}`} tableId={agentTable.tableId} watch={agentTable.watch} onExit={() => setPhase("library")} />
        : phase === "ranking" && rankedReady ? <Leaderboard rank={rankState} profile={profile} onBack={() => setPhase("library")} />
        : phase === "result" && result ? <SessionResult log={result.log} record={result.record} rank={result.rank} settings={current!.settings} drill={active!.review ? null : current!}
            onRestart={active!.ranked && (rankState.remaining === 0) ? null : () => start(current!, active!.review)} onLibrary={() => setPhase(active!.ranked ? "library" : "drills")} />
        : phase === "drill" && current ? <Drill key={run} history={history} onAnswer={onAnswer} settings={current!.settings} drillName={current!.name} reviewOnly={active!.review}
            draftKey={activeDraftKey!} initialDraft={active!.ranked ? null : activeDraft} onProgress={active!.ranked ? () => {} : onProgress} rankedMatch={active!.rankedMatch}
            onOpenSetup={() => setPhase(active!.ranked ? "library" : "drills")} onFinish={onFinish} length={active!.ranked ? RANKED_LENGTH : undefined} />
        : phase === "drills" ? <DrillLibrary drills={drills} reviewCount={reviewCount} drafts={drafts} onBack={() => setPhase("library")}
            onStart={drill => start(drill)} onStartReview={() => start(reviewDrill, true)}
            onCreate={() => { setEditing(newDrill()); onNavigate(trainerPath({ phase: "new" })); }}
            onEdit={drill => { setEditing({ drill, isNew: false }); onNavigate(trainerPath({ phase: "edit", id: drill.id })); }}
            onDelete={drill => { if (window.confirm(localized(`Delete “${drill.name}” and its records?`, `「${drill.name}」と記録を削除しますか？`))) { commitDrills(drills.filter(item => item.id !== drill.id)); discardProgress(drill.id); } }} />
        : <TrainerHome drills={drills} history={history} reviewCount={reviewCount} drafts={drafts} onOpenDrills={() => setPhase("drills")}
            onResume={key => key === "ranked" ? start(RANKED_DRILL) : key === "review" ? start(reviewDrill, true) : start(drills.find(drill => drill.id === key) ?? drills[0])}
            onCreate={() => { setEditing(newDrill()); onNavigate(trainerPath({ phase: "new" })); }} onStartReview={() => start(reviewDrill, true)}
            onStartAgent={(tableId, watch) => onNavigate(trainerPath({ phase: "agent", tableId, watch }))}
            rank={rankState} rankedReady={rankedReady} rankedBusy={rankedBusy} onStartRanked={() => start(RANKED_DRILL)} onOpenRanking={() => setPhase("ranking")} />}
    </main>
  </div>;
}
