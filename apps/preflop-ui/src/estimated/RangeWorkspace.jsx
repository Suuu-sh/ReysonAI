import { useMemo, useState, useEffect, useRef } from "react";
import { hands } from "../data.js";
import { AppFooter, Sidebar } from "../components/layout.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { ActionBars, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.jsx";
import source from "./preflop-ranges.json";
import openingSource from "./opening-ranges.json";
import { findFourBetSpot, fourBetMatrixModel, loadFourBetDataset } from "./four-bet-responses.js";
import threeBetSource from "./three-bet-responses.json";
import { findThreeBetSpot, threeBetMatrixModel, validateThreeBetDataset } from "./three-bet-responses.js";
import { findOpeningSpot, openingMatrixModel, validateOpeningDataset } from "./opening-ranges.js";
import { nextActorsAfterRaise } from "./action-path.js";
import {
  availableHeroes,
  findSpot,
  hasSpot,
  matrixModel,
  positions,
  rangeTypes,
  validateDataset,
} from "./ranges.js";
import "./ranges.css";

let dataset;
let dataError;
try { dataset = validateDataset(source); } catch (error) { dataError = error.message; }
let openingDataset;
let openingDataError;
try { openingDataset = validateOpeningDataset(openingSource); } catch (error) { openingDataError = error.message; }
let threeBetDataset;
let threeBetDataError;
try {
  if (dataError || openingDataError) throw new Error(dataError || openingDataError);
  threeBetDataset = validateThreeBetDataset(threeBetSource, dataset, openingDataset);
} catch (error) { threeBetDataError = error.message; }

// Raw glob keeps missing files and invalid JSON inside the explicit error boundary.
const fourBetFiles = import.meta.glob("./four-bet-responses.json", { eager: true, query: "?raw", import: "default" });
const fourBetState = loadFourBetDataset(fourBetFiles["./four-bet-responses.json"], dataset, threeBetDataset, openingDataset);

const selectionStorageKey = "solveagto:estimated-selection:v1";
function restoredSelection(initialRangeType) {
  const fallback = { rangeType: initialRangeType, opener: "BTN", hero: "BB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, pathExpanded: false, selected: "AKo" };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(selectionStorageKey));
    if (!saved || !rangeTypes.some(item => item.value === saved.rangeType && item.available) ||
        !positions.slice(0, -1).includes(saved.opener) || !positions.includes(saved.hero) ||
        positions.indexOf(saved.hero) <= positions.indexOf(saved.opener) ||
        !Array.isArray(saved.callers) || saved.callers.some(position => !positions.includes(position) || positions.indexOf(position) <= positions.indexOf(saved.opener)) ||
        new Set(saved.callers).size !== saved.callers.length) return fallback;
    const pendingRaise = saved.pendingRaise === "all_in" && saved.rangeType === "four_bet" ? "all_in" : saved.pendingRaise === "squeeze" && saved.rangeType === "response" && saved.callers.length ? "squeeze" : null;
    const continuationAction = (saved.rangeType === "three_bet" || saved.rangeType === "four_bet") && ["fold", "call"].includes(saved.continuationAction) ? saved.continuationAction : null;
    return { ...fallback, ...saved, pendingRaise, continuationAction, selected: hands.includes(saved.selected) ? saved.selected : fallback.selected };
  } catch { return fallback; }
}

function HandBreakdown({ title, hand, model, isOpening, isThreeBet, isFourBet, spot, position, onReturnToComparison }) {
  const aggregate = model.aggregates.get(hand.hand);
  const totalFrequency = isOpening
    ? hand.open + hand.fold
    : hand.fold + hand.call + (isFourBet ? hand.all_in : isThreeBet ? hand.four_bet : hand.three_bet);

  return <div className={`detail-column${onReturnToComparison ? " comparison-focus-details" : ""}`}>
    <Panel>
      <SectionHeading title={title} action={onReturnToComparison && <button type="button" onClick={onReturnToComparison}>詳細を閉じる</button>} />
      <div className="hand-title"><strong>{hand.hand}</strong><span>{aggregate.comboCount} Combos</span></div>
      {aggregate.unreachable ? <StatusState title="対象外（到達不能）">既存3bet頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。</StatusState> : <>
      {isFourBet && <small>オールイン = 5bet（合計100BB）</small>}
      <ActionBars items={model.actions.map(action => ({ action, frequency: aggregate.actions[action] }))} />
      <StatList items={[
        isOpening
          ? { label: "オープンサイズ（合計）", value: hand.open_size_bb === null ? "—（オープンなし）" : `${hand.open_size_bb} BB` }
          : isFourBet ? { label: "5betオールイン（合計）", value: hand.all_in_size_bb === null ? "—（5betなし）" : `${hand.all_in_size_bb} BB` }
          : isThreeBet ? { label: "4betサイズ（合計）", value: hand.four_bet_size_bb === null ? "—（4betなし）" : `${hand.four_bet_size_bb} BB` }
          : { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
        ...(isFourBet ? [{ label: "受ける4bet（合計）", value: `${spot.four_bet_size_bb} BB` }, { label: "元の3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        ...(isThreeBet ? [{ label: "受ける3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        { label: "頻度合計", value: `${totalFrequency}%` },
      ]} />
      </>}
    </Panel>
    <Panel className="ai-reason-copy"><SectionHeading title="この配分の理由" /><p>{hand.reason}</p></Panel>
    <Panel className="estimate-notes">
      <SectionHeading title="データの条件" />
      <small>{isOpening ? "Heroまで全員フォールドした未オープンポット。オープン／フォールドの推定です。" : isFourBet ? "Heroは元の3bettor。オープナーの4betに応答し、他の全員はフォールド。既に3betした条件下の頻度です。" : isThreeBet ? "Heroがオープン後、1人の3betを受け、他の全員がフォールドした局面。既にオープンした条件下の頻度です。" : "Heroまで他のプレイヤーは全員フォールド。対オープンではUTGはオープナーのみ。"}レーキ未調整・アンティなし。頻度は概算です。</small>
      {isThreeBet && <p><small>初回オープン0%のハンドは対象外（形式上フォールド100%）。この表はオープナーの判断です。4bet後の元の3bettorの応答は別局面で表示します。</small></p>}
      {isFourBet && <p><small>5betは合計100BBのオールインのみ。非オールイン5bet・コールド4bet・スクイーズは含みません。独立した推定であり、前段レンジとの同時均衡やEVは未計算です。</small></p>}
      {!isThreeBet && !isFourBet && position === "SB" && <p><small>{isOpening ? "SBは2.5BBのraise-or-foldに簡略化し、リンプは含めません。" : "SBは3bet-or-foldに簡略化しています。"}</small></p>}
      <details><summary>選択ハンドのJSON</summary><pre>{JSON.stringify(hand, null, 2)}</pre></details>
    </Panel>
  </div>;
}

function LocalHandBreakdown({ entry, selected, onClose }) {
  const aggregate = entry.model.aggregates.get(selected);
  return <div className="detail-column comparison-focus-details"><Panel>
    <SectionHeading title={`${entry.position} · ${selected}の詳細`} action={<button type="button" onClick={onClose}>詳細を閉じる</button>} />
    <div className="hand-title"><strong>{selected}</strong><span>{aggregate.comboCount} Combos</span></div>
    <ActionBars items={entry.model.actions.map(action => ({ action, frequency: aggregate.actions[action] }))} />
    <StatList items={[{ label: "レイズ先（合計）", value: `${entry.raiseToBb} BB` }, { label: "頻度合計", value: "100%" }]} />
    <small>ローカル保存済みのAI推定です。ソルバー計算・GTO検証ではありません。</small>
  </Panel></div>;
}

export function ActionPath({ expanded, rangeType, opener, hero, spot, callers, foldedHero, raiseToBb, pendingRaise, continuationAction, onOpenerChange, onHeroChange, onCall, onFold, onThreeBet, onFourBet, onAllIn, onContinuationAction }) {
  const opening = rangeType === "open";
  const openerIndex = positions.indexOf(opener);
  const heroIndex = opening ? openerIndex : positions.indexOf(hero);
  const threeBetSizeBb = spot?.three_bet_size_bb ?? spot?.hands?.find(row => row.three_bet_size_bb !== null)?.three_bet_size_bb;
  const fourBetSizeBb = spot?.four_bet_size_bb;
  const pendingActors = pendingRaise === "squeeze" ? nextActorsAfterRaise(hero, [opener, ...callers]) : pendingRaise === "all_in" ? [opener] : [];
  const seatsRef = useRef(null);
  useEffect(() => {
    const seats = seatsRef.current;
    if (seats) seats.scrollTo({ left: rangeType === "three_bet" || rangeType === "four_bet" || pendingRaise ? seats.scrollWidth : 0, behavior: "smooth" });
  }, [rangeType, pendingRaise]);
  const actionFor = (position, index) => {
    if (index < openerIndex) return "Fold";
    if (index === openerIndex) return "Raise 2.5";
    if (opening) return "Take action";
    if (callers.includes(position)) return "Call";
    if (index < heroIndex) return "Fold";
    if (index === heroIndex && foldedHero) return "Fold";
    if (index === heroIndex) return rangeType === "four_bet" || rangeType === "three_bet" ? `3bet ${spot?.three_bet_size_bb ?? "—"}BB` : pendingRaise === "squeeze" ? `スクイーズ ${raiseToBb ?? "—"}BB` : "Take action";
    return rangeType === "response" ? "—" : "Fold";
  };

  return <div className={`action-path ${expanded ? "expanded" : "collapsed"}`} aria-label="アクション履歴">
    <div className="action-path-seats" ref={seatsRef}>
      {positions.map((position, index) => {
        const canOpen = index < positions.length - 1;
        const canRespond = index > openerIndex && (opening || rangeType === "response" || index === heroIndex);
        const isActive = !pendingRaise && (opening ? index === openerIndex : rangeType === "response" && index === heroIndex) && !foldedHero && !callers.includes(position);
        return <div className={`action-seat${isActive ? " active" : ""}`} key={position}>
          <div className="action-seat-heading"><strong>{position}</strong><span>{index === 4 ? "99.5" : index === 5 ? "99" : "100"}</span></div>
          {expanded ? <div className="action-seat-options">
            {index < openerIndex && <span className="action-seat-choice chosen">Fold</span>}
            {canOpen && index <= openerIndex && <button type="button" className={index === openerIndex ? "chosen" : ""} onClick={() => onOpenerChange(position)}>Raise 2.5</button>}
            {canOpen && index > openerIndex && <button type="button" className="action-seat-reset" onClick={() => onOpenerChange(position)}>ここからオープン</button>}
            {!opening && rangeType !== "response" && index > openerIndex && index !== heroIndex && <span className="action-seat-choice chosen">Fold</span>}
            {canRespond && rangeType === "response" && <button type="button" className={actionFor(position, index) === "Fold" ? "chosen" : ""} onClick={() => onFold(position)}>Fold</button>}
            {canRespond && rangeType === "response" && <button type="button" className={callers.includes(position) ? "chosen" : ""} onClick={() => onCall(position)}>Call</button>}
            {canRespond && (opening || rangeType === "response") && <button type="button" className={isActive ? "chosen" : ""} onClick={() => onHeroChange(position)}>Take action</button>}
            {rangeType === "response" && index === heroIndex && !callers.includes(position) && !foldedHero && <button type="button" className={pendingRaise === "squeeze" ? "chosen" : ""} onClick={onThreeBet}>{callers.length ? `スクイーズ ${raiseToBb ?? "—"}BB` : `3bet ${threeBetSizeBb ?? "—"}BB`}</button>}
            {(rangeType === "three_bet" || rangeType === "four_bet") && index === heroIndex && <span className="action-seat-choice chosen">3bet {spot?.three_bet_size_bb ?? "—"}BB</span>}
            {opening && index === openerIndex && <span className="action-seat-choice chosen">Hero</span>}
            {!canOpen && !canRespond && index > heroIndex && <span className="action-seat-choice muted">—</span>}
          </div> : <button type="button" className="action-seat-summary" disabled={index < openerIndex || index > heroIndex && !canRespond} onClick={() => index <= openerIndex ? onOpenerChange(position) : onHeroChange(position)}>{actionFor(position, index)}</button>}
        </div>;
      })}
      {(rangeType === "three_bet" || rangeType === "four_bet") && <div className={`action-seat action-seat-continuation${rangeType === "three_bet" && !continuationAction ? " active" : ""}`}>
        <div className="action-seat-heading"><strong>{opener}</strong><span>3betへの応答</span></div>
        {expanded && rangeType === "three_bet" ? <div className="action-seat-options">
          <button type="button" className={continuationAction === "fold" ? "chosen" : ""} onClick={() => onContinuationAction("fold")}>Fold</button>
          <button type="button" className={continuationAction === "call" ? "chosen" : ""} onClick={() => onContinuationAction("call")}>Call</button>
          <button type="button" onClick={onFourBet}>4bet {fourBetSizeBb ?? "—"}BB</button>
        </div> : <span className="action-seat-summary">{rangeType === "four_bet" ? `4bet ${fourBetSizeBb ?? "—"}BB` : continuationAction ? continuationAction === "call" ? "Call" : "Fold" : "Take action"}</span>}
      </div>}
      {rangeType === "four_bet" && <div className={`action-seat action-seat-continuation${!continuationAction && !pendingRaise ? " active" : ""}`}>
        <div className="action-seat-heading"><strong>{hero}</strong><span>4betへの応答</span></div>
        {expanded ? <div className="action-seat-options">
          <button type="button" className={continuationAction === "fold" ? "chosen" : ""} onClick={() => onContinuationAction("fold")}>Fold</button>
          <button type="button" className={continuationAction === "call" ? "chosen" : ""} onClick={() => onContinuationAction("call")}>Call</button>
          <button type="button" className={pendingRaise === "all_in" ? "chosen" : ""} onClick={onAllIn}>5bet 100BB</button>
        </div> : <span className="action-seat-summary">{pendingRaise === "all_in" ? "5bet 100BB" : continuationAction ? continuationAction === "call" ? "Call" : "Fold" : "Take action"}</span>}
      </div>}
      {pendingActors.map(position => <div className="action-seat action-seat-continuation" key={`pending-${position}`}>
        <div className="action-seat-heading"><strong>{position}</strong><span>再応答</span></div>
        <span className="action-seat-summary action-path-pending">推定レンジ準備中</span>
      </div>)}
    </div>
  </div>;
}

export function EstimatedRanges({ initialRangeType = "response", fourBet = fourBetState }) {
  const [initialSelection] = useState(() => restoredSelection(initialRangeType));
  const [rangeType, setRangeType] = useState(initialSelection.rangeType);
  const isOpening = rangeType === "open";
  const isThreeBet = rangeType === "three_bet";
  const isFourBet = rangeType === "four_bet";
  const isComparison = rangeType === "response";
  const [opener, setOpener] = useState(initialSelection.opener);
  const [hero, setHero] = useState(initialSelection.hero);
  const [focusedRange, setFocusedRange] = useState(null);
  const [pathExpanded, setPathExpanded] = useState(initialSelection.pathExpanded);
  const [callers, setCallers] = useState(initialSelection.callers);
  const [foldedHero, setFoldedHero] = useState(initialSelection.foldedHero);
  const [pendingRaise, setPendingRaise] = useState(initialSelection.pendingRaise);
  const [continuationAction, setContinuationAction] = useState(initialSelection.continuationAction);
  const [localEstimate, setLocalEstimate] = useState(null);
  const [localStatus, setLocalStatus] = useState(initialSelection.rangeType === "response" && initialSelection.callers.length > 0 && !initialSelection.foldedHero ? "checking" : "idle");
  const [localError, setLocalError] = useState("");
  // `hero` is the later seat selector: the 3-bettor when the opener acts again.
  const [selected, setSelected] = useState(initialSelection.selected);
  const currentError = isFourBet ? fourBet.error : isOpening ? openingDataError : isThreeBet ? threeBetDataError : dataError || openingDataError;
  const openerSpot = openingDataset ? findOpeningSpot(openingDataset, opener) : null;
  const openerModel = useMemo(() => openerSpot ? openingMatrixModel(openerSpot) : null, [openerSpot]);
  const spot = isOpening
    ? openingDataset ? findOpeningSpot(openingDataset, opener) : null
    : isFourBet ? fourBet.data ? findFourBetSpot(fourBet.data, opener, hero) : null
    : isThreeBet ? threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null
    : dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? (isOpening ? openingMatrixModel(spot) : isFourBet ? fourBetMatrixModel(spot, findSpot(dataset, opener, hero)) : isThreeBet ? threeBetMatrixModel(spot) : matrixModel(spot)) : null, [spot, isOpening, isThreeBet, isFourBet, opener, hero]);
  function resetPath() {
    setRangeType("response");
    setOpener("BTN");
    setHero("BB");
    setCallers([]);
    setFoldedHero(false);
    setPendingRaise(null);
    setContinuationAction(null);
    setFocusedRange(null);
    setSelected("AKo");
    setLocalEstimate(null);
    setLocalStatus("idle");
    setLocalError("");
  }
  function changeOpener(value) {
    setOpener(value);
    setRangeType("open");
    setPendingRaise(null);
    setContinuationAction(null);
    setFocusedRange(null);
    const nextHeroes = availableHeroes(value).filter(position => hasSpot(dataset, value, position));
    if (!nextHeroes.includes(hero)) setHero(nextHeroes[0] ?? "");
    setCallers([]);
    setFoldedHero(false);
  }

  function changeHero(value) {
    setHero(value);
    if (isOpening) setRangeType("response");
    setPendingRaise(null);
    setContinuationAction(null);
    setFocusedRange(null);
    setFoldedHero(false);
    setCallers(previous => previous.filter(position => position !== value && positions.indexOf(position) > positions.indexOf(opener)));
  }

  function callAt(position) {
    setPendingRaise(null);
    setContinuationAction(null);
    setCallers(previous => [...new Set([...previous, position])]);
    if (position === hero) setFoldedHero(true);
    setFocusedRange(null);
  }

  function foldAt(position) {
    setPendingRaise(null);
    setContinuationAction(null);
    setCallers(previous => previous.filter(item => item !== position));
    if (position === hero) setFoldedHero(true);
    setFocusedRange(null);
  }

  function selectThreeBet() {
    if (callers.length) setPendingRaise("squeeze");
    else { setRangeType("three_bet"); setPendingRaise(null); }
    setContinuationAction(null);
    setFocusedRange(null);
  }

  function selectFourBet() {
    setRangeType("four_bet");
    setPendingRaise(null);
    setContinuationAction(null);
    setFocusedRange(null);
  }

  const multiwayParticipants = [opener, ...callers, ...(!foldedHero && !callers.includes(hero) ? [hero] : [])];
  const showPendingRanges = isComparison && callers.some(position => position !== hero);
  const canGenerate = isComparison && !foldedHero && callers.length > 0 && callers.every(position => positions.indexOf(position) < positions.indexOf(hero));
  const requestKey = JSON.stringify({ opener, hero, callers: [...callers].sort((a, b) => positions.indexOf(a) - positions.indexOf(b)) });
  const currentRequestKey = useRef(requestKey);
  currentRequestKey.current = requestKey;
  useEffect(() => {
    window.sessionStorage.setItem(selectionStorageKey, JSON.stringify({ rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, pathExpanded, selected }));
  }, [rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, pathExpanded, selected]);
  useEffect(() => { setLocalEstimate(null); setLocalStatus(canGenerate ? "checking" : "idle"); setLocalError(""); }, [requestKey, rangeType, foldedHero]);
  useEffect(() => {
    if (!canGenerate) return;
    let cancelled = false;
    let timer;
    async function refresh() {
      try {
        const response = await fetch(`/local-estimates?request=${encodeURIComponent(requestKey)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "保存状態を確認できません。");
        if (cancelled) return;
        if (result.data) { setLocalEstimate(result.data); setLocalStatus("cached"); return; }
        if (result.pending) { setLocalStatus("loading"); timer = window.setTimeout(refresh, 1500); return; }
        setLocalStatus(current => current === "loading" ? current : "idle");
      } catch (error) { if (!cancelled) { setLocalStatus("error"); setLocalError(error.message); } }
    }
    refresh();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [requestKey, rangeType, foldedHero, canGenerate]);
  async function generateLocalEstimate() {
    const submittedKey = requestKey;
    setLocalStatus("loading"); setLocalError("");
    try {
      const response = await fetch("/local-estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestKey });
      const result = await response.json();
      if (submittedKey !== currentRequestKey.current) return;
      if (!response.ok || !result.data) throw new Error(result.error || "ローカル生成に接続できません。画面を再読み込みしてください。");
      setLocalEstimate(result.data); setLocalStatus(result.cached ? "cached" : "generated");
    } catch (error) { if (submittedKey === currentRequestKey.current) { setLocalStatus("error"); setLocalError(error.message); } }
  }
  const localMatrix = range => ({ actions: ["raise", "call", "fold"], aggregates: new Map(range.rows.map(([hand, fold, call, raise]) => [hand, {
    hand, comboCount: hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12,
    actions: { fold: fold / 100, call: call / 100, raise: raise / 100 },
  }])) });
  const responseSpot = !isOpening && dataset ? findSpot(dataset, opener, hero) : null;
  const responseModel = responseSpot ? matrixModel(responseSpot) : null;
  const threeBetSpot = (isThreeBet || isFourBet) && threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null;
  const threeBetModel = threeBetSpot ? threeBetMatrixModel(threeBetSpot) : null;
  const rangeEntries = [];
  const addSaved = (position, kind, savedSpot, savedModel, title) => rangeEntries.push({ position, kind, spot: savedSpot, model: savedModel, title, hand: savedSpot?.hands.find(row => row.hand === selected) });
  if (isOpening) {
    addSaved(opener, "opening", openerSpot, openerModel, `${opener} · オープンレンジ`);
  } else if (isComparison) {
    const activeSeats = positions.filter(position => multiwayParticipants.includes(position));
    for (const position of activeSeats) {
      if (pendingRaise === "squeeze" && position !== hero) {
        rangeEntries.push({ position, kind: "pending", title: `${position} · スクイーズへの応答`, statusTitle: "レンジ未収録", statusDescription: "スクイーズ後の応答データはまだ保存されていません。" });
      } else if (position === opener) addSaved(position, "opening", openerSpot, openerModel, `${position} · オープンレンジ`);
      else if (!showPendingRanges && position === hero) addSaved(position, "response", responseSpot, responseModel, `${position} · オープンへの応答`);
      else {
        const localRange = localEstimate?.ranges.find(range => range.position === position);
        rangeEntries.push(localRange ? { position, kind: "local", model: localMatrix(localRange), title: `${position} · ${pendingRaise === "squeeze" ? "スクイーズ選択" : position === hero ? "現在の応答" : "コール選択"}（AI推定・レイズ先 ${localRange.raise_to_bb}BB）`, raiseToBb: localRange.raise_to_bb } : { position, kind: "pending", title: `${position} · 推定レンジ準備中`, statusTitle: "レンジ未収録", statusDescription: pendingRaise === "squeeze" ? "この局面の推定レンジはまだ生成・保存されていません。" : "この履歴のレンジはまだ保存されていません。" });
      }
    }
  } else if (isThreeBet) {
    if (continuationAction !== "fold") addSaved(opener, "three_bet", spot, model, `${opener} · 3betへの応答`);
    addSaved(hero, "response", responseSpot, responseModel, `${hero} · オープンへの応答（3bet前）`);
  } else if (isFourBet) {
    if (pendingRaise === "all_in") {
      rangeEntries.push({ position: opener, kind: "pending", title: `${opener} · 5betオールインへの応答`, statusTitle: "レンジ未収録", statusDescription: "5betオールイン後の応答データはまだ保存されていません。" });
      addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答（5bet選択）`);
    } else {
      addSaved(opener, "three_bet", threeBetSpot, threeBetModel, `${opener} · 3betへの応答（4bet前）`);
      if (continuationAction !== "fold") addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答`);
    }
  }
  const focusedEntry = rangeEntries.find(entry => entry.position === focusedRange && entry.model);
  const displayedEntries = focusedEntry ? [focusedEntry] : rangeEntries;

  return <div className="shell">
    <Sidebar activeSection="プリフロップ" onSectionChange={() => {}} />
    <main>
      <Panel className="estimate-settings">
          <div className="estimate-settings-intro"><div><h2>推定レンジ</h2><small>6max Cash · 100BB · Open 2.5BB · アンティなし</small></div><div className="path-controls"><button type="button" className="path-reset" onClick={resetPath}>リセット</button><button type="button" className="path-toggle" aria-expanded={pathExpanded} aria-label={pathExpanded ? "アクション選択を閉じる" : "アクション選択を開く"} onClick={() => setPathExpanded(value => !value)}>{pathExpanded ? "選択を閉じる" : "アクションを選ぶ"}<span aria-hidden="true">{pathExpanded ? "−" : "+"}</span></button></div></div>
          <ActionPath expanded={pathExpanded} rangeType={rangeType} opener={opener} hero={hero} spot={spot} callers={callers} foldedHero={foldedHero} raiseToBb={localEstimate?.ranges.find(range => range.position === hero)?.raise_to_bb} pendingRaise={pendingRaise} continuationAction={continuationAction} onOpenerChange={changeOpener} onHeroChange={changeHero} onCall={callAt} onFold={foldAt} onThreeBet={selectThreeBet} onFourBet={selectFourBet} onAllIn={() => { setContinuationAction(null); setFocusedRange(null); setPendingRaise("all_in"); }} onContinuationAction={action => { setPendingRaise(null); setFocusedRange(null); setContinuationAction(action); }} />
        </Panel>
        {currentError ? <StatusState tone="error">{currentError}</StatusState> : <>
        <div className="estimate-context">
          <strong>{isOpening ? `${opener} Open · 2.5BB` : isFourBet ? `${opener} Open 2.5BB → ${hero} 3bet ${spot.three_bet_size_bb}BB → ${opener} 4bet ${spot.four_bet_size_bb}BB → ${hero}（元の3bettor / Hero）の応答 · ${spot.hero_position_vs_opener}` : isThreeBet ? `${opener}（Hero）Open 2.5BB → ${hero} 3bet ${spot.three_bet_size_bb}BB → ${opener}の応答 · ${spot.hero_position_vs_three_bettor}` : showPendingRanges ? `${opener} Open 2.5BB${callers.map(position => ` → ${position} Call`).join("")}${foldedHero && !callers.includes(hero) ? ` → ${hero} Fold` : !callers.includes(hero) ? ` → ${hero} Action` : ""} · ${multiwayParticipants.length}人参加` : `${hero} vs ${opener} · ${spot.hero_position_vs_opener}`}</strong>
          <span>{isOpening ? "全5ポジション" : "全15局面"} / 各169ハンド · 推定データ・GTO計算なし</span>
        </div>
        {showPendingRanges && !pendingRaise && <div className="local-estimate-control"><small>マルチウェイは未検証のAI推定です。既存データは変更しません。</small>{canGenerate && <button type="button" disabled={localStatus === "loading" || localStatus === "checking"} onClick={generateLocalEstimate}>{localStatus === "checking" ? "保存状態を確認中…" : localStatus === "loading" ? "Codexで生成中…" : localEstimate ? "保存済みレンジを表示中" : "Codexで推定レンジを生成"}</button>}</div>}
        {localError && showPendingRanges && !pendingRaise && <StatusState tone="error">{localError}</StatusState>}
        <div className={`results estimate-results participant-results${focusedEntry ? " comparison-focused" : ""}`} aria-label="参加中のレンジ" style={{ "--participant-count": displayedEntries.length }}>
          {displayedEntries.map(entry => entry.model ? <StrategyMatrix key={entry.position} node={{ actingPosition: entry.position }} title={entry.title} ariaLabel={`${entry.position}のレンジ`} aggregates={entry.model.aggregates} actions={entry.model.actions} selected={selected} onSelect={value => { setSelected(value); setFocusedRange(entry.position); }} /> : <Panel key={entry.position} className="multiway-range-panel missing-range-panel" aria-label={`${entry.position}のレンジ`}><SectionHeading title={entry.title} /><StatusState title={entry.statusTitle || "レンジ未収録"}>{entry.statusDescription || "この履歴のレンジはまだ保存されていません。"}</StatusState></Panel>)}
          {focusedEntry && (focusedEntry.kind === "local" ? <LocalHandBreakdown entry={focusedEntry} selected={selected} onClose={() => setFocusedRange(null)} /> : <HandBreakdown title={`${focusedEntry.position} · ${selected}の詳細`} hand={focusedEntry.hand} model={focusedEntry.model} isOpening={focusedEntry.kind === "opening"} isThreeBet={focusedEntry.kind === "three_bet"} isFourBet={focusedEntry.kind === "four_bet"} spot={focusedEntry.spot} position={focusedEntry.position} onReturnToComparison={() => setFocusedRange(null)} />)}
        </div>
      </>}
      <AppFooter />
    </main>
  </div>;
}

export function RangeWorkspace() {
  return <EstimatedRanges />;
}
